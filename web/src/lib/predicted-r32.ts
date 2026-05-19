// Deriva los 32 equipos que un usuario "predice" para R32 a partir de sus
// predicciones de marcadores de fase de grupos:
//   - Top 2 de cada grupo (orden derivado de los marcadores)
//   - 8 mejores 3ros (Pts → Diferencia de goles → Goles a favor — regla FIFA)
//
// El usuario NO predice posiciones a mano: todo sale de sus marcadores.

import { computeGroupStandings, type StandingRow } from './standings';

export interface UserGroupMatchPred {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  groupLetter: string;
}

export interface DerivedR32 {
  /** 32 equipos predichos. < 32 si grupos incompletos. */
  teams: Set<number>;
  /** Desglose por grupo para mostrar en UI */
  byGroup: Array<{
    groupLetter: string;
    complete: boolean;                  // los 6 partidos del grupo predichos
    standings: StandingRow[];           // tabla completa del grupo (4 filas)
    thirdPasses: boolean | null;        // si el 3° clasifica como mejor 3ro (null si grupo incompleto)
  }>;
  /** Lista de los 8 mejores 3ros (teamIds) */
  bestThirds: number[];
  /** Mensajes para mostrar al usuario */
  warnings: string[];
}

export function derivePredictedR32(
  groupLetters: string[],
  teamsByGroup: Map<string, number[]>,
  matchPredsByGroup: Map<string, UserGroupMatchPred[]>,
): DerivedR32 {
  const warnings: string[] = [];
  const teams = new Set<number>();
  const byGroup: DerivedR32['byGroup'] = [];

  // Calcular standings por grupo
  const standingsByGroup = new Map<string, StandingRow[]>();
  let incompleteGroups = 0;

  for (const letter of groupLetters) {
    const preds = matchPredsByGroup.get(letter) ?? [];
    const teamIds = teamsByGroup.get(letter) ?? [];

    const completed = preds.length === 6; // 6 partidos = grupo cerrado
    if (!completed) incompleteGroups++;

    const matches = preds.map((p) => ({
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      homeScore: p.homeScore as number | null,
      awayScore: p.awayScore as number | null,
    }));
    const standings = computeGroupStandings(teamIds, matches);
    standingsByGroup.set(letter, standings);

    if (completed) {
      // Top 2 entran a R32 garantizado
      teams.add(standings[0].teamId);
      teams.add(standings[1].teamId);
    }
  }

  // 8 mejores 3ros (regla FIFA: Pts → DG → GF)
  // Solo consideramos 3ros de grupos COMPLETOS (los demás no tienen stats firmes)
  type ThirdCand = { groupLetter: string; teamId: number; pts: number; dg: number; gf: number };
  const thirdsCandidates: ThirdCand[] = [];
  for (const letter of groupLetters) {
    const standings = standingsByGroup.get(letter);
    if (!standings || standings.length < 3) continue;
    const preds = matchPredsByGroup.get(letter) ?? [];
    if (preds.length !== 6) continue; // grupo incompleto
    const third = standings[2];  // 3° del grupo
    thirdsCandidates.push({
      groupLetter: letter,
      teamId: third.teamId,
      pts: third.pts,
      dg:  third.dg,
      gf:  third.gf,
    });
  }

  thirdsCandidates.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return a.teamId - b.teamId;          // desempate determinístico para sort estable
  });

  const bestThirds = thirdsCandidates.slice(0, 8).map((c) => c.teamId);
  const bestThirdsSet = new Set(bestThirds);
  for (const id of bestThirds) teams.add(id);

  // byGroup para UI
  for (const letter of groupLetters) {
    const standings = standingsByGroup.get(letter) ?? [];
    const preds = matchPredsByGroup.get(letter) ?? [];
    const completed = preds.length === 6;
    const third = standings[2];
    const thirdPasses = completed && third ? bestThirdsSet.has(third.teamId) : null;
    byGroup.push({
      groupLetter: letter,
      complete: completed,
      standings,
      thirdPasses,
    });
  }

  // Warnings
  if (incompleteGroups > 0) {
    warnings.push(
      `Faltan ${incompleteGroups} grupo(s) por completar. Llena los 6 marcadores de cada grupo para que la lista de R32 se complete.`,
    );
  }

  return { teams, byGroup, bestThirds, warnings };
}
