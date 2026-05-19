// Deriva los 32 equipos que un usuario "predice" para R32, a partir de sus
// predicciones de fase de grupos:
//   - Top 2 de cada grupo (basado en sus picks manuales de 1° y 2°)
//   - 8 mejores 3ros (basado en sus picks de 3° + stats derivadas de sus marcadores)
//
// Es lo que la UI muestra como "tus 32 a R32" y lo que se usa para el scoring.

import { computeGroupStandings } from './standings';

export interface UserGroupMatchPred {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  groupLetter: string;
}

export interface UserStandingPred {
  groupLetter: string;
  position: 1 | 2 | 3 | 4;
  teamId: number;
}

export interface DerivedR32 {
  /** 32 equipos predichos para R32. Vacío si no hay datos suficientes. */
  teams: Set<number>;
  /** Desglose por grupo: top 2 (de standings manual) + bandera de "complete" */
  byGroup: Array<{
    groupLetter: string;
    pos1: number | null;
    pos2: number | null;
    pos3: number | null;
    third: { teamId: number | null; pts: number; dg: number; gf: number; passes: boolean };
  }>;
  /** Lista de los 8 mejores 3ros (teamIds, ya filtrado) */
  bestThirds: number[];
  /** Si faltan datos críticos para la derivación */
  warnings: string[];
}

export function derivePredictedR32(
  groupLetters: string[],
  teamsByGroup: Map<string, number[]>,
  matchPredsByGroup: Map<string, UserGroupMatchPred[]>,
  standingPreds: UserStandingPred[],
): DerivedR32 {
  const warnings: string[] = [];
  const teams = new Set<number>();
  const byGroup: DerivedR32['byGroup'] = [];

  // Index standing preds: group → position → teamId
  const standMap = new Map<string, Map<number, number>>();
  for (const s of standingPreds) {
    if (!standMap.has(s.groupLetter)) standMap.set(s.groupLetter, new Map());
    standMap.get(s.groupLetter)!.set(s.position, s.teamId);
  }

  // Cómputo de standings derivadas (para stats del 3°)
  const derivedStandingsByGroup = new Map<string, ReturnType<typeof computeGroupStandings>>();
  for (const letter of groupLetters) {
    const matches = matchPredsByGroup.get(letter) ?? [];
    const teamIds = teamsByGroup.get(letter) ?? [];
    const ms = matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }));
    derivedStandingsByGroup.set(letter, computeGroupStandings(teamIds, ms));
  }

  // Top 2 + 3° por grupo
  const thirdsCandidates: Array<{
    groupLetter: string;
    teamId: number;
    pts: number;
    dg: number;
    gf: number;
  }> = [];

  for (const letter of groupLetters) {
    const g = standMap.get(letter) ?? new Map();
    const pos1 = g.get(1) ?? null;
    const pos2 = g.get(2) ?? null;
    const pos3 = g.get(3) ?? null;

    if (pos1) teams.add(pos1);
    if (pos2) teams.add(pos2);

    // Stats del 3° (basadas en los marcadores predichos)
    let thirdStats = { pts: 0, dg: 0, gf: 0 };
    if (pos3) {
      const derived = derivedStandingsByGroup.get(letter);
      const row = derived?.find((r) => r.teamId === pos3);
      if (row) thirdStats = { pts: row.pts, dg: row.dg, gf: row.gf };
      thirdsCandidates.push({
        groupLetter: letter,
        teamId: pos3,
        ...thirdStats,
      });
    }

    byGroup.push({
      groupLetter: letter,
      pos1, pos2, pos3,
      third: { teamId: pos3, ...thirdStats, passes: false /* se marca abajo */ },
    });
  }

  // Rankear los 12 3ros por Pts → DG → GF
  thirdsCandidates.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return a.teamId - b.teamId;
  });

  const bestThirds = thirdsCandidates.slice(0, 8).map((c) => c.teamId);
  const bestThirdsSet = new Set(bestThirds);
  for (const id of bestThirds) teams.add(id);

  // Marcar passes en byGroup
  for (const g of byGroup) {
    if (g.third.teamId != null && bestThirdsSet.has(g.third.teamId)) {
      g.third.passes = true;
    }
  }

  // Warnings
  if (teams.size < 32) {
    const missing = 32 - teams.size;
    warnings.push(
      `Faltan ${missing} equipos. Completa las posiciones (1°, 2°, 3°) de todos los grupos.`,
    );
  }

  return { teams, byGroup, bestThirds, warnings };
}
