// Cuadro OFICIAL de 16avos (R32) que se llena solo a medida que avanza el Mundial:
//   - 1° y 2° de cada grupo que cierra → entran de inmediato a su llave fija.
//   - 8 mejores 3ros → se ubican (vía Anexo C) cuando cierran los 12 grupos.
//   - Si el admin ya generó los cruces, usamos los equipos persistidos (incluye
//     cualquier ajuste manual).
// Una sola fuente de verdad para la pantalla; deriva de los RESULTADOS, no de un botón.

import { R32_MATCHES, ALL_KNOCKOUT_MATCHES } from './bracket/structure';
import { computeGroupStandings, type MatchScore } from './standings';
import { lookupAnnexC, MATCH_FOR_WINNER_VS_THIRD, WINNER_SLOTS_FACING_THIRDS } from './bracket/annex-c';

/** Código externo (R32-01, R16-03, QF-02, SF-01, TP-01, FINAL-01) a partir del nº de match. */
export function codeFromMatchNum(n: number): string {
  if (n >= 73 && n <= 88) return `R32-${String(n - 72).padStart(2, '0')}`;
  if (n >= 89 && n <= 96) return `R16-${String(n - 88).padStart(2, '0')}`;
  if (n >= 97 && n <= 100) return `QF-${String(n - 96).padStart(2, '0')}`;
  if (n >= 101 && n <= 102) return `SF-${String(n - 100).padStart(2, '0')}`;
  if (n === 103) return 'TP-01';
  if (n === 104) return 'FINAL-01';
  return `M${n}`;
}

const POS_LABEL: Record<number, string> = { 1: '1°', 2: '2°', 3: '3°' };

export interface ResolvedR32Slot {
  teamId: number | null;
  /** "1° A", "2° B", "Mejor 3°" */
  label: string;
  pending: null | 'group' | 'third';
}
export interface OfficialR32Match {
  matchNum: number;
  code: string;            // "R32-01"
  slotA: ResolvedR32Slot;
  slotB: ResolvedR32Slot;
}
export interface OfficialR32View {
  matches: OfficialR32Match[];
  finishedGroups: string[];
  totalGroups: number;
  slotsFilled: number;     // de 32
  thirdsResolved: boolean;
}

