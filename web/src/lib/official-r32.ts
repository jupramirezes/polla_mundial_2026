// Clasificados OFICIALES a 16avos (R32) derivados de los RESULTADOS de grupos,
// sin depender de que el admin genere los cruces:
//   - Top 2 de cada grupo que YA terminó sus 6 partidos → suman de inmediato.
//   - 8 mejores 3ros (Pts → Diferencia de gol → Goles a favor, regla FIFA) →
//     solo cuando TODOS los grupos terminaron (antes no se pueden comparar).
//
// Lo usan el recálculo de puntos (para sumar +2 grupo por grupo) y la página de
// cruces (para mostrar exactamente lo mismo). Una sola fuente de verdad.

import { computeGroupStandings, type MatchScore } from './standings';

export interface OfficialR32Result {
  /** Equipos clasificados a R32 confirmados desde los resultados. */
  teams: Set<number>;
  /** Letras de los grupos cuyos 6 partidos ya se jugaron. */
  finishedGroups: string[];
  /** true cuando los 12 grupos terminaron (los 3ros ya están definidos). */
  thirdsResolved: boolean;
  /** Por cada grupo TERMINADO: [teamId 1º, teamId 2º] (clasificados directos). */
  top2ByGroup: Map<string, [number, number]>;
}

export function computeOfficialR32(
  teamsByGroup: Map<string, number[]>,
  matchesByGroup: Map<string, MatchScore[]>,
): OfficialR32Result {
  const teams = new Set<number>();
  const top2ByGroup = new Map<string, [number, number]>();
  const finishedGroups: string[] = [];
  const groupLetters = Array.from(teamsByGroup.keys());
  const standingsByGroup = new Map<string, ReturnType<typeof computeGroupStandings>>();

  for (const letter of groupLetters) {
    const ms = matchesByGroup.get(letter) ?? [];
    const allPlayed = ms.length >= 6 && ms.every((m) => m.homeScore != null && m.awayScore != null);
    if (!allPlayed) continue;
    const st = computeGroupStandings(teamsByGroup.get(letter) ?? [], ms);
    if (st.length < 2) continue;
    standingsByGroup.set(letter, st);
    finishedGroups.push(letter);
    const top2: [number, number] = [st[0].teamId, st[1].teamId];
    top2ByGroup.set(letter, top2);
    teams.add(top2[0]);
    teams.add(top2[1]);
  }

  const thirdsResolved = groupLetters.length > 0 && finishedGroups.length === groupLetters.length;
  if (thirdsResolved) {
    const thirds: Array<{ teamId: number; pts: number; dg: number; gf: number }> = [];
    for (const letter of groupLetters) {
      const st = standingsByGroup.get(letter);
      if (!st || st.length < 3) continue;
      const t = st[2];
      thirds.push({ teamId: t.teamId, pts: t.pts, dg: t.dg, gf: t.gf });
    }
    thirds.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.dg !== a.dg) return b.dg - a.dg;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.teamId - b.teamId;
    });
    for (const t of thirds.slice(0, 8)) teams.add(t.teamId);
  }

  return { teams, finishedGroups, thirdsResolved, top2ByGroup };
}
