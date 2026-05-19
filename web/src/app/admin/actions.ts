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
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supa.from('teams').select('id, group_letter'),
    supa.from('matches').select('id, stage, group_letter, external_code, home_team_id, away_team_id, home_score, away_score'),
  ]);

  // Verificar que todos los partidos de grupos tienen resultado
  const groupMatches = (matches ?? []).filter((m) => (m as { stage: string }).stage === 'group');
  const groupMatchesComplete = groupMatches.every((m) => {
    const mm = m as { home_score: number | null; away_score: number | null };
    return mm.home_score != null && mm.away_score != null;
  });
  if (!groupMatchesComplete) {
    return { error: 'Faltan resultados oficiales de grupos. Llena todos los 72 marcadores primero.' };
  }

  // Computar standings oficiales por grupo
  const { computeGroupStandings } = await import('@/lib/standings');
  const teamsByGroup = new Map<string, number[]>();
  for (const t of (teams ?? []) as Array<{ id: number; group_letter: string }>) {
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }

  const standingsByGroup = new Map<string, ReturnType<typeof computeGroupStandings>>();
  for (const [letter, teamIds] of teamsByGroup) {
    const gms = (matches ?? []).filter((m) => {
      const mm = m as { stage: string; group_letter: string | null; home_team_id: number | null; away_team_id: number | null };
      return mm.stage === 'group' && mm.group_letter === letter;
    }).map((m) => {
      const mm = m as { home_team_id: number; away_team_id: number; home_score: number; away_score: number };
      return {
        homeTeamId: mm.home_team_id,
        awayTeamId: mm.away_team_id,
        homeScore: mm.home_score,
        awayScore: mm.away_score,
      };
    });
    standingsByGroup.set(letter, computeGroupStandings(teamIds, gms));
  }

  // 8 mejores 3ros (Pts → DG → GF, regla FIFA)
  type ThirdCand = { groupLetter: string; teamId: number; pts: number; dg: number; gf: number };
  const thirds: ThirdCand[] = [];
  for (const [letter, s] of standingsByGroup) {
    if (s.length < 3) continue;
    const third = s[2];
    thirds.push({ groupLetter: letter, teamId: third.teamId, pts: third.pts, dg: third.dg, gf: third.gf });
  }
  thirds.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamId - b.teamId;
  });
  const best8 = thirds.slice(0, 8);
  const qualifyingGroups = new Set(best8.map((t) => t.groupLetter));
  const thirdByGroup = new Map<string, number>();
  for (const t of best8) thirdByGroup.set(t.groupLetter, t.teamId);

  // Lookup Anexo C
  const { lookupAnnexC, MATCH_FOR_WINNER_VS_THIRD } = await import('@/lib/bracket/annex-c');
  const opt = lookupAnnexC(qualifyingGroups);
  if (!opt) return { error: `No se pudo resolver Anexo C para los terceros ${Array.from(qualifyingGroups).sort().join(',')}` };

  // Construir mapeo: matchNum → (teamA, teamB)
  const slotsOrder = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'];
  const matchByExt = new Map<string, number>();
  for (const m of matches ?? []) {
    const mm = m as { id: number; external_code: string };
    matchByExt.set(mm.external_code, mm.id);
  }

  function teamAtPos(group: string, pos: number): number | undefined {
    const s = standingsByGroup.get(group);
    return s?.find((r) => r.position === pos)?.teamId;
  }

  // Los 16 cruces R32 (8 fijos + 8 con terceros)
  const r32Pairings: Array<{ ext: string; home: number; away: number }> = [];

  // Fijos
  const fixedR32: Array<[string, () => number | undefined, () => number | undefined]> = [
    ['R32-01', () => teamAtPos('A', 2), () => teamAtPos('B', 2)],     // M73
    ['R32-03', () => teamAtPos('F', 1), () => teamAtPos('C', 2)],     // M75
    ['R32-04', () => teamAtPos('C', 1), () => teamAtPos('F', 2)],     // M76
    ['R32-06', () => teamAtPos('E', 2), () => teamAtPos('I', 2)],     // M78
    ['R32-11', () => teamAtPos('K', 2), () => teamAtPos('L', 2)],     // M83
    ['R32-12', () => teamAtPos('H', 1), () => teamAtPos('J', 2)],     // M84
    ['R32-14', () => teamAtPos('J', 1), () => teamAtPos('H', 2)],     // M86
    ['R32-16', () => teamAtPos('D', 2), () => teamAtPos('G', 2)],     // M88
  ];
  for (const [ext, getH, getA] of fixedR32) {
    const h = getH(), a = getA();
    if (h && a) r32Pairings.push({ ext, home: h, away: a });
  }

  // Con terceros: 1A vs 3X, etc.
  const winnerVsThird: Array<[string, string]> = [
    ['R32-02', 'E'],  // M74: 1E vs 3X
    ['R32-05', 'I'],  // M77: 1I vs 3X
    ['R32-07', 'A'],  // M79: 1A vs 3X
    ['R32-08', 'L'],  // M80: 1L vs 3X
    ['R32-09', 'D'],  // M81: 1D vs 3X
    ['R32-10', 'G'],  // M82: 1G vs 3X
    ['R32-13', 'B'],  // M85: 1B vs 3X
    ['R32-15', 'K'],  // M87: 1K vs 3X
  ];
  // opt.thirds[i] dice qué grupo de 3° va contra 1{slotsOrder[i]}
  // MATCH_FOR_WINNER_VS_THIRD[slotsOrder[i]] dice qué match es ese
  for (let i = 0; i < 8; i++) {
    const winnerGroup = slotsOrder[i];        // 'A', 'B', 'D', etc.
    const thirdGroup = opt.thirds[i];          // 'E', 'J', etc.
    const matchNum = MATCH_FOR_WINNER_VS_THIRD[winnerGroup];  // 79, 85, etc.
    const winnerTeam = teamAtPos(winnerGroup, 1);
    const thirdTeam = thirdByGroup.get(thirdGroup);
    if (!winnerTeam || !thirdTeam) continue;
    // Map matchNum to external code
    const idx = matchNum - 72;
    const ext = `R32-${String(idx).padStart(2, '0')}`;
    r32Pairings.push({ ext, home: winnerTeam, away: thirdTeam });
  }

  // Aplicar los R32 pairings
  let updated = 0;
  for (const p of r32Pairings) {
    const matchId = matchByExt.get(p.ext);
    if (!matchId) continue;
    const { error } = await supa
      .from('matches')
      .update({ home_team_id: p.home, away_team_id: p.away })
      .eq('id', matchId);
    if (error) return { error: `R32 ${p.ext}: ${error.message}` };
    updated++;
  }

  // Ahora, si hay resultados de R32, generar R16, etc.
  // Para cada ronda KO, leer ganadores y construir siguiente ronda
  type MatchRow = { id: number; external_code: string; stage: string; home_team_id: number | null; away_team_id: number | null; home_score: number | null; away_score: number | null };

  async function refetchMatches(): Promise<MatchRow[]> {
    const { data } = await supa.from('matches').select('id, external_code, stage, home_team_id, away_team_id, home_score, away_score');
    return (data ?? []) as MatchRow[];
  }

  function winnerOf(m: MatchRow): number | null {
    if (m.home_score == null || m.away_score == null) return null;
    if (m.home_score > m.away_score) return m.home_team_id;
    if (m.away_score > m.home_score) return m.away_team_id;
    return null;  // empate (en KO no debería pasar, pero defensivo)
  }
  function loserOf(m: MatchRow): number | null {
    if (m.home_score == null || m.away_score == null) return null;
    if (m.home_score < m.away_score) return m.home_team_id;
    if (m.away_score < m.home_score) return m.away_team_id;
    return null;
  }

  // Estructura R16 → R32 pairs (R16 ext code → [R32 ext code A, R32 ext code B])
  const r16Map: Record<string, [string, string]> = {
    'R16-01': ['R32-02', 'R32-05'],  // M89 = W74 + W77
    'R16-02': ['R32-01', 'R32-03'],  // M90 = W73 + W75
    'R16-03': ['R32-04', 'R32-06'],  // M91 = W76 + W78
    'R16-04': ['R32-07', 'R32-08'],  // M92 = W79 + W80
    'R16-05': ['R32-11', 'R32-12'],  // M93 = W83 + W84
    'R16-06': ['R32-09', 'R32-10'],  // M94 = W81 + W82
    'R16-07': ['R32-14', 'R32-16'],  // M95 = W86 + W88
    'R16-08': ['R32-13', 'R32-15'],  // M96 = W85 + W87
  };
  const qfMap: Record<string, [string, string]> = {
    'QF-01': ['R16-01', 'R16-02'],
    'QF-02': ['R16-05', 'R16-06'],
    'QF-03': ['R16-03', 'R16-04'],
    'QF-04': ['R16-07', 'R16-08'],
  };
  const sfMap: Record<string, [string, string]> = {
    'SF-01': ['QF-01', 'QF-02'],
    'SF-02': ['QF-03', 'QF-04'],
  };
  const finalMap: Record<string, [string, string]> = {
    'FINAL-01': ['SF-01', 'SF-02'],
  };
  const tpMap: Record<string, [string, string]> = {
    'TP-01': ['SF-01', 'SF-02'],  // perdedores
  };

  async function advanceRound(roundMap: Record<string, [string, string]>, useLosers = false) {
    const all = await refetchMatches();
    const byExt = new Map<string, MatchRow>();
    for (const m of all) byExt.set(m.external_code, m);
    let advanced = 0;
    for (const [destExt, [srcA, srcB]] of Object.entries(roundMap)) {
      const a = byExt.get(srcA);
      const b = byExt.get(srcB);
      if (!a || !b) continue;
      const teamA = useLosers ? loserOf(a) : winnerOf(a);
      const teamB = useLosers ? loserOf(b) : winnerOf(b);
      if (!teamA || !teamB) continue;
      const dest = byExt.get(destExt);
      if (!dest) continue;
      const { error } = await supa
        .from('matches')
        .update({ home_team_id: teamA, away_team_id: teamB })
        .eq('id', dest.id);
      if (error) return -1;
      advanced++;
    }
    return advanced;
  }

  const r16Updated = await advanceRound(r16Map);
  const qfUpdated = await advanceRound(qfMap);
  const sfUpdated = await advanceRound(sfMap);
  const tpUpdated = await advanceRound(tpMap, true);
  const finalUpdated = await advanceRound(finalMap);

  revalidatePath('/admin/eliminatorias');
  revalidatePath('/admin/resultados');
  revalidatePath('/pronosticos/eliminatorias');
  return {
    ok: true,
    r32: updated,
    r16: r16Updated,
    qf: qfUpdated,
    sf: sfUpdated,
    tp: tpUpdated,
    final: finalUpdated,
  };
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
