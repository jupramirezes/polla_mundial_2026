'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

const RoundEnum = z.enum(['r16', 'qf', 'sf', 'final']);
const MAX_PER_ROUND: Record<z.infer<typeof RoundEnum>, number> = {
  r16: 16, qf: 8, sf: 4, final: 2,
};

const toggleSchema = z.object({
  round: RoundEnum,
  teamId: z.number().int().positive(),
});

async function isBracketLocked(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('bracket_locked_at')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { bracket_locked_at?: string | null } | null)?.bracket_locked_at;
}

/** Toggle de equipo para una ronda. Rechaza si el bracket ya está bloqueado (a menos que admin). */
export async function toggleQualifier(input: z.infer<typeof toggleSchema>) {
  const parsed = toggleSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado. Si necesitas cambios, contacta al admin.' };
  }

  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();

  const { data: existing } = await client
    .from('predictions_qualifiers')
    .select('team_id')
    .eq('user_id', me.id)
    .eq('round', parsed.round)
    .eq('team_id', parsed.teamId)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from('predictions_qualifiers')
      .delete()
      .eq('user_id', me.id)
      .eq('round', parsed.round)
      .eq('team_id', parsed.teamId);
    if (error) return { error: error.message };
    return { ok: true, action: 'removed' as const };
  }

  const { count } = await client
    .from('predictions_qualifiers')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', me.id)
    .eq('round', parsed.round);

  if ((count ?? 0) >= MAX_PER_ROUND[parsed.round]) {
    return {
      error: `Ya tienes ${MAX_PER_ROUND[parsed.round]} equipos elegidos para esta ronda. Quita uno antes.`,
    };
  }

  const { error } = await client
    .from('predictions_qualifiers')
    .insert({
      user_id: me.id,
      round: parsed.round,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true, action: 'added' as const };
}

const positionSchema = z.object({
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive().nullable(),
});

export async function saveTopPosition(input: z.infer<typeof positionSchema>) {
  const parsed = positionSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado.' };
  }
  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();

  if (parsed.teamId == null) {
    const { error } = await client
      .from('predictions_top_positions')
      .delete()
      .eq('user_id', me.id)
      .eq('position', parsed.position);
    if (error) return { error: error.message };
    return { ok: true };
  }
  const { error } = await client
    .from('predictions_top_positions')
    .upsert({
      user_id: me.id,
      position: parsed.position,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function saveTopScorer(name: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado.' };
  }
  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();

  const cleaned = name.trim();
  if (cleaned === '') {
    const { error } = await client
      .from('predictions_top_scorer')
      .delete()
      .eq('user_id', me.id);
    if (error) return { error: error.message };
    return { ok: true };
  }
  const { error } = await client
    .from('predictions_top_scorer')
    .upsert({
      user_id: me.id,
      player_name: cleaned,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

/** "Confirmar mi bracket": valida que esté completo y bloquea. */
export async function lockBracket() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  const supa = getSupabaseAdminClient();
  // Validar que todo esté completo
  const [
    { count: r16 },
    { count: qf },
    { count: sf },
    { count: finalCount },
    { count: top },
    { data: scorer },
  ] = await Promise.all([
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'r16'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'qf'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'sf'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'final'),
    supa.from('predictions_top_positions').select('position', { count: 'exact', head: true }).eq('user_id', me.id),
    supa.from('predictions_top_scorer').select('player_name').eq('user_id', me.id).maybeSingle(),
  ]);

  const errors: string[] = [];
  if ((r16 ?? 0) !== 16) errors.push(`Octavos: ${r16}/16`);
  if ((qf  ?? 0) !== 8)  errors.push(`Cuartos: ${qf}/8`);
  if ((sf  ?? 0) !== 4)  errors.push(`Semifinales: ${sf}/4`);
  if ((finalCount ?? 0) !== 2) errors.push(`Final: ${finalCount}/2`);
  if ((top ?? 0) !== 4)  errors.push(`Top 4: ${top}/4`);
  const scorerName = (scorer as { player_name?: string } | null)?.player_name;
  if (!scorerName || scorerName.trim() === '') errors.push('Goleador: vacío');

  if (errors.length > 0) {
    return { error: `Falta completar: ${errors.join(' · ')}` };
  }

  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) return { error: error.message };

  return { ok: true };
}

/** Admin-only: reset del lock para un usuario específico. */
export async function adminUnlockBracket(userId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: null })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { ok: true };
}

// =====================================================================
// 🧪 TESTING ONLY — borrar antes de mandar a participantes
// =====================================================================

const FAKE_SCORERS = [
  'Lionel Messi', 'Cristiano Ronaldo', 'Kylian Mbappé', 'Erling Haaland',
  'Vinicius Jr', 'Harry Kane', 'Lautaro Martínez', 'Luis Díaz',
  'Bukayo Saka', 'Phil Foden', 'Jamal Musiala', 'Lamine Yamal',
];

/** Admin (testing): rellena mi bracket completo (R16 + QF + SF + Final + Top4 + Goleador).
 *  Asume que ya tienes los 72 marcadores de grupos llenos (para que R32 esté derivado). */
