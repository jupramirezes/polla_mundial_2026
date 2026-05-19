import {
  scoreMatch,
  scoreGroupStandings,
  scoreQualifiers,
  scoreTopPositions,
  scoreTopScorer,
  type MatchPrediction,
  type MatchResult,
  type GroupStanding,
} from './calculate';
import { type QualifierRound } from './rules';

// ----- Tipos de entrada -----

export interface AllPredictions {
  /** Predicciones de la fase de grupos (matchId → predicción) */
  groupMatches: Map<number, MatchPrediction>;
  /** Predicciones de marcador de eliminatorias (matchId → predicción) */
  knockoutMatches: Map<number, MatchPrediction>;
  /** Posiciones de grupo (key: 'A'..'L' → 4 posiciones predichas) */
  groupStandings: Map<string, GroupStanding[]>;
  /** Set de teamIds predichos por ronda */
  qualifiers: Record<QualifierRound, Set<number>>;
  /** Top 4 final (4 entradas, posiciones 1..4) */
  topPositions: Array<{ position: 1 | 2 | 3 | 4; teamId: number }>;
  /** Nombre del goleador predicho (puede ser '') */
  topScorer: string;
}

export interface OfficialResults {
  /** Resultados oficiales de fase de grupos */
  groupMatches: Map<number, MatchResult>;
  /** Resultados oficiales de eliminatorias */
  knockoutMatches: Map<number, MatchResult>;
  /** Posiciones reales de grupo (key: 'A'..'L' → 4 posiciones) */
  groupStandings: Map<string, GroupStanding[]>;
  /** Teams que efectivamente clasificaron a cada ronda */
  qualifiers: Record<QualifierRound, Set<number>>;
  /** Posiciones reales top 4 */
  topPositions: Array<{ position: 1 | 2 | 3 | 4; teamId: number }>;
  /** Nombres de los goleadores (1+ si hay empate) */
  topScorers: string[];
}

// ----- Resultado del cálculo -----

export interface UserScoreBreakdown {
  total: number;
  // Fase de grupos
  groupMatchWinner: number;
  groupMatchExact: number;
  groupStandings: number;
  // Clasificados a rondas
  qualR32: number;
  qualR16: number;
  qualQf: number;
  qualSf: number;
  qualFinal: number;
  // Marcadores de eliminatorias (NUEVO)
  knockoutMatchWinner: number;
  knockoutMatchExact: number;
  // Top final + goleador
  topPosition1: number;
  topPosition2: number;
  topPosition3: number;
  topPosition4: number;
  topScorer: number;
  // Conteos para UI
  groupMatchesScored: number;
  groupWinnersHit: number;
  groupExactHit: number;
  knockoutMatchesScored: number;
  knockoutWinnersHit: number;
  knockoutExactHit: number;
}

// ----- Cálculo integral -----

/**
 * Calcula el desglose completo de puntos de un usuario contra los resultados oficiales.
 * Sólo cuenta partidos/posiciones/clasificados que ya tengan resultado oficial registrado;
 * lo demás suma 0.
 */
export function computeUserScore(
  predictions: AllPredictions,
  results: OfficialResults,
): UserScoreBreakdown {
  // --- Fase de grupos: marcadores ---
  let groupMatchWinner = 0;
  let groupMatchExact = 0;
  let groupWinnersHit = 0;
  let groupExactHit = 0;
  let groupMatchesScored = 0;

  for (const [matchId, result] of results.groupMatches) {
    const pred = predictions.groupMatches.get(matchId);
    if (!pred) continue;
    groupMatchesScored++;
    const r = scoreMatch(pred, result);
    groupMatchWinner += r.winnerPoints;
    groupMatchExact += r.exactPoints;
    if (r.winnerPoints > 0) groupWinnersHit++;
    if (r.exactPoints > 0) groupExactHit++;
  }

  // --- Posiciones de grupo ---
  let groupStandings = 0;
  for (const [groupLetter, officials] of results.groupStandings) {
    const preds = predictions.groupStandings.get(groupLetter);
    if (!preds) continue;
    groupStandings += scoreGroupStandings(preds, officials);
  }

  // --- Clasificados por ronda ---
  const qualR32   = scoreQualifiers('r32',   predictions.qualifiers.r32,   results.qualifiers.r32);
  const qualR16   = scoreQualifiers('r16',   predictions.qualifiers.r16,   results.qualifiers.r16);
  const qualQf    = scoreQualifiers('qf',    predictions.qualifiers.qf,    results.qualifiers.qf);
  const qualSf    = scoreQualifiers('sf',    predictions.qualifiers.sf,    results.qualifiers.sf);
  const qualFinal = scoreQualifiers('final', predictions.qualifiers.final, results.qualifiers.final);

  // --- Marcadores eliminatorias ---
  let knockoutMatchWinner = 0;
  let knockoutMatchExact = 0;
  let knockoutWinnersHit = 0;
  let knockoutExactHit = 0;
  let knockoutMatchesScored = 0;

  for (const [matchId, result] of results.knockoutMatches) {
    const pred = predictions.knockoutMatches.get(matchId);
    if (!pred) continue;
    knockoutMatchesScored++;
    const r = scoreMatch(pred, result);
    knockoutMatchWinner += r.winnerPoints;
    knockoutMatchExact += r.exactPoints;
    if (r.winnerPoints > 0) knockoutWinnersHit++;
    if (r.exactPoints > 0) knockoutExactHit++;
  }

  // --- Top posiciones ---
  const top = scoreTopPositions(predictions.topPositions, results.topPositions);

  // --- Goleador ---
  const topScorerPts = predictions.topScorer
    ? scoreTopScorer(predictions.topScorer, results.topScorers)
    : 0;

  const total =
    groupMatchWinner + groupMatchExact + groupStandings +
    qualR32 + qualR16 + qualQf + qualSf + qualFinal +
    knockoutMatchWinner + knockoutMatchExact +
    top.total + topScorerPts;

  return {
    total,
    groupMatchWinner,
    groupMatchExact,
    groupStandings,
    qualR32, qualR16, qualQf, qualSf, qualFinal,
    knockoutMatchWinner,
    knockoutMatchExact,
    topPosition1: top.byPosition[1],
    topPosition2: top.byPosition[2],
    topPosition3: top.byPosition[3],
    topPosition4: top.byPosition[4],
    topScorer: topScorerPts,
    groupMatchesScored,
    groupWinnersHit,
    groupExactHit,
    knockoutMatchesScored,
    knockoutWinnersHit,
    knockoutExactHit,
  };
}
