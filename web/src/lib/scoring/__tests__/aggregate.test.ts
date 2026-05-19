import { describe, it, expect } from 'vitest';
import { computeUserScore } from '../aggregate';
import { TOTAL_MAX_POINTS } from '../rules';

describe('computeUserScore', () => {
  it('puntaje máximo (acierta TODO) = 1160', () => {
    // Predicciones perfectas
    const groupMatches = new Map<number, { homeScore: number; awayScore: number }>();
    for (let i = 1; i <= 72; i++) groupMatches.set(i, { homeScore: 2, awayScore: 1 });

    const knockoutMatches = new Map<number, { homeScore: number; awayScore: number }>();
    for (let i = 101; i <= 132; i++) knockoutMatches.set(i, { homeScore: 1, awayScore: 0 });

    const groupStandings = new Map<string, Array<{ position: 1|2|3|4; teamId: number }>>();
    for (const letter of ['A','B','C','D','E','F','G','H','I','J','K','L']) {
      groupStandings.set(letter, [
        { position: 1, teamId: 1 },
        { position: 2, teamId: 2 },
        { position: 3, teamId: 3 },
        { position: 4, teamId: 4 },
      ]);
    }

    const qualifiers = {
      r32:   new Set([...Array(32)].map((_, i) => i + 1)),
      r16:   new Set([...Array(16)].map((_, i) => i + 1)),
      qf:    new Set([...Array(8)].map((_, i) => i + 1)),
      sf:    new Set([...Array(4)].map((_, i) => i + 1)),
      final: new Set([1, 2]),
    };

    const topPositions = [
      { position: 1 as const, teamId: 1 },
      { position: 2 as const, teamId: 2 },
      { position: 3 as const, teamId: 3 },
      { position: 4 as const, teamId: 4 },
    ];

    const result = computeUserScore(
      { groupMatches, knockoutMatches, groupStandings, qualifiers, topPositions, topScorer: 'Messi' },
      { groupMatches, knockoutMatches, groupStandings, qualifiers, topPositions, topScorers: ['Messi'] },
    );

    expect(result.total).toBe(TOTAL_MAX_POINTS);
    expect(result.total).toBe(1160);
  });

  it('puntaje mínimo (no acierta nada) = 0', () => {
    const groupMatches = new Map();
    groupMatches.set(1, { homeScore: 0, awayScore: 5 });   // predicción
    const officialGroupMatches = new Map();
    officialGroupMatches.set(1, { homeScore: 5, awayScore: 0 });   // resultado opuesto

    const result = computeUserScore(
      {
        groupMatches,
        knockoutMatches: new Map(),
        groupStandings: new Map(),
        qualifiers: { r32: new Set(), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() },
        topPositions: [],
        topScorer: '',
      },
      {
        groupMatches: officialGroupMatches,
        knockoutMatches: new Map(),
        groupStandings: new Map(),
        qualifiers: { r32: new Set([99]), r16: new Set(), qf: new Set(), sf: new Set(), final: new Set() },
        topPositions: [{ position: 1, teamId: 99 }],
        topScorers: ['Cristiano'],
      },
    );

    expect(result.total).toBe(0);
  });

  it('marcadores de eliminatorias suman correctamente', () => {
    const knockoutMatches = new Map<number, { homeScore: number; awayScore: number }>();
    knockoutMatches.set(101, { homeScore: 2, awayScore: 1 });   // exacto → 5
    knockoutMatches.set(102, { homeScore: 3, awayScore: 0 });   // solo ganador → 2
    knockoutMatches.set(103, { homeScore: 0, awayScore: 0 });   // falla → 0

    const officialKO = new Map<number, { homeScore: number; awayScore: number }>();
    officialKO.set(101, { homeScore: 2, awayScore: 1 });
    officialKO.set(102, { homeScore: 4, awayScore: 0 });
    officialKO.set(103, { homeScore: 1, awayScore: 2 });

    const empty = { r32: new Set<number>(), r16: new Set<number>(), qf: new Set<number>(), sf: new Set<number>(), final: new Set<number>() };

    const result = computeUserScore(
      {
        groupMatches: new Map(),
        knockoutMatches,
        groupStandings: new Map(),
        qualifiers: empty,
        topPositions: [],
        topScorer: '',
      },
      {
        groupMatches: new Map(),
        knockoutMatches: officialKO,
        groupStandings: new Map(),
        qualifiers: empty,
        topPositions: [],
        topScorers: [],
      },
    );

    expect(result.knockoutMatchWinner).toBe(2 + 2);     // 2 partidos con ganador acertado
    expect(result.knockoutMatchExact).toBe(3);          // solo uno con marcador exacto
    expect(result.knockoutWinnersHit).toBe(2);
    expect(result.knockoutExactHit).toBe(1);
    expect(result.knockoutMatchesScored).toBe(3);
    expect(result.total).toBe(7);                       // 5 + 2 + 0
  });

  it('partidos sin predicción no rompen el cálculo', () => {
    const officialGroupMatches = new Map();
    officialGroupMatches.set(1, { homeScore: 1, awayScore: 0 });
    officialGroupMatches.set(2, { homeScore: 0, awayScore: 1 });
    officialGroupMatches.set(3, { homeScore: 1, awayScore: 1 });

    // Solo predice 1 de los 3 partidos
    const groupMatches = new Map();
    groupMatches.set(2, { homeScore: 0, awayScore: 1 });   // exacto → 5

    const empty = { r32: new Set<number>(), r16: new Set<number>(), qf: new Set<number>(), sf: new Set<number>(), final: new Set<number>() };

    const result = computeUserScore(
      { groupMatches, knockoutMatches: new Map(), groupStandings: new Map(), qualifiers: empty, topPositions: [], topScorer: '' },
      { groupMatches: officialGroupMatches, knockoutMatches: new Map(), groupStandings: new Map(), qualifiers: empty, topPositions: [], topScorers: [] },
    );

    expect(result.groupMatchesScored).toBe(1);
    expect(result.total).toBe(5);
  });
});
