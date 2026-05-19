// Calcula la tabla de posiciones de un grupo a partir de los marcadores predichos.
// Usado en la UI para mostrar al usuario cómo quedan los standings en vivo
// mientras va llenando los partidos.

export interface MatchScore {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
}

export interface StandingRow {
  teamId: number;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
  position: number;     // 1..4 (depende de tie-breakers: Pts → DG → GF)
}

export function computeGroupStandings(
  teamIds: number[],
  matches: MatchScore[],
): StandingRow[] {
  const stats = new Map<number, Omit<StandingRow, 'position'>>();
  for (const id of teamIds) {
    stats.set(id, { teamId: id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 });
  }

  for (const m of matches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const home = stats.get(m.homeTeamId);
    const away = stats.get(m.awayTeamId);
    if (!home || !away) continue;

    home.pj++; away.pj++;
    home.gf += m.homeScore; home.gc += m.awayScore;
    away.gf += m.awayScore; away.gc += m.homeScore;

    if (m.homeScore > m.awayScore)      { home.g++; away.p++; }
    else if (m.homeScore < m.awayScore) { home.p++; away.g++; }
    else                                 { home.e++; away.e++; }
  }

  for (const s of stats.values()) {
    s.dg = s.gf - s.gc;
    s.pts = s.g * 3 + s.e;
  }

  // Orden: Pts desc → DG desc → GF desc → teamId asc (estable)
  const sorted = Array.from(stats.values()).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg  !== a.dg)  return b.dg  - a.dg;
    if (b.gf  !== a.gf)  return b.gf  - a.gf;
    return a.teamId - b.teamId;
  });

  return sorted.map((s, i) => ({ ...s, position: i + 1 }));
}
