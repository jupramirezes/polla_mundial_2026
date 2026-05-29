// Deriva el bracket completo del usuario a partir de sus predicciones de fase
// de grupos + sus picks de ganadores de cada partido KO.

import { computeGroupStandings, type StandingRow } from '@/lib/standings';
import { lookupAnnexC, MATCH_FOR_WINNER_VS_THIRD } from './annex-c';
import {
  ALL_KNOCKOUT_MATCHES,
  type KnockoutMatchSpec, type R32Slot, type AdvanceSlot,
} from './structure';

export interface UserGroupMatchPred {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  groupLetter: string;
}

/** Resolución de un slot del bracket a un team_id concreto (o null si no se puede resolver aún) */
export type ResolvedSlot =
  | { kind: 'resolved'; teamId: number }
  | { kind: 'pending'; reason: string };

export interface DerivedCruce {
  matchNum: number;
  stage: KnockoutMatchSpec['stage'];
  teamA: ResolvedSlot;
  teamB: ResolvedSlot;
  /** Si el usuario ya pickeó ganador, su team_id; sino null */
  userPickedWinnerTeamId: number | null;
}

export interface DerivedBracket {
  cruces: DerivedCruce[];
  /** Mensajes informativos / warnings */
  warnings: string[];
  /** True si el bracket completo está derivable (grupos completos + matchea Anexo C) */
  groupsComplete: boolean;
}

/**
 * Construye el bracket del usuario.
 *  - Si los grupos no están completos: las R32 tendrán slots pendientes.
 *  - Si están completos: los 16 cruces de R32 están resueltos.
 *  - Para R16+, depende de los picks de ganador del usuario.
 */
