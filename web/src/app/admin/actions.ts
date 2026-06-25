'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, getAdminCount } from '@/lib/auth';
import { recomputeAllUserScores } from '@/lib/scoring/recompute';
import { buildOfficialR32 } from '@/lib/official-bracket';
import type { MatchScore } from '@/lib/standings';
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

  // Auto-armar el cuadro oficial (R32 de grupos cerrados + cascada KO) sin pisar
  // asignaciones existentes. Best-effort: nunca debe romper el guardado del resultado.
  try { await fillOfficialBracket(supa, false); } catch { /* no-op */ }

  revalidatePath('/admin');
  revalidatePath('/admin/eliminatorias');
  revalidatePath('/pronosticos/eliminatorias');
  revalidatePath('/resumen');
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

  // Validación: no permitir mismo equipo contra sí mismo
  if (parsed.homeTeamId && parsed.awayTeamId && parsed.homeTeamId === parsed.awayTeamId) {
    return { error: 'No puedes asignar el mismo equipo como local y visitante.' };
  }

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('matches')
    .update({ home_team_id: parsed.homeTeamId, away_team_id: parsed.awayTeamId })
    .eq('id', parsed.matchId);
  if (error) return { error: error.message };
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Admin: autogenera los cruces de R32 (y siguientes rondas si tienen resultados)
 * a partir de los resultados oficiales de la fase de grupos + Anexo C de FIFA.
 */
export async function autoGenerateKnockoutPairings() {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const supa = getSupabaseAdminClient();
  // Botón "Autogenerar": fuerza re-derivar TODO el cuadro desde los resultados.
  const r = await fillOfficialBracket(supa, true);
  if ('error' in r) return { error: r.error };
  revalidatePath('/admin/eliminatorias');
  revalidatePath('/admin/resultados');
  revalidatePath('/pronosticos/eliminatorias');
  revalidatePath('/resumen');
  return { ok: true, ...r };
}

/**
 * Llena/actualiza el cuadro OFICIAL en la tabla `matches` a partir de los RESULTADOS:
 *   - R32: 1° y 2° de cada grupo CERRADO entran de inmediato (incremental); los 8
 *     mejores 3ros se ubican (Anexo C) cuando cierran los 12. Reutiliza buildOfficialR32,
 *     así la pantalla /resumen "Cuadro" y lo persistido siempre coinciden.
 *   - R16 → Final: cascada desde los ganadores oficiales de cada ronda.
 * overwrite=true regenera todo; overwrite=false solo rellena llaves vacías (preserva
 * ajustes manuales). Idempotente. Lo llama el botón (true) y saveMatchResult (false).
 */
async function fillOfficialBracket(
  supa: ReturnType<typeof getSupabaseAdminClient>,
  overwrite: boolean,
): Promise<{ r32: number; r16: number; qf: number; sf: number; tp: number; final: number } | { error: string }> {
  type Row = { id: number; external_code: string; stage: string; group_letter: string | null; home_team_id: number | null; away_team_id: number | null; home_score: number | null; away_score: number | null };
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supa.from('teams').select('id, group_letter'),
    supa.from('matches').select('id, external_code, stage, group_letter, home_team_id, away_team_id, home_score, away_score'),
  ]);

  const teamsByGroup = new Map<string, number[]>();
  for (const t of (teams ?? []) as Array<{ id: number; group_letter: string | null }>) {
    if (!t.group_letter) continue;
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }
  const byExt = new Map<string, Row>();
  const officialMatchesByGroup = new Map<string, MatchScore[]>();
  for (const m of (matches ?? []) as Row[]) {
    byExt.set(m.external_code, m);
    if (m.stage === 'group' && m.group_letter && m.home_team_id && m.away_team_id) {
      if (!officialMatchesByGroup.has(m.group_letter)) officialMatchesByGroup.set(m.group_letter, []);
      officialMatchesByGroup.get(m.group_letter)!.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score, awayScore: m.away_score });
    }
  }

  // Setea los equipos de una llave. En modo no-overwrite preserva lo ya puesto (manual).
  const setTeams = async (row: Row | undefined, home: number | null, away: number | null): Promise<boolean> => {
    if (!row) return false;
    const newHome = overwrite ? home : (row.home_team_id ?? home);
    const newAway = overwrite ? away : (row.away_team_id ?? away);
    if (newHome === row.home_team_id && newAway === row.away_team_id) return false;
    const { error } = await supa.from('matches').update({ home_team_id: newHome, away_team_id: newAway }).eq('id', row.id);
    if (error) throw new Error(error.message);
    row.home_team_id = newHome;
    row.away_team_id = newAway;
    return true;
  };

  try {
    // --- R32 desde resultados de grupos (incremental + Anexo C al cerrar los 12) ---
    let r32 = 0;
    const view = buildOfficialR32(teamsByGroup, officialMatchesByGroup, new Map());
    for (const vm of view.matches) {
      if (await setTeams(byExt.get(vm.code), vm.slotA.teamId, vm.slotB.teamId)) r32++;
    }

    // --- Cascada R16 → Final desde los ganadores oficiales de cada ronda ---
    const winnerOf = (m?: Row): number | null => {
      if (!m || m.home_score == null || m.away_score == null) return null;
      if (m.home_score > m.away_score) return m.home_team_id;
      if (m.away_score > m.home_score) return m.away_team_id;
      return null;
    };
    const loserOf = (m?: Row): number | null => {
      if (!m || m.home_score == null || m.away_score == null) return null;
      if (m.home_score < m.away_score) return m.home_team_id;
      if (m.away_score < m.home_score) return m.away_team_id;
      return null;
    };
    const R16: Record<string, [string, string]> = { 'R16-01': ['R32-02', 'R32-05'], 'R16-02': ['R32-01', 'R32-03'], 'R16-03': ['R32-04', 'R32-06'], 'R16-04': ['R32-07', 'R32-08'], 'R16-05': ['R32-11', 'R32-12'], 'R16-06': ['R32-09', 'R32-10'], 'R16-07': ['R32-14', 'R32-16'], 'R16-08': ['R32-13', 'R32-15'] };
    const QF: Record<string, [string, string]> = { 'QF-01': ['R16-01', 'R16-02'], 'QF-02': ['R16-05', 'R16-06'], 'QF-03': ['R16-03', 'R16-04'], 'QF-04': ['R16-07', 'R16-08'] };
    const SF: Record<string, [string, string]> = { 'SF-01': ['QF-01', 'QF-02'], 'SF-02': ['QF-03', 'QF-04'] };
    const FINAL: Record<string, [string, string]> = { 'FINAL-01': ['SF-01', 'SF-02'] };
    const TP: Record<string, [string, string]> = { 'TP-01': ['SF-01', 'SF-02'] };

    const advance = async (roundMap: Record<string, [string, string]>, useLosers = false): Promise<number> => {
      let n = 0;
      for (const [dest, [a, b]] of Object.entries(roundMap)) {
        const ta = useLosers ? loserOf(byExt.get(a)) : winnerOf(byExt.get(a));
        const tb = useLosers ? loserOf(byExt.get(b)) : winnerOf(byExt.get(b));
        if (await setTeams(byExt.get(dest), ta, tb)) n++;
      }
      return n;
    };

    const r16 = await advance(R16);
    const qf = await advance(QF);
    const sf = await advance(SF);
    const tp = await advance(TP, true);
    const final = await advance(FINAL);
    return { r32, r16, qf, sf, tp, final };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fallo armando el cuadro' };
  }
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

