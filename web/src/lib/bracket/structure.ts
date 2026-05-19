// Estructura completa del bracket del Mundial 2026, extraída del PDF oficial
// de FIFA Regulations (sección 12.6 a 12.11, páginas 23-25).
//
// Cada partido KO se identifica por su número de match (73-104).
// Los partidos se conectan: M89 = W74 vs W77, etc.

export type GroupLetter = 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L';
export type Position = 1 | 2 | 3;  // 1°, 2°, 3° del grupo

/** Slot de un equipo en R32: viene del grupo X en posición N, o de un 3° asignado por Anexo C */
export type R32Slot =
  | { kind: 'group_position'; group: GroupLetter; position: Position }
  | { kind: 'third_from_annex_c'; /** A qué match va el 3° asignado por Anexo C */ matchNum: number };

/** Slot de un equipo en R16+: viene como ganador (o perdedor para 3er puesto) de un match previo */
export type AdvanceSlot =
  | { kind: 'winner'; matchNum: number }
  | { kind: 'loser'; matchNum: number };

export interface KnockoutMatchSpec {
  matchNum: number;
  stage: 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';
  /** Equipo 'A' (local nominal) — viene de... */
  teamA: R32Slot | AdvanceSlot;
  /** Equipo 'B' — viene de... */
  teamB: R32Slot | AdvanceSlot;
}

// =============================================================
// R32 — 16 partidos (M73-M88)
// =============================================================
// 8 partidos FIJOS (ambos equipos del grupo, sin 3ros):
//   M73, M75, M76, M78, M83, M84, M86, M88
// 8 partidos que involucran 1 ganador de grupo vs 1 tercero asignado por Anexo C:
//   M74, M77, M79, M80, M81, M82, M85, M87
export const R32_MATCHES: KnockoutMatchSpec[] = [
  { matchNum: 73, stage: 'r32',
    teamA: { kind: 'group_position', group: 'A', position: 2 },
    teamB: { kind: 'group_position', group: 'B', position: 2 } },
  { matchNum: 74, stage: 'r32',
    teamA: { kind: 'group_position', group: 'E', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 74 } },
  { matchNum: 75, stage: 'r32',
    teamA: { kind: 'group_position', group: 'F', position: 1 },
    teamB: { kind: 'group_position', group: 'C', position: 2 } },
  { matchNum: 76, stage: 'r32',
    teamA: { kind: 'group_position', group: 'C', position: 1 },
    teamB: { kind: 'group_position', group: 'F', position: 2 } },
  { matchNum: 77, stage: 'r32',
    teamA: { kind: 'group_position', group: 'I', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 77 } },
  { matchNum: 78, stage: 'r32',
    teamA: { kind: 'group_position', group: 'E', position: 2 },
    teamB: { kind: 'group_position', group: 'I', position: 2 } },
  { matchNum: 79, stage: 'r32',
    teamA: { kind: 'group_position', group: 'A', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 79 } },
  { matchNum: 80, stage: 'r32',
    teamA: { kind: 'group_position', group: 'L', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 80 } },
  { matchNum: 81, stage: 'r32',
    teamA: { kind: 'group_position', group: 'D', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 81 } },
  { matchNum: 82, stage: 'r32',
    teamA: { kind: 'group_position', group: 'G', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 82 } },
  { matchNum: 83, stage: 'r32',
    teamA: { kind: 'group_position', group: 'K', position: 2 },
    teamB: { kind: 'group_position', group: 'L', position: 2 } },
  { matchNum: 84, stage: 'r32',
    teamA: { kind: 'group_position', group: 'H', position: 1 },
    teamB: { kind: 'group_position', group: 'J', position: 2 } },
  { matchNum: 85, stage: 'r32',
    teamA: { kind: 'group_position', group: 'B', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 85 } },
  { matchNum: 86, stage: 'r32',
    teamA: { kind: 'group_position', group: 'J', position: 1 },
    teamB: { kind: 'group_position', group: 'H', position: 2 } },
  { matchNum: 87, stage: 'r32',
    teamA: { kind: 'group_position', group: 'K', position: 1 },
    teamB: { kind: 'third_from_annex_c', matchNum: 87 } },
  { matchNum: 88, stage: 'r32',
    teamA: { kind: 'group_position', group: 'D', position: 2 },
    teamB: { kind: 'group_position', group: 'G', position: 2 } },
];

