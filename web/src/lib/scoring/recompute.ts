// Recalcula los puntajes de todos los usuarios contra los resultados oficiales.
// Usa el cliente admin (service_role) porque atraviesa las tablas de TODOS los usuarios.

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { computeUserScore } from './aggregate';
import type { AllPredictions, OfficialResults } from './aggregate';
import type { QualifierRound } from './rules';
import { computeGroupStandings } from '@/lib/standings';
import { derivePredictedR32, type UserGroupMatchPred } from '@/lib/predicted-r32';

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

  // Clasificados oficiales por ronda
  const officialQual: Record<QualifierRound, Set<number>> = {
    r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set(),
  };
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
    .select('id');
  if (eProf) return { ok: false, error: eProf.message };

  const userIds = (profiles ?? []).map((p) => (p as { id: string }).id);

  // Cargas batch
  const [
    { data: predMatches },
    { data: predKO },
    { data: predQual },
    { data: predTop },
    { data: predScorer },
  ] = await Promise.all([
    supa.from('predictions_matches').select('user_id, match_id, home_score, away_score'),
    supa.from('predictions_knockout_matches').select('user_id, match_id, home_score, away_score'),
    supa.from('predictions_qualifiers').select('user_id, round, team_id'),
    supa.from('predictions_top_positions').select('user_id, position, team_id'),
    supa.from('predictions_top_scorer').select('user_id, player_name'),
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
  for (const r of (predTop ?? []) as Array<{ user_id: string; position: number; team_id: number }>) {
    ensure(r.user_id).topPositions.push({ position: r.position as 1|2|3|4, teamId: r.team_id });
  }
  for (const r of (predScorer ?? []) as Array<{ user_id: string; player_name: string }>) {
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
