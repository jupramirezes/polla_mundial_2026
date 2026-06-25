import { describe, it, expect } from 'vitest';
import { buildOfficialR32 } from '../official-bracket';
import type { MatchScore } from '../standings';

// Round-robin de 4 equipos: a>b>c>d → standings a=1º, b=2º, c=3º, d=4º.
function rr(a: number, b: number, c: number, d: number): MatchScore[] {
  const win = (h: number, x: number): MatchScore => ({ homeTeamId: h, awayTeamId: x, homeScore: 1, awayScore: 0 });
  return [win(a, b), win(a, c), win(a, d), win(b, c), win(b, d), win(c, d)];
}

// 12 grupos A..L con 4 equipos cada uno (ids 1..48).
const LETTERS = 'ABCDEFGHIJKL'.split('');
const teamsByGroup = new Map<string, number[]>();
LETTERS.forEach((l, gi) => teamsByGroup.set(l, [gi * 4 + 1, gi * 4 + 2, gi * 4 + 3, gi * 4 + 4]));

const noPersisted = new Map<number, { home: number | null; away: number | null }>();

describe('buildOfficialR32', () => {
  it('rellena los slots de un grupo cerrado y deja pendientes los demás', () => {
    // Solo cierra el Grupo A (equipos 1,2,3,4): 1º=1, 2º=2, 3º=3.
    const off = new Map<string, MatchScore[]>([['A', rr(1, 2, 3, 4)]]);
    const view = buildOfficialR32(teamsByGroup, off, noPersisted);

    expect(view.finishedGroups).toEqual(['A']);
    expect(view.totalGroups).toBe(12);
    expect(view.thirdsResolved).toBe(false);

    // M79 = 1A vs 3X → slotA debe ser el 1º de A (equipo 1); el 3º, pendiente.
    const m79 = view.matches.find((m) => m.matchNum === 79)!;
    expect(m79.slotA.teamId).toBe(1);
    expect(m79.slotB.pending).toBe('third');

    // M73 = 2A vs 2B → slotA = 2º de A (equipo 2); slotB pendiente (B no cerró).
    const m73 = view.matches.find((m) => m.matchNum === 73)!;
    expect(m73.slotA.teamId).toBe(2);
    expect(m73.slotB.pending).toBe('group');

    // 2 cupos definidos (1A y 2A).
    expect(view.slotsFilled).toBe(2);
  });

  it('usa los equipos persistidos si el admin ya generó los cruces', () => {
    const persisted = new Map<number, { home: number | null; away: number | null }>([
      [73, { home: 99, away: 98 }],
    ]);
    const view = buildOfficialR32(teamsByGroup, new Map(), persisted);
    const m73 = view.matches.find((m) => m.matchNum === 73)!;
    expect(m73.slotA.teamId).toBe(99);
    expect(m73.slotB.teamId).toBe(98);
  });
});
