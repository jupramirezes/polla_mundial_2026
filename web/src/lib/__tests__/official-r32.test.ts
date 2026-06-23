import { describe, it, expect } from 'vitest';
import { computeOfficialR32 } from '../official-r32';
import type { MatchScore } from '../standings';

// Round-robin de 4 equipos donde a>b>c>d (a gana a todos, b gana a c y d, c gana a d).
// Standings resultantes: a=1º (9pts), b=2º (6), c=3º (3), d=4º (0).
function rr(a: number, b: number, c: number, d: number): MatchScore[] {
  const win = (h: number, x: number): MatchScore => ({ homeTeamId: h, awayTeamId: x, homeScore: 1, awayScore: 0 });
  return [win(a, b), win(a, c), win(a, d), win(b, c), win(b, d), win(c, d)];
}

const teamsByGroup = new Map<string, number[]>([
  ['A', [1, 2, 3, 4]],
  ['B', [5, 6, 7, 8]],
]);

describe('computeOfficialR32', () => {
  it('suma top-2 de un grupo terminado y NO resuelve 3ros si faltan grupos', () => {
    const matchesByGroup = new Map<string, MatchScore[]>([
      ['A', rr(1, 2, 3, 4)],
      ['B', []], // grupo B sin jugar
    ]);
    const r = computeOfficialR32(teamsByGroup, matchesByGroup);
    expect(r.thirdsResolved).toBe(false);
    expect(r.finishedGroups).toEqual(['A']);
    expect([...r.teams].sort((x, y) => x - y)).toEqual([1, 2]); // solo top-2 de A
    expect(r.top2ByGroup.get('A')).toEqual([1, 2]);
  });

  it('al cerrar TODOS los grupos agrega los mejores 3ros', () => {
    const matchesByGroup = new Map<string, MatchScore[]>([
      ['A', rr(1, 2, 3, 4)],
      ['B', rr(5, 6, 7, 8)],
    ]);
    const r = computeOfficialR32(teamsByGroup, matchesByGroup);
    expect(r.thirdsResolved).toBe(true);
    // top-2 de A (1,2) + top-2 de B (5,6) + 3ros (3,7), todos caben en los 8 mejores
    expect([...r.teams].sort((x, y) => x - y)).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it('sin grupos terminados: vacío y sin 3ros', () => {
    const matchesByGroup = new Map<string, MatchScore[]>([
      ['A', []],
      ['B', []],
    ]);
    const r = computeOfficialR32(teamsByGroup, matchesByGroup);
    expect(r.teams.size).toBe(0);
    expect(r.thirdsResolved).toBe(false);
  });
});