export function buildOfficialR32(
  teamsByGroup: Map<string, number[]>,
  officialMatchesByGroup: Map<string, MatchScore[]>,
  persistedR32: Map<number, { home: number | null; away: number | null }>,
): OfficialR32View {
  // Posiciones oficiales de cada grupo TERMINADO.
  const standings = new Map<string, ReturnType<typeof computeGroupStandings>>();
  const finishedGroups: string[] = [];
  const groupLetters = Array.from(teamsByGroup.keys());
  for (const letter of groupLetters) {
    const ms = officialMatchesByGroup.get(letter) ?? [];
    const done = ms.length >= 6 && ms.every((m) => m.homeScore != null && m.awayScore != null);
    if (!done) continue;
    standings.set(letter, computeGroupStandings(teamsByGroup.get(letter) ?? [], ms));
    finishedGroups.push(letter);
  }
  const thirdsResolved = groupLetters.length > 0 && finishedGroups.length === groupLetters.length;

  // Asignación de los 8 mejores 3ros a sus llaves (Anexo C), solo si cerraron todos.
  const thirdTeamByMatchNum = new Map<number, number>();
  if (thirdsResolved) {
    const thirds = groupLetters
      .map((g) => {
        const t = standings.get(g)![2];
        return { g, teamId: t.teamId, pts: t.pts, dg: t.dg, gf: t.gf };
      })
      .sort((a, b) => (b.pts - a.pts) || (b.dg - a.dg) || (b.gf - a.gf) || (a.teamId - b.teamId))
      .slice(0, 8);
    const qualifyingGroups = new Set(thirds.map((t) => t.g));
    const thirdTeamByGroup = new Map(thirds.map((t) => [t.g, t.teamId]));
    const opt = lookupAnnexC(qualifyingGroups);
    if (opt) {
      for (let i = 0; i < WINNER_SLOTS_FACING_THIRDS.length; i++) {
        const winnerGroup = WINNER_SLOTS_FACING_THIRDS[i];
        const matchNum = MATCH_FOR_WINNER_VS_THIRD[winnerGroup];
        const teamId = thirdTeamByGroup.get(opt.thirds[i]);
        if (matchNum && teamId) thirdTeamByMatchNum.set(matchNum, teamId);
      }
    }
  }

  const resolveGroupSlot = (group: string, position: number, persisted: number | null): ResolvedR32Slot => {
    if (persisted) return { teamId: persisted, label: `${POS_LABEL[position]} ${group}`, pending: null };
    const st = standings.get(group);
    if (st) return { teamId: st[position - 1].teamId, label: `${POS_LABEL[position]} ${group}`, pending: null };
    return { teamId: null, label: `${POS_LABEL[position]} Grupo ${group}`, pending: 'group' };
  };
  const resolveThirdSlot = (matchNum: number, persisted: number | null): ResolvedR32Slot => {
    if (persisted) return { teamId: persisted, label: 'Mejor 3°', pending: null };
    const derived = thirdTeamByMatchNum.get(matchNum);
    if (derived) return { teamId: derived, label: 'Mejor 3°', pending: null };
    return { teamId: null, label: 'Mejor 3°', pending: 'third' };
  };

  let slotsFilled = 0;
  const matches: OfficialR32Match[] = R32_MATCHES.map((spec) => {
    const p = persistedR32.get(spec.matchNum) ?? { home: null, away: null };
    const slotA = spec.teamA.kind === 'group_position'
      ? resolveGroupSlot(spec.teamA.group, spec.teamA.position, p.home)
      : resolveThirdSlot(spec.matchNum, p.home);
    const slotB = spec.teamB.kind === 'group_position'
      ? resolveGroupSlot(spec.teamB.group, spec.teamB.position, p.away)
      : resolveThirdSlot(spec.matchNum, p.away);
    if (slotA.teamId) slotsFilled++;
    if (slotB.teamId) slotsFilled++;
    const idx = spec.matchNum - 72;
    return { matchNum: spec.matchNum, code: `R32-${String(idx).padStart(2, '0')}`, slotA, slotB };
  });

  return { matches, finishedGroups, totalGroups: groupLetters.length, slotsFilled, thirdsResolved };
}

// ---- Rondas siguientes (octavos → final), formándose a medida que avanza el KO ----

export interface OfficialKoSlot {
  teamId: number | null;
  /** "Ganador R32-01", "Perdedor SF-01" (origen del cupo). */
  label: string;
}
export interface OfficialKoMatch {
  matchNum: number;
  code: string;
  slotA: OfficialKoSlot;
  slotB: OfficialKoSlot;
}
export interface OfficialKoRound {
  stage: string;
  label: string;
  matches: OfficialKoMatch[];
}

const LATER_ROUNDS: Array<{ stage: string; label: string }> = [
  { stage: 'r16', label: 'Octavos' },
  { stage: 'qf', label: 'Cuartos' },
  { stage: 'sf', label: 'Semifinales' },
  { stage: 'tp', label: 'Tercer puesto' },
  { stage: 'final', label: 'Final' },
];

/**
 * Octavos → final del cuadro oficial. Cada cupo se resuelve al equipo persistido
 * (que el auto-llenado pone con cada resultado KO) o muestra su origen
 * ("Ganador R32-01"). Así el cuadro crece solo a medida que avanza el torneo.
 */
export function buildOfficialLaterRounds(
  persisted: Map<number, { home: number | null; away: number | null }>,
): OfficialKoRound[] {
  return LATER_ROUNDS.map(({ stage, label }) => {
    const matches = ALL_KNOCKOUT_MATCHES.filter((s) => s.stage === stage).map((spec) => {
      const p = persisted.get(spec.matchNum) ?? { home: null, away: null };
      const toSlot = (slot: typeof spec.teamA, teamId: number | null): OfficialKoSlot => {
        const adv = slot as { kind: 'winner' | 'loser'; matchNum: number };
        const verb = adv.kind === 'loser' ? 'Perdedor' : 'Ganador';
        return { teamId, label: `${verb} ${codeFromMatchNum(adv.matchNum)}` };
      };
      return {
        matchNum: spec.matchNum,
        code: codeFromMatchNum(spec.matchNum),
        slotA: toSlot(spec.teamA, p.home),
        slotB: toSlot(spec.teamB, p.away),
      };
    });
    return { stage, label, matches };
  });
}