// =============================================================
// R16 — 8 partidos (M89-M96), sección 12.7 del reglamento
// =============================================================
export const R16_MATCHES: KnockoutMatchSpec[] = [
  { matchNum: 89, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 74 },
    teamB: { kind: 'winner', matchNum: 77 } },
  { matchNum: 90, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 73 },
    teamB: { kind: 'winner', matchNum: 75 } },
  { matchNum: 91, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 76 },
    teamB: { kind: 'winner', matchNum: 78 } },
  { matchNum: 92, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 79 },
    teamB: { kind: 'winner', matchNum: 80 } },
  { matchNum: 93, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 83 },
    teamB: { kind: 'winner', matchNum: 84 } },
  { matchNum: 94, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 81 },
    teamB: { kind: 'winner', matchNum: 82 } },
  { matchNum: 95, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 86 },
    teamB: { kind: 'winner', matchNum: 88 } },
  { matchNum: 96, stage: 'r16',
    teamA: { kind: 'winner', matchNum: 85 },
    teamB: { kind: 'winner', matchNum: 87 } },
];

// =============================================================
// QF — 4 partidos (M97-M100), sección 12.8
// =============================================================
export const QF_MATCHES: KnockoutMatchSpec[] = [
  { matchNum: 97, stage: 'qf',
    teamA: { kind: 'winner', matchNum: 89 },
    teamB: { kind: 'winner', matchNum: 90 } },
  { matchNum: 98, stage: 'qf',
    teamA: { kind: 'winner', matchNum: 93 },
    teamB: { kind: 'winner', matchNum: 94 } },
  { matchNum: 99, stage: 'qf',
    teamA: { kind: 'winner', matchNum: 91 },
    teamB: { kind: 'winner', matchNum: 92 } },
  { matchNum: 100, stage: 'qf',
    teamA: { kind: 'winner', matchNum: 95 },
    teamB: { kind: 'winner', matchNum: 96 } },
];

// =============================================================
// SF — 2 partidos (M101-M102), sección 12.9
// =============================================================
export const SF_MATCHES: KnockoutMatchSpec[] = [
  { matchNum: 101, stage: 'sf',
    teamA: { kind: 'winner', matchNum: 97 },
    teamB: { kind: 'winner', matchNum: 98 } },
  { matchNum: 102, stage: 'sf',
    teamA: { kind: 'winner', matchNum: 99 },
    teamB: { kind: 'winner', matchNum: 100 } },
];

// =============================================================
// Tercer puesto y Final — sección 12.10 / 12.11
// =============================================================
export const TP_MATCH: KnockoutMatchSpec = {
  matchNum: 103, stage: 'tp',
  teamA: { kind: 'loser', matchNum: 101 },
  teamB: { kind: 'loser', matchNum: 102 },
};

export const FINAL_MATCH: KnockoutMatchSpec = {
  matchNum: 104, stage: 'final',
  teamA: { kind: 'winner', matchNum: 101 },
  teamB: { kind: 'winner', matchNum: 102 },
};

// =============================================================
// Todos los partidos KO en un arreglo
// =============================================================
export const ALL_KNOCKOUT_MATCHES: KnockoutMatchSpec[] = [
  ...R32_MATCHES, ...R16_MATCHES, ...QF_MATCHES, ...SF_MATCHES,
  TP_MATCH, FINAL_MATCH,
];

export const STAGE_LABEL: Record<KnockoutMatchSpec['stage'], string> = {
  r32: 'Dieciseisavos',
  r16: 'Octavos',
  qf:  'Cuartos',
  sf:  'Semifinales',
  tp:  'Tercer puesto',
  final: 'Final',
};