export function deriveUserBracket(
  groupLetters: string[],
  teamsByGroup: Map<string, number[]>,
  matchPredsByGroup: Map<string, UserGroupMatchPred[]>,
  /** Picks del usuario: matchNum → teamId que el usuario eligió como ganador */
  userPicks: Map<number, number>,
): DerivedBracket {
  const warnings: string[] = [];

  // ---- 1. Standings por grupo ----
  const standingsByGroup = new Map<string, StandingRow[]>();
  let incompleteGroups = 0;

  for (const letter of groupLetters) {
    const preds = matchPredsByGroup.get(letter) ?? [];
    const teamIds = teamsByGroup.get(letter) ?? [];
    const matches = preds.map((p) => ({
      homeTeamId: p.homeTeamId, awayTeamId: p.awayTeamId,
      homeScore: p.homeScore as number | null,
      awayScore: p.awayScore as number | null,
    }));
    const standings = computeGroupStandings(teamIds, matches);
    standingsByGroup.set(letter, standings);
    if (preds.length !== 6) incompleteGroups++;
  }
  const groupsComplete = incompleteGroups === 0;
  if (!groupsComplete) {
    warnings.push(`Faltan ${incompleteGroups} grupo(s) por completar para derivar todo el R32.`);
  }

  // ---- 2. Identificar los 8 mejores 3ros (regla FIFA: Pts → DG → GF) ----
  const thirdsByGroup = new Map<string, StandingRow>();
  const thirdsList: Array<StandingRow & { groupLetter: string }> = [];
  for (const [letter, standings] of standingsByGroup) {
    if (standings.length >= 3) {
      const third = standings[2];
      thirdsByGroup.set(letter, third);
      // Solo considerar 3ros de grupos completos (sino las stats no son finales)
      if ((matchPredsByGroup.get(letter)?.length ?? 0) === 6) {
        thirdsList.push({ ...third, groupLetter: letter });
      }
    }
  }
  thirdsList.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.teamId - b.teamId;  // tiebreak determinístico
  });
  const best8Thirds = thirdsList.slice(0, 8);
  const qualifyingGroups = new Set(best8Thirds.map((t) => t.groupLetter));

  // ---- 3. Lookup Anexo C ----
  let annexCMapping: Map<number, number> | null = null;  // matchNum → team_id del 3°
  if (qualifyingGroups.size === 8) {
    const opt = lookupAnnexC(qualifyingGroups);
    if (opt) {
      // opt.thirds = array de 8 letras, en orden de WINNER_SLOTS_FACING_THIRDS = [A,B,D,E,G,I,K,L]
      const slotsOrder = ['A', 'B', 'D', 'E', 'G', 'I', 'K', 'L'];
      annexCMapping = new Map();
      for (let i = 0; i < 8; i++) {
        const winnerGroup = slotsOrder[i];   // ej. 'A'
        const thirdGroup = opt.thirds[i];    // ej. 'E' (la letra del grupo del 3° que juega contra 1A)
        const matchNum = MATCH_FOR_WINNER_VS_THIRD[winnerGroup];  // ej. 79
        const thirdTeam = thirdsByGroup.get(thirdGroup);
        if (thirdTeam) annexCMapping.set(matchNum, thirdTeam.teamId);
      }
    } else {
      warnings.push('No se pudo resolver el Anexo C para los terceros calculados. Algo está mal en los datos.');
    }
  }

  // ---- 4. Resolver R32 cruces ----
  function resolveR32Slot(slot: R32Slot): ResolvedSlot {
    if (slot.kind === 'group_position') {
      const standings = standingsByGroup.get(slot.group);
      if (!standings) return { kind: 'pending', reason: 'sin grupo' };
      const row = standings.find((s) => s.position === slot.position);
      if (!row) return { kind: 'pending', reason: 'sin posición' };
      const groupComplete = (matchPredsByGroup.get(slot.group)?.length ?? 0) === 6;
      if (!groupComplete) return { kind: 'pending', reason: `Grupo ${slot.group} incompleto` };
      return { kind: 'resolved', teamId: row.teamId };
    }
    // third_from_annex_c
    if (annexCMapping) {
      const tid = annexCMapping.get(slot.matchNum);
      if (tid) return { kind: 'resolved', teamId: tid };
    }
    return { kind: 'pending', reason: 'Esperando todos los grupos para asignar 3ros' };
  }

  // ---- 5. Resolver cruces avanzados (R16+) ----
  // Mantenemos un map matchNum → winnerTeamId | loserTeamId basado en userPicks
  function getMatchOutcome(matchNum: number): { winner: number | null; loser: number | null; teamA: number | null; teamB: number | null } {
    const spec = ALL_KNOCKOUT_MATCHES.find((m) => m.matchNum === matchNum);
    if (!spec) return { winner: null, loser: null, teamA: null, teamB: null };
    const a = resolveSlot(spec.teamA);
    const b = resolveSlot(spec.teamB);
    const aId = a.kind === 'resolved' ? a.teamId : null;
    const bId = b.kind === 'resolved' ? b.teamId : null;
    const winner = userPicks.get(matchNum) ?? null;
    let loser: number | null = null;
    if (winner && aId && bId) {
      loser = winner === aId ? bId : aId;
    }
    return { winner, loser, teamA: aId, teamB: bId };
  }

  function resolveSlot(slot: R32Slot | AdvanceSlot): ResolvedSlot {
    if (slot.kind === 'group_position' || slot.kind === 'third_from_annex_c') {
      return resolveR32Slot(slot as R32Slot);
    }
    // AdvanceSlot: winner o loser de matchNum
    const outcome = getMatchOutcome(slot.matchNum);
    const tid = slot.kind === 'winner' ? outcome.winner : outcome.loser;
    if (tid) return { kind: 'resolved', teamId: tid };
    return { kind: 'pending', reason: `Esperando ganador de M${slot.matchNum}` };
  }

  // ---- 6. Construir lista de cruces ----
  // IMPORTANTE: si la fase de grupos NO está completa, el bracket entero es
  // indeterminable. Los slots de R16+ se resuelven a partir de los PICKS del
  // usuario (ganador de Mxx), no de los grupos; así que con datos "huérfanos"
  // (picks guardados sin haber llenado los grupos) las rondas avanzadas se
  // "auto-resolverían" entre ellas y aparecerían como válidas aunque R32 esté
  // pendiente. Para evitar eso, forzamos TODO a pendiente hasta que los 72
  // marcadores de grupos estén guardados. Esto deja inertes los picks legacy
  // sin grupos e impide crear nuevos (saveBracketWinner valida contra esto).
  const groupsPendingSlot: ResolvedSlot = { kind: 'pending', reason: 'Completa la fase de grupos' };
  const cruces: DerivedCruce[] = ALL_KNOCKOUT_MATCHES.map((spec) => {
    if (!groupsComplete) {
      return {
        matchNum: spec.matchNum,
        stage: spec.stage,
        teamA: groupsPendingSlot,
        teamB: groupsPendingSlot,
        userPickedWinnerTeamId: userPicks.get(spec.matchNum) ?? null,
      };
    }
    return {
      matchNum: spec.matchNum,
      stage: spec.stage,
      teamA: resolveSlot(spec.teamA),
      teamB: resolveSlot(spec.teamB),
      userPickedWinnerTeamId: userPicks.get(spec.matchNum) ?? null,
    };
  });

  return { cruces, warnings, groupsComplete };
}

/** Helper: agrupa los cruces por etapa */
export function crucesByStage(cruces: DerivedCruce[]): Map<string, DerivedCruce[]> {
  const m = new Map<string, DerivedCruce[]>();
  for (const c of cruces) {
    if (!m.has(c.stage)) m.set(c.stage, []);
    m.get(c.stage)!.push(c);
  }
  return m;
}
