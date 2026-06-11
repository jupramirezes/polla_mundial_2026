// Recalcula los puntajes de todos los usuarios contra los resultados oficiales.
// Usa el cliente admin (service_role) porque atraviesa las tablas de TODOS los usuarios.

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { computeUserScore } from './aggregate';
import type { AllPredictions, OfficialResults } from './aggregate';
import type { QualifierRound } from './rules';
import { computeGroupStandings } from '@/lib/standings';
import { derivePredictedR32, type UserGroupMatchPred } from '@/lib/predicted-r32';
import { deriveUserBracket } from '@/lib/bracket/derive';
import { fetchAllRows } from '@/lib/supabase/fetch-all';

type MatchRow = {
  id: number;
  stage: string;
  group_letter: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
};

/** Recalcula y persiste user_scores para TODOS los usuarios contra los resultados oficiales actuales. */
export async function recomputeAllUserScores(): Promise<{ ok: true; users: number } | { ok: false; error: string }> {
  const supa = getSupabaseAdminClient();

  // ---- 1. Cargar resultados oficiales ----

  // Partidos con resultado oficial cargado
  const { data: allMatches, error: e1 } = await supa
    .from('matches')
    .select('id, stage, group_letter, home_team_id, away_team_id, home_score, away_score');
  if (e1) return { ok: false, error: e1.message };

  const matchesById = new Map<number, MatchRow>();
  for (const m of (allMatches ?? []) as MatchRow[]) matchesById.set(m.id, m);

  const officialGroupMatches = new Map<number, { homeScore: number; awayScore: number }>();
  const officialKoMatches    = new Map<number, { homeScore: number; awayScore: number }>();
  for (const m of matchesById.values()) {
    if (m.home_score == null || m.away_score == null) continue;
    const entry = { homeScore: m.home_score, awayScore: m.away_score };
    if (m.stage === 'group') officialGroupMatches.set(m.id, entry);
    else                     officialKoMatches.set(m.id, entry);
  }

  // Posiciones oficiales de grupo: las INFERIMOS a partir de los marcadores oficiales
  // (no requerimos que el admin las cargue a mano)
  const teamsByGroup = new Map<string, number[]>();
  {
    const { data: teams } = await supa.from('teams').select('id, group_letter');
    for (const t of (teams ?? []) as Array<{ id: number; group_letter: string }>) {
      if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
      teamsByGroup.get(t.group_letter)!.push(t.id);
    }
  }
  const officialGroupStandings = new Map<string, Array<{ position: 1|2|3|4; teamId: number }>>();
  for (const [letter, teamIds] of teamsByGroup) {
    const groupMatches = Array.from(matchesById.values())
      .filter((m) => m.stage === 'group' && m.group_letter === letter)
      .map((m) => ({
        homeTeamId: m.home_team_id!,
        awayTeamId: m.away_team_id!,
        homeScore: m.home_score,
        awayScore: m.away_score,
      }));
    // Solo calcular si los 6 partidos del grupo tienen resultado
    const allPlayed = groupMatches.every((g) => g.homeScore != null && g.awayScore != null);
    if (!allPlayed) continue;
    const standings = computeGroupStandings(teamIds, groupMatches);
    officialGroupStandings.set(letter, standings.slice(0, 4).map((s) => ({
      position: s.position as 1|2|3|4,
      teamId: s.teamId,
    })));
  }

  // Clasificados oficiales por ronda — derivar primero desde los partidos
  // asignados (cada equipo home/away en un partido R32 es un clasificado a R32),
  // y luego overlay manual desde official_qualifiers (admin override).
  const officialQual: Record<QualifierRound, Set<number>> = {
    r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set(),
  };
  const STAGE_TO_ROUND: Record<string, QualifierRound | undefined> = {
    r32: 'r32', r16: 'r16', qf: 'qf', sf: 'sf', final: 'final',
  };
  for (const m of matchesById.values()) {
    const round = STAGE_TO_ROUND[m.stage];
    if (!round) continue;
    if (m.home_team_id) officialQual[round].add(m.home_team_id);
    if (m.away_team_id) officialQual[round].add(m.away_team_id);
  }
  // Overlay manual (si admin marcó algo extra en /admin/clasificados)
  {
    const { data: rows } = await supa.from('official_qualifiers').select('round, team_id');
    for (const r of (rows ?? []) as Array<{ round: string; team_id: number }>) {
      const round = r.round as QualifierRound;
      if (officialQual[round]) officialQual[round].add(r.team_id);
    }
  }

  // Posiciones finales oficiales (top 4)
  const officialTop: Array<{ position: 1|2|3|4; teamId: number }> = [];
  {
    const { data: rows } = await supa.from('official_top_positions').select('position, team_id');
    for (const r of (rows ?? []) as Array<{ position: number; team_id: number }>) {
      officialTop.push({ position: r.position as 1|2|3|4, teamId: r.team_id });
    }
  }

  // Goleadores oficiales (puede haber varios)
  const officialScorers: string[] = [];
  {
    const { data: rows } = await supa.from('official_top_scorers').select('player_name');
    for (const r of (rows ?? []) as Array<{ player_name: string }>) {
      officialScorers.push(r.player_name);
    }
  }

  const officialResults: OfficialResults = {
    groupMatches:    officialGroupMatches,
    knockoutMatches: officialKoMatches,
    groupStandings:  officialGroupStandings,
    qualifiers:      officialQual,
    topPositions:    officialTop,
    topScorers:      officialScorers,
  };

  // ---- 2. Para cada usuario, cargar predicciones y calcular ----

  const { data: profiles, error: eProf } = await supa
    .from('profiles')
    .select('id, bracket_locked_at');
  if (eProf) return { ok: false, error: eProf.message };

  const userIds = (profiles ?? []).map((p) => (p as { id: string }).id);

  // Set de usuarios que confirmaron su bracket (lock global). Solo estos
  // suman puntos de bracket / goleador. Regla "no cuenta hasta guardar".
  const bracketLockedUsers = new Set<string>();
  for (const p of (profiles ?? []) as Array<{ id: string; bracket_locked_at: string | null }>) {
    if (p.bracket_locked_at) bracketLockedUsers.add(p.id);
  }

  // Cargas batch.
  // - Grupos y KO: filtramos por locked_at IS NOT NULL (regla "no cuenta hasta guardar")
  // - Bracket winners y goleador: cargamos todo, filtramos por bracketLockedUsers más abajo
  const [
    { data: predMatches },
    { data: predKO },
    { data: predQual },
    { data: predTop },
    { data: predScorer },
    { data: predBracketWinners },
  ] = await Promise.all([
    fetchAllRows<{ user_id: string; match_id: number; home_score: number; away_score: number }>(
      (from, to) => supa.from('predictions_matches')
        .select('user_id, match_id, home_score, away_score')
        .not('locked_at', 'is', null)
        .order('user_id').order('match_id').range(from, to)),
    fetchAllRows<{ user_id: string; match_id: number; home_score: number; away_score: number }>(
      (from, to) => supa.from('predictions_knockout_matches')
        .select('user_id, match_id, home_score, away_score')
        .not('locked_at', 'is', null)
        .order('user_id').order('match_id').range(from, to)),
    supa.from('predictions_qualifiers').select('user_id, round, team_id'),
    supa.from('predictions_top_positions').select('user_id, position, team_id'),
    supa.from('predictions_top_scorer').select('user_id, player_name'),
    fetchAllRows<{ user_id: string; match_id: number; winner_team_id: number }>(
      (from, to) => supa.from('predictions_bracket_winners')
        .select('user_id, match_id, winner_team_id')
        .order('user_id').order('match_id').range(from, to)),
  ]);

  // Indexar por user
  const byUser = new Map<string, AllPredictions>();
  function ensure(uid: string): AllPredictions {
    if (!byUser.has(uid)) {
      byUser.set(uid, {
        groupMatches: new Map(),
        knockoutMatches: new Map(),
        groupStandings: new Map(),
        qualifiers: { r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() },
        topPositions: [],
        topScorer: '',
      });
    }
    return byUser.get(uid)!;
  }

  for (const r of (predMatches ?? []) as Array<{ user_id: string; match_id: number; home_score: number; away_score: number }>) {
    ensure(r.user_id).groupMatches.set(r.match_id, { homeScore: r.home_score, awayScore: r.away_score });
  }
  for (const r of (predKO ?? []) as Array<{ user_id: string; match_id: number; home_score: number; away_score: number }>) {
    ensure(r.user_id).knockoutMatches.set(r.match_id, { homeScore: r.home_score, awayScore: r.away_score });
  }
  // Las posiciones de grupo del usuario se DERIVAN de sus marcadores (no se guardan a mano)
  for (const r of (predQual ?? []) as Array<{ user_id: string; round: string; team_id: number }>) {
    const p = ensure(r.user_id);
    const round = r.round as QualifierRound;
    if (p.qualifiers[round]) p.qualifiers[round].add(r.team_id);
  }

  // ---- Derivar R32 de cada usuario desde sus predicciones de grupos ----
  // R32 ya NO se guarda en predictions_qualifiers (es derivado).
  // Necesitamos: matches con info de grupo y equipos
  const groupLetters: string[] = Array.from(teamsByGroup.keys()).sort();
  const matchInfo = new Map<number, { groupLetter: string; homeTeamId: number; awayTeamId: number }>();
  for (const m of matchesById.values()) {
    if (m.stage === 'group' && m.group_letter && m.home_team_id && m.away_team_id) {
      matchInfo.set(m.id, {
        groupLetter: m.group_letter,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
      });
    }
  }

  for (const uid of byUser.keys()) {
    const preds = byUser.get(uid)!;

    // Construir input: marcadores predichos por el usuario por grupo
    const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
    for (const [matchId, score] of preds.groupMatches) {
      const info = matchInfo.get(matchId);
      if (!info) continue;
      if (!matchPredsByGroup.has(info.groupLetter)) matchPredsByGroup.set(info.groupLetter, []);
      matchPredsByGroup.get(info.groupLetter)!.push({
        matchId,
        groupLetter: info.groupLetter,
        homeTeamId: info.homeTeamId,
        awayTeamId: info.awayTeamId,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
      });
    }

    // Derivar standings (1°/2°/3°/4°) del usuario a partir de sus marcadores
    for (const letter of groupLetters) {
      const teamIds = teamsByGroup.get(letter) ?? [];
      const userMatches = (matchPredsByGroup.get(letter) ?? []).map((m) => ({
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore as number | null,
        awayScore: m.awayScore as number | null,
      }));
      // Solo computar standings si los 6 partidos del grupo están predichos
      const groupAllFilled = userMatches.length === 6;
      if (!groupAllFilled) continue;
      const derived = computeGroupStandings(teamIds, userMatches);
      preds.groupStandings.set(
        letter,
        derived.slice(0, 4).map((s) => ({
          position: s.position as 1|2|3|4,
          teamId: s.teamId,
        })),
      );
    }

    // Derivar R32 directamente de los marcadores del usuario
    const derived = derivePredictedR32(groupLetters, teamsByGroup, matchPredsByGroup);
    preds.qualifiers.r32 = derived.teams;
  }

  // ---- Derivar R16/QF/SF/Final + Top4 desde predictions_bracket_winners ----
  // Mapeo match_id (BD) → matchNum lógico (73-104)
  function matchIdToNum(matchId: number): number | null {
    const m = matchesById.get(matchId);
    if (!m) return null;
    // External code: R32-XX, R16-XX, QF-XX, SF-XX, TP-01, FINAL-01
    const ec = m.stage;
    return null;  // se calcula via external_code abajo
  }
  // Pre-construir mapeo external_code → matchNum
  const numByMatchId = new Map<number, number>();
  {
    const { data: extCodes } = await supa
      .from('matches').select('id, external_code');
    for (const row of (extCodes ?? []) as Array<{ id: number; external_code: string }>) {
      const m = row.external_code.match(/^(R32|R16|QF|SF|TP|FINAL)-(\d{2})$/);
      if (!m) continue;
      const stage = m[1], idx = parseInt(m[2], 10);
      let num: number | null = null;
      if (stage === 'R32') num = 72 + idx;
      else if (stage === 'R16') num = 88 + idx;
      else if (stage === 'QF')  num = 96 + idx;
      else if (stage === 'SF')  num = 100 + idx;
      else if (stage === 'TP')  num = 103;
      else if (stage === 'FINAL') num = 104;
      if (num != null) numByMatchId.set(row.id, num);
    }
  }
  // Suprimir warning de matchIdToNum no usado
  void matchIdToNum;

  const bracketPicksByUser = new Map<string, Map<number, number>>();
  for (const r of (predBracketWinners ?? []) as Array<{ user_id: string; match_id: number; winner_team_id: number }>) {
    // Regla "no cuenta hasta guardar": solo computa si el usuario confirmó su bracket completo.
    if (!bracketLockedUsers.has(r.user_id)) continue;
    const num = numByMatchId.get(r.match_id);
    if (num == null) continue;
    if (!bracketPicksByUser.has(r.user_id)) bracketPicksByUser.set(r.user_id, new Map());
    bracketPicksByUser.get(r.user_id)!.set(num, r.winner_team_id);
  }

  // Para cada usuario, derivar qualifiers + topPositions desde sus bracket winners
  for (const uid of byUser.keys()) {
    const preds = byUser.get(uid)!;
    const picks = bracketPicksByUser.get(uid);
    if (!picks || picks.size === 0) continue;

    // R16 = ganadores de M73-M88
    // QF = ganadores de M89-M96
    // SF = ganadores de M97-M100
    // Final = ganadores de M101-M102
    for (const [num, teamId] of picks) {
      if (num >= 73 && num <= 88) preds.qualifiers.r16.add(teamId);
      else if (num >= 89 && num <= 96) preds.qualifiers.qf.add(teamId);
      else if (num >= 97 && num <= 100) preds.qualifiers.sf.add(teamId);
      else if (num === 101 || num === 102) preds.qualifiers.final.add(teamId);
    }

    // Top 4: usamos el bracket derivado completo para resolver perdedores
    const matchPredsByGroupForUser = new Map<string, UserGroupMatchPred[]>();
    for (const [matchId, score] of preds.groupMatches) {
      const info = matchInfo.get(matchId);
      if (!info) continue;
      if (!matchPredsByGroupForUser.has(info.groupLetter)) matchPredsByGroupForUser.set(info.groupLetter, []);
      matchPredsByGroupForUser.get(info.groupLetter)!.push({
        matchId, groupLetter: info.groupLetter,
        homeTeamId: info.homeTeamId, awayTeamId: info.awayTeamId,
        homeScore: score.homeScore, awayScore: score.awayScore,
      });
    }
    const userBracket = deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroupForUser, picks);
    const matchById = new Map(userBracket.cruces.map((c) => [c.matchNum, c]));

    // Champion = ganador M104
    const champion = picks.get(104);
    // Sub = el OTRO equipo en M104 (loser)
    const finalCruce = matchById.get(104);
    const subA = finalCruce?.teamA.kind === 'resolved' ? finalCruce.teamA.teamId : null;
    const subB = finalCruce?.teamB.kind === 'resolved' ? finalCruce.teamB.teamId : null;
    const sub = champion && (subA === champion ? subB : subA);

    // 3° = ganador M103
    const third = picks.get(103);
    // 4° = el OTRO equipo en M103
    const tpCruce = matchById.get(103);
    const fourthA = tpCruce?.teamA.kind === 'resolved' ? tpCruce.teamA.teamId : null;
    const fourthB = tpCruce?.teamB.kind === 'resolved' ? tpCruce.teamB.teamId : null;
    const fourth = third && (fourthA === third ? fourthB : fourthA);

    preds.topPositions = [];
    if (champion) preds.topPositions.push({ position: 1, teamId: champion });
    if (sub) preds.topPositions.push({ position: 2, teamId: sub });
    if (third) preds.topPositions.push({ position: 3, teamId: third });
    if (fourth) preds.topPositions.push({ position: 4, teamId: fourth });
  }

  for (const r of (predTop ?? []) as Array<{ user_id: string; position: number; team_id: number }>) {
    // Fallback al modelo viejo si el usuario no tiene bracket picks
    const p = ensure(r.user_id);
    const hasBracket = bracketPicksByUser.has(r.user_id) && (bracketPicksByUser.get(r.user_id)?.size ?? 0) > 0;
    if (!hasBracket) {
      p.topPositions.push({ position: r.position as 1|2|3|4, teamId: r.team_id });
    }
  }
  for (const r of (predScorer ?? []) as Array<{ user_id: string; player_name: string }>) {
    // Regla "no cuenta hasta guardar": el goleador solo cuenta si el usuario confirmó el bracket.
    if (!bracketLockedUsers.has(r.user_id)) continue;
    ensure(r.user_id).topScorer = r.player_name;
  }

  // Calcular y upsert
  const upserts: Array<Record<string, unknown>> = [];
  for (const uid of userIds) {
    const preds = byUser.get(uid) ?? ensure(uid);
    const b = computeUserScore(preds, officialResults);
    upserts.push({
      user_id: uid,
      total: b.total,
      group_match_winner: b.groupMatchWinner,
      group_match_exact:  b.groupMatchExact,
      group_standings:    b.groupStandings,
      qual_r32: b.qualR32, qual_r16: b.qualR16, qual_qf: b.qualQf, qual_sf: b.qualSf, qual_final: b.qualFinal,
      knockout_match_winner: b.knockoutMatchWinner,
      knockout_match_exact:  b.knockoutMatchExact,
      top_position_1: b.topPosition1,
      top_position_2: b.topPosition2,
      top_position_3: b.topPosition3,
      top_position_4: b.topPosition4,
      top_scorer: b.topScorer,
      group_matches_total: b.groupMatchesScored,
      group_winners_hit:   b.groupWinnersHit,
      group_exact_hit:     b.groupExactHit,
      knockout_matches_scored: b.knockoutMatchesScored,
      knockout_winners_hit:    b.knockoutWinnersHit,
      knockout_exact_hit:      b.knockoutExactHit,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length > 0) {
    const { error } = await supa.from('user_scores').upsert(upserts, { onConflict: 'user_id' });
    if (error) return { ok: false, error: error.message };
  }

  return { ok: true, users: userIds.length };
}
