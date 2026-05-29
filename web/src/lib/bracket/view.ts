// Helper read-only para DERIVAR el bracket de un usuario a partir de filas ya
// leídas de la base de datos. Lo usa la vista pública /brackets/[userId] (y
// puede reutilizarse en cualquier vista de solo lectura). No toca la lógica
// del admin ni del scoring; solo reempaqueta deriveUserBracket + isValidPick +
// el Top 4 derivado, igual que ya lo hace el panel admin.

import type { Team, MatchRow } from '@/lib/types';
import {
  deriveUserBracket, crucesByStage,
  type UserGroupMatchPred, type DerivedCruce, type DerivedBracket,
} from './derive';

// external_code (R32-01 … FINAL-01) → matchNum lógico 73-104
export function matchNumFromExternalCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const mm = code.match(/^(R32|R16|QF|SF|TP|FINAL)-(\d{2})$/);
  if (!mm) return null;
  const stage = mm[1], idx = parseInt(mm[2], 10);
  if (stage === 'R32') return 72 + idx;
  if (stage === 'R16') return 88 + idx;
  if (stage === 'QF')  return 96 + idx;
  if (stage === 'SF')  return 100 + idx;
  if (stage === 'TP')  return 103;
  if (stage === 'FINAL') return 104;
  return null;
}

// Un pick SOLO es válido si su cruce está resuelto desde los grupos guardados
// y el ganador elegido es uno de los dos equipos del cruce. Ignora picks
// "huérfanos" (sin grupos) para que no se muestren como reales.
export function isValidPick(c: DerivedCruce | undefined): boolean {
  if (!c) return false;
  const a = c.teamA.kind === 'resolved' ? c.teamA.teamId : null;
  const b = c.teamB.kind === 'resolved' ? c.teamB.teamId : null;
  if (a == null || b == null) return false;
  return c.userPickedWinnerTeamId === a || c.userPickedWinnerTeamId === b;
}

export interface UserBracketView {
  bracket: DerivedBracket;
  stageMap: Map<string, DerivedCruce[]>;
  cruceByNum: Map<number, DerivedCruce>;
  validPicksCount: number;
  championId: number | null;
  subId: number | null;
  thirdId: number | null;
  fourthId: number | null;
}

export interface BuildArgs {
  teams: Team[];
  matches: MatchRow[];
  predMatches: Array<{ match_id: number; home_score: number; away_score: number }>;
  predBracketWinners: Array<{ match_id: number; winner_team_id: number }>;
}

/** Construye la vista derivada del bracket de UN usuario a partir de sus filas. */
export function buildUserBracketView({ teams, matches, predMatches, predBracketWinners }: BuildArgs): UserBracketView {
  const matchById = new Map<number, MatchRow>();
  for (const m of matches) matchById.set(m.id, m);

  // teams por grupo + lista de grupos
  const teamsByGroup = new Map<string, number[]>();
  for (const t of teams) {
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }
  const groupLetters = Array.from(teamsByGroup.keys()).sort();

  // picks del usuario: matchNum (73-104) → team_id ganador
  const picks = new Map<number, number>();
  for (const r of predBracketWinners) {
    const m = matchById.get(r.match_id);
    const num = matchNumFromExternalCode(m?.external_code);
    if (num != null) picks.set(num, r.winner_team_id);
  }

  // marcadores de grupo del usuario indexados por grupo
  const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
  for (const r of predMatches) {
    const m = matchById.get(r.match_id);
    if (!m || m.stage !== 'group' || !m.group_letter || !m.home_team_id || !m.away_team_id) continue;
    if (!matchPredsByGroup.has(m.group_letter)) matchPredsByGroup.set(m.group_letter, []);
    matchPredsByGroup.get(m.group_letter)!.push({
      matchId: r.match_id, groupLetter: m.group_letter,
      homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
      homeScore: r.home_score, awayScore: r.away_score,
    });
  }

  const bracket = deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroup, picks);
  const stageMap = crucesByStage(bracket.cruces);
  const cruceByNum = new Map(bracket.cruces.map((c) => [c.matchNum, c]));
  const validPicksCount = bracket.cruces.filter(isValidPick).length;

  // Top 4 derivado del bracket REAL del usuario
  const otherTeamInCruce = (matchNum: number, winnerId: number | null): number | null => {
    if (!winnerId) return null;
    const c = cruceByNum.get(matchNum);
    if (!c) return null;
    const a = c.teamA.kind === 'resolved' ? c.teamA.teamId : null;
    const b = c.teamB.kind === 'resolved' ? c.teamB.teamId : null;
    return a === winnerId ? b : a;
  };
  const finalCruce = cruceByNum.get(104);
  const tpCruce = cruceByNum.get(103);
  const championId = isValidPick(finalCruce) ? finalCruce!.userPickedWinnerTeamId : null;
  const subId = otherTeamInCruce(104, championId);
  const thirdId = isValidPick(tpCruce) ? tpCruce!.userPickedWinnerTeamId : null;
  const fourthId = otherTeamInCruce(103, thirdId);

  return { bracket, stageMap, cruceByNum, validPicksCount, championId, subId, thirdId, fourthId };
}
