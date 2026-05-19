'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, getAdminCount } from '@/lib/auth';
import { recomputeAllUserScores } from '@/lib/scoring/recompute';
import { revalidatePath } from 'next/cache';

/** Si no hay ningún admin todavía, el usuario actual se autoasigna como admin. */
export async function claimAdminIfFirst() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  const count = await getAdminCount();
  if (count > 0) return { error: 'ya existe un admin' };

  const supaAdmin = getSupabaseAdminClient();
  const { error } = await supaAdmin
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', me.id);

  if (error) return { error: error.message };
  revalidatePath('/');
  return { ok: true };
}

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' as const };
  if (!me.isAdmin) return { error: 'no autorizado' as const };
  return { ok: true as const, user: me };
}

const matchResultSchema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20).nullable(),
  awayScore: z.number().int().min(0).max(20).nullable(),
});

/** Admin: guarda el resultado oficial de un partido (grupo o eliminatoria). */
export async function saveMatchResult(input: z.infer<typeof matchResultSchema>) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const parsed = matchResultSchema.parse(input);
  const supa = getSupabaseAdminClient();

  // Si los dos scores son null, "limpia" el resultado
  const update = parsed.homeScore == null || parsed.awayScore == null
    ? { home_score: null, away_score: null, winner_team_id: null }
    : {
        home_score: parsed.homeScore,
        away_score: parsed.awayScore,
        // Para KO, registra ganador si no es empate (en empate no se permite en KO, pero
        // dejamos el manejo al admin: si pone empate en KO, winner queda null)
      };

  const { error } = await supa
    .from('matches')
    .update(update)
    .eq('id', parsed.matchId);
  if (error) return { error: error.message };

  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: 'guardado, pero falló recálculo: ' + recomp.error };

  revalidatePath('/admin');
  revalidatePath('/ranking');
  return { ok: true, recomputedUsers: recomp.users };
}

/** Admin: asigna los equipos a un partido de eliminatoria (cuando se conocen los pairings). */
const matchTeamsSchema = z.object({
  matchId: z.number().int().positive(),
  homeTeamId: z.number().int().positive().nullable(),
  awayTeamId: z.number().int().positive().nullable(),
});
export async function setMatchTeams(input: z.infer<typeof matchTeamsSchema>) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const parsed = matchTeamsSchema.parse(input);
  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('matches')
    .update({ home_team_id: parsed.homeTeamId, away_team_id: parsed.awayTeamId })
    .eq('id', parsed.matchId);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { ok: true };
}

/** Admin: agrega/quita un equipo de official_qualifiers para una ronda. */
const qualSchema = z.object({
  round: z.enum(['r32', 'r16', 'qf', 'sf', 'final']),
  teamId: z.number().int().positive(),
  passes: z.boolean(),
});
export async function setOfficialQualifier(input: z.infer<typeof qualSchema>) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const parsed = qualSchema.parse(input);
  const supa = getSupabaseAdminClient();
  if (parsed.passes) {
    const { error } = await supa
      .from('official_qualifiers')
      .upsert({ round: parsed.round, team_id: parsed.teamId });
    if (error) return { error: error.message };
  } else {
    const { error } = await supa
      .from('official_qualifiers')
      .delete()
      .eq('round', parsed.round)
      .eq('team_id', parsed.teamId);
    if (error) return { error: error.message };
  }
  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: recomp.error };
  revalidatePath('/admin');
  revalidatePath('/ranking');
  return { ok: true };
}

/** Admin: setea una posición final del top 4. */
const topPosSchema = z.object({
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive().nullable(),
});
export async function setOfficialTopPosition(input: z.infer<typeof topPosSchema>) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const parsed = topPosSchema.parse(input);
  const supa = getSupabaseAdminClient();
  if (parsed.teamId == null) {
    const { error } = await supa.from('official_top_positions').delete().eq('position', parsed.position);
    if (error) return { error: error.message };
  } else {
    const { error } = await supa
      .from('official_top_positions')
      .upsert({ position: parsed.position, team_id: parsed.teamId });
    if (error) return { error: error.message };
  }
  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: recomp.error };
  revalidatePath('/admin');
  revalidatePath('/ranking');
  return { ok: true };
}

/** Admin: setea (o quita) un goleador oficial. */
const scorerSchema = z.object({
  playerName: z.string().min(1).max(120),
  goals: z.number().int().min(0).max(100),
  remove: z.boolean().optional(),
});
export async function setOfficialScorer(input: z.infer<typeof scorerSchema>) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const parsed = scorerSchema.parse(input);
  const supa = getSupabaseAdminClient();
  if (parsed.remove) {
    const { error } = await supa.from('official_top_scorers').delete().eq('player_name', parsed.playerName);
    if (error) return { error: error.message };
  } else {
    const { error } = await supa
      .from('official_top_scorers')
      .upsert({ player_name: parsed.playerName, goals: parsed.goals });
    if (error) return { error: error.message };
  }
  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: recomp.error };
  revalidatePath('/admin');
  revalidatePath('/ranking');
  return { ok: true };
}

/** Forzar un recálculo manual (por si algo se desincronizó). */
export async function forceRecompute() {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const r = await recomputeAllUserScores();
  revalidatePath('/admin');
  revalidatePath('/ranking');
  return r;
}

/** Admin (testing): llena los 72 partidos de fase de grupos con marcadores
 *  aleatorios. Sobreescribe lo que haya. Útil para probar el sistema sin
 *  tener que meter 72 marcadores a mano. */
export async function autofillGroupStageResults() {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supa = getSupabaseAdminClient();
  const { data: matches, error: e1 } = await supa
    .from('matches')
    .select('id')
    .eq('stage', 'group');
  if (e1) return { error: e1.message };

  // Generador de marcadores realistas: 0-3 goles por equipo (poisson-ish)
  function randomScore(): number {
    const r = Math.random();
    if (r < 0.30) return 0;
    if (r < 0.65) return 1;
    if (r < 0.85) return 2;
    if (r < 0.95) return 3;
    return 4;
  }

  const updates = (matches ?? []).map((m) => ({
    id: (m as { id: number }).id,
    home_score: randomScore(),
    away_score: randomScore(),
  }));

  // Postgres upsert no soporta múltiples updates en una llamada nativa con
  // partial updates de matches. Hago un loop pequeño (72 calls); para el caso
  // de uso admin de testing está bien.
  for (const u of updates) {
    const { error } = await supa
      .from('matches')
      .update({ home_score: u.home_score, away_score: u.away_score })
      .eq('id', u.id);
    if (error) return { error: error.message };
  }

  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: recomp.error };

  revalidatePath('/admin/resultados');
  revalidatePath('/ranking');
  return { ok: true, updated: updates.length };
}

/** Admin (testing): borra todos los marcadores oficiales de fase de grupos. */
export async function clearGroupStageResults() {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('matches')
    .update({ home_score: null, away_score: null, winner_team_id: null })
    .eq('stage', 'group');
  if (error) return { error: error.message };

  const recomp = await recomputeAllUserScores();
  if (!recomp.ok) return { error: recomp.error };
  revalidatePath('/admin/resultados');
  revalidatePath('/ranking');
  return { ok: true };
}