export async function autofillMyBracket() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };

  const supa = getSupabaseAdminClient();

  // 1. Derivar R32 del usuario desde sus marcadores predichos
  const { data: matches } = await supa
    .from('matches')
    .select('id, stage, group_letter, home_team_id, away_team_id')
    .eq('stage', 'group');
  const { data: teams } = await supa.from('teams').select('id, group_letter');
  const { data: predMatches } = await supa
    .from('predictions_matches')
    .select('match_id, home_score, away_score')
    .eq('user_id', me.id);

  // Agrupar predicciones por grupo
  const matchById = new Map<number, { groupLetter: string; homeTeamId: number; awayTeamId: number }>();
  for (const m of matches ?? []) {
    const mm = m as { id: number; group_letter: string | null; home_team_id: number | null; away_team_id: number | null };
    if (!mm.group_letter || !mm.home_team_id || !mm.away_team_id) continue;
    matchById.set(mm.id, {
      groupLetter: mm.group_letter,
      homeTeamId: mm.home_team_id,
      awayTeamId: mm.away_team_id,
    });
  }

  const teamsByGroup = new Map<string, number[]>();
  for (const t of teams ?? []) {
    const tt = t as { id: number; group_letter: string };
    if (!teamsByGroup.has(tt.group_letter)) teamsByGroup.set(tt.group_letter, []);
    teamsByGroup.get(tt.group_letter)!.push(tt.id);
  }

  // Calcular standings por grupo desde las predicciones
  type Stats = { teamId: number; pts: number; dg: number; gf: number };
  const standingsByGroup = new Map<string, Stats[]>();
  for (const [letter, teamIds] of teamsByGroup) {
    const stats = new Map<number, Stats>();
    for (const id of teamIds) stats.set(id, { teamId: id, pts: 0, dg: 0, gf: 0 });
    for (const p of predMatches ?? []) {
      const pp = p as { match_id: number; home_score: number; away_score: number };
      const info = matchById.get(pp.match_id);
      if (!info || info.groupLetter !== letter) continue;
      const h = stats.get(info.homeTeamId)!;
      const a = stats.get(info.awayTeamId)!;
      h.gf += pp.home_score; h.dg += pp.home_score - pp.away_score;
      a.gf += pp.away_score; a.dg += pp.away_score - pp.home_score;
      if (pp.home_score > pp.away_score) h.pts += 3;
      else if (pp.home_score < pp.away_score) a.pts += 3;
      else { h.pts += 1; a.pts += 1; }
    }
    const sorted = Array.from(stats.values()).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamId - b.teamId;
    });
    standingsByGroup.set(letter, sorted);
  }

  // R32 derivado: top 2 + 8 mejores 3ros (Pts → DG → GF)
  const r32 = new Set<number>();
  const thirds: Stats[] = [];
  for (const [, s] of standingsByGroup) {
    if (s[0]) r32.add(s[0].teamId);
    if (s[1]) r32.add(s[1].teamId);
    if (s[2]) thirds.push(s[2]);
  }
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamId - b.teamId;
  });
  for (const t of thirds.slice(0, 8)) r32.add(t.teamId);

  if (r32.size < 32) {
    return { error: `No hay suficientes datos en grupos para derivar R32 (${r32.size}/32). Llena primero los 72 marcadores de grupos.` };
  }

  function pickRandomN<T>(arr: T[], n: number): T[] {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  }

  const r16Picks = pickRandomN(Array.from(r32), 16);
  const qfPicks  = pickRandomN(r16Picks, 8);
  const sfPicks  = pickRandomN(qfPicks, 4);
  const finalPicks = pickRandomN(sfPicks, 2);
  const topOrder = pickRandomN(sfPicks, 4);  // los 4 semifinalistas reordenados

  // Borrar lo previo
  await Promise.all([
    supa.from('predictions_qualifiers').delete().eq('user_id', me.id),
    supa.from('predictions_top_positions').delete().eq('user_id', me.id),
    supa.from('predictions_top_scorer').delete().eq('user_id', me.id),
  ]);

  // Insertar
  const qualifierRows = [
    ...r16Picks.map((id) => ({ user_id: me.id, round: 'r16', team_id: id })),
    ...qfPicks.map((id) => ({ user_id: me.id, round: 'qf', team_id: id })),
    ...sfPicks.map((id) => ({ user_id: me.id, round: 'sf', team_id: id })),
    ...finalPicks.map((id) => ({ user_id: me.id, round: 'final', team_id: id })),
  ];
  const topRows = topOrder.slice(0, 4).map((id, i) => ({
    user_id: me.id,
    position: i + 1,
    team_id: id,
  }));

  const { error: e1 } = await supa.from('predictions_qualifiers').insert(qualifierRows);
  if (e1) return { error: e1.message };
  const { error: e2 } = await supa.from('predictions_top_positions').insert(topRows);
  if (e2) return { error: e2.message };
  const { error: e3 } = await supa.from('predictions_top_scorer').insert({
    user_id: me.id,
    player_name: FAKE_SCORERS[Math.floor(Math.random() * FAKE_SCORERS.length)],
  });
  if (e3) return { error: e3.message };

  return { ok: true };
}

/** Admin (testing): borra todos MIS pronósticos (grupos + bracket + KO + lock). */
export async function clearMyPredictions() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };

  const supa = getSupabaseAdminClient();
  await Promise.all([
    supa.from('predictions_matches').delete().eq('user_id', me.id),
    supa.from('predictions_knockout_matches').delete().eq('user_id', me.id),
    supa.from('predictions_qualifiers').delete().eq('user_id', me.id),
    supa.from('predictions_top_positions').delete().eq('user_id', me.id),
    supa.from('predictions_top_scorer').delete().eq('user_id', me.id),
  ]);
  await supa.from('profiles').update({ bracket_locked_at: null }).eq('id', me.id);
  return { ok: true };
}
