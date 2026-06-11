import { POINTS, type QualifierRound } from './rules';

// ---------- Tipos ----------

export interface MatchPrediction {
  homeScore: number;
  awayScore: number;
}

export interface MatchResult {
  homeScore: number;
  awayScore: number;
}

export interface GroupStanding {
  position: 1 | 2 | 3 | 4;
  teamId: number;
}

export interface MatchScoreResult {
  winnerPoints: number;  // 0 ó POINTS.match.winner
  exactPoints: number;   // 0 ó POINTS.match.exactScore
  total: number;
}

// ---------- Funciones puras ----------

/** Resultado del partido (1, X, 2). */
function outcome(homeScore: number, awayScore: number): '1' | 'X' | '2' {
  if (homeScore > awayScore) return '1';
  if (homeScore < awayScore) return '2';
  return 'X';
}

/**
 * Puntos por un partido individual (fase de grupos o eliminatorias).
 *   - Acertar ganador: POINTS.match.winner
 *   - Acertar marcador exacto: + POINTS.match.exactScore (bonus encima del anterior)
 */
export function scoreMatch(
  pred: MatchPrediction,
  result: MatchResult,
): MatchScoreResult {
  const predOutcome = outcome(pred.homeScore, pred.awayScore);
  const realOutcome = outcome(result.homeScore, result.awayScore);

  const winnerHit = predOutcome === realOutcome;
  const exactHit =
    winnerHit &&
    pred.homeScore === result.homeScore &&
    pred.awayScore === result.awayScore;

  const winnerPoints = winnerHit ? POINTS.match.winner : 0;
  const exactPoints = exactHit ? POINTS.match.exactScore : 0;

  return {
    winnerPoints,
    exactPoints,
    total: winnerPoints + exactPoints,
  };
}

/** Alias antiguo para retrocompat (semánticamente lo mismo). */
export const scoreGroupMatch = scoreMatch;

/**
 * Puntos por posiciones de un grupo.
 *   - Cada posición correcta (equipo X en posición N) suma POINTS.groupStandings[N-1]
 *   - Posiciones independientes: acertar 1° y 3° pero fallar 2° y 4° suma 4+2=6.
 */
export function scoreGroupStandings(
  predictions: GroupStanding[],   // 4 entradas, una por posición
  officials: GroupStanding[],     // 4 entradas
): number {
  let total = 0;
  for (const pred of predictions) {
    const real = officials.find((o) => o.position === pred.position);
    if (real && real.teamId === pred.teamId) {
      total += POINTS.groupStandings[pred.position - 1];
    }
  }
  return total;
}

/**
 * Puntos por equipos clasificados a una ronda (sin orden).
 *   - Cada equipo correctamente predicho suma POINTS.qualifiers[round].
 *   - El usuario debe predecir N equipos (32/16/8/4/2 según ronda).
 *   - Sin penalización por equipos extras; solo cuentan aciertos (intersección).
 */
export function scoreQualifiers(
  round: QualifierRound,
  predictedTeamIds: Iterable<number>,
  officialTeamIds: Iterable<number>,
): number {
  const officialSet = new Set(officialTeamIds);
  let hits = 0;
  for (const teamId of predictedTeamIds) {
    if (officialSet.has(teamId)) hits++;
  }
  return hits * POINTS.qualifiers[round];
}

/**
 * Puntos por posiciones finales del mundial (top 4).
 *   - Cada posición es independiente. Acertar campeón pero fallar subcampeón suma 90.
 *   - position debe ser 1..4.
 */
export function scoreTopPositions(
  predictions: Array<{ position: 1 | 2 | 3 | 4; teamId: number }>,
  officials:   Array<{ position: 1 | 2 | 3 | 4; teamId: number }>,
): { byPosition: Record<1 | 2 | 3 | 4, number>; total: number } {
  const byPosition = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
  for (const pred of predictions) {
    const real = officials.find((o) => o.position === pred.position);
    if (real && real.teamId === pred.teamId) {
      byPosition[pred.position] = POINTS.topPositions[pred.position - 1];
    }
  }
  const total = byPosition[1] + byPosition[2] + byPosition[3] + byPosition[4];
  return { byPosition, total };
}

/**
 * Puntos por goleador del mundial.
 *   - Si hay varios empatados (mismo número de goles), TODOS los participantes
 *     que predijeron a CUALQUIERA reciben POINTS.topScorer.
 *   - Comparación case-insensitive con trim.
 */
export function scoreTopScorer(
  predictedName: string,
  officialScorerNames: Iterable<string>,
): number {
  // Normaliza: minúsculas, sin tildes/diacríticos y sin espacios extra, para que
  // "Mbappé" == "Mbappe", "MBAPPE" == "mbappe", etc. (los participantes escriben
  // el nombre a mano y varían en tildes/mayúsculas).
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');
  const target = norm(predictedName);
  for (const official of officialScorerNames) {
    if (norm(official) === target) return POINTS.topScorer;
  }
  return 0;
}
