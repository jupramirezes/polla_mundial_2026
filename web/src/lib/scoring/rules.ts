// Reglas de puntuación de la Polla Mundial 2026.
// Total máximo: 1.160 puntos (1.000 base + 160 por marcadores de eliminatorias).
// Cambiar aquí impacta TODO el cálculo de puntos.

export const POINTS = {
  // Partido fase de grupos (también aplica a partidos de eliminatorias)
  match: {
    winner: 2,         // acertar 1X2 sin marcador
    exactScore: 3,     // bonus encima del winner si también acierta marcador
  },
  // Posiciones de grupo (1°, 2°, 3°, 4°)
  groupStandings: [4, 3, 2, 1] as const,
  // Clasificados a cada ronda (sin orden, intersección)
  qualifiers: {
    r32: 2,
    r16: 3,
    qf: 6,
    sf: 12,
    final: 22,
  },
  // Posiciones finales del mundial (1°..4°)
  topPositions: [90, 60, 40, 28] as const,
  // Goleador del mundial
  topScorer: 50,
} as const;

export type QualifierRound = keyof typeof POINTS.qualifiers;

// Cuántos partidos hay en cada etapa
export const MATCH_COUNTS = {
  group: 72,
  r32: 16,
  r16: 8,
  qf: 4,
  sf: 2,
  tp: 1,    // tercer puesto
  final: 1,
} as const;

export const KNOCKOUT_MATCHES_TOTAL =
  MATCH_COUNTS.r32 +
  MATCH_COUNTS.r16 +
  MATCH_COUNTS.qf +
  MATCH_COUNTS.sf +
  MATCH_COUNTS.tp +
  MATCH_COUNTS.final;  // = 32

// Totales máximos por categoría (para UI: "tienes X / Y posibles")
export const MAX_POINTS = {
  // Fase de grupos
  groupWinners:   POINTS.match.winner * MATCH_COUNTS.group,            // 144
  groupExact:     POINTS.match.exactScore * MATCH_COUNTS.group,        // 216
  groupStandings: POINTS.groupStandings.reduce((a, b) => a + b, 0) * 12, // 120
  // Clasificados
  qualifiersR32:   POINTS.qualifiers.r32   * 32,  // 64
  qualifiersR16:   POINTS.qualifiers.r16   * 16,  // 48
  qualifiersQf:    POINTS.qualifiers.qf    * 8,   // 48
  qualifiersSf:    POINTS.qualifiers.sf    * 4,   // 48
  qualifiersFinal: POINTS.qualifiers.final * 2,   // 44
  // Marcadores eliminatorias (NUEVO en 2026)
  koWinners:  POINTS.match.winner     * KNOCKOUT_MATCHES_TOTAL,   // 64
  koExact:    POINTS.match.exactScore * KNOCKOUT_MATCHES_TOTAL,   // 96
  // Top final + goleador
  topPositions: POINTS.topPositions.reduce((a, b) => a + b, 0),   // 218
  topScorer:    POINTS.topScorer,                                  // 50
} as const;

export const TOTAL_MAX_POINTS =
  MAX_POINTS.groupWinners +
  MAX_POINTS.groupExact +
  MAX_POINTS.groupStandings +
  MAX_POINTS.qualifiersR32 +
  MAX_POINTS.qualifiersR16 +
  MAX_POINTS.qualifiersQf +
  MAX_POINTS.qualifiersSf +
  MAX_POINTS.qualifiersFinal +
  MAX_POINTS.koWinners +
  MAX_POINTS.koExact +
  MAX_POINTS.topPositions +
  MAX_POINTS.topScorer;
// = 1160

// Sanity check
if (TOTAL_MAX_POINTS !== 1160) {
  throw new Error(`POINTS configuration broken: total = ${TOTAL_MAX_POINTS}, expected 1160`);
}
