import { describe, it, expect } from 'vitest';
import {
  scoreMatch,
  scoreGroupMatch,
  scoreGroupStandings,
  scoreQualifiers,
  scoreTopPositions,
  scoreTopScorer,
} from '../calculate';
import { MAX_POINTS, TOTAL_MAX_POINTS, KNOCKOUT_MATCHES_TOTAL } from '../rules';

describe('POINTS sanity', () => {
  it('suma 1160 exactos (1000 base + 160 marcadores eliminatorias)', () => {
    expect(TOTAL_MAX_POINTS).toBe(1160);
  });

  it('KNOCKOUT_MATCHES_TOTAL = 32', () => {
    expect(KNOCKOUT_MATCHES_TOTAL).toBe(32);  // 16+8+4+2+1+1
  });

  it('máximos por categoría correctos', () => {
    expect(MAX_POINTS.groupWinners).toBe(144);     // 2 × 72
    expect(MAX_POINTS.groupExact).toBe(216);       // 3 × 72
    expect(MAX_POINTS.groupStandings).toBe(120);   // (4+3+2+1) × 12
    expect(MAX_POINTS.qualifiersR32).toBe(64);
    expect(MAX_POINTS.qualifiersR16).toBe(48);
    expect(MAX_POINTS.qualifiersQf).toBe(48);
    expect(MAX_POINTS.qualifiersSf).toBe(48);
    expect(MAX_POINTS.qualifiersFinal).toBe(44);
    expect(MAX_POINTS.koWinners).toBe(64);          // 2 × 32
    expect(MAX_POINTS.koExact).toBe(96);            // 3 × 32
    expect(MAX_POINTS.topPositions).toBe(218);     // 90+60+40+28
    expect(MAX_POINTS.topScorer).toBe(50);
  });
});

describe('scoreMatch (grupos y eliminatorias)', () => {
  it('marcador exacto: gana 2 (ganador) + 3 (exacto) = 5', () => {
    const r = scoreMatch({ homeScore: 2, awayScore: 1 }, { homeScore: 2, awayScore: 1 });
    expect(r.winnerPoints).toBe(2);
    expect(r.exactPoints).toBe(3);
    expect(r.total).toBe(5);
  });

  it('acierta ganador pero no marcador: gana 2 sólo', () => {
    const r = scoreMatch({ homeScore: 2, awayScore: 1 }, { homeScore: 3, awayScore: 0 });
    expect(r.winnerPoints).toBe(2);
    expect(r.exactPoints).toBe(0);
    expect(r.total).toBe(2);
  });

  it('falla ganador: 0 puntos', () => {
    const r = scoreMatch({ homeScore: 2, awayScore: 1 }, { homeScore: 0, awayScore: 1 });
    expect(r.total).toBe(0);
  });

  it('empate exacto: 2 + 3 = 5', () => {
    const r = scoreMatch({ homeScore: 1, awayScore: 1 }, { homeScore: 1, awayScore: 1 });
    expect(r.total).toBe(5);
  });

  it('empate predicho pero marcador distinto: gana 2', () => {
    const r = scoreMatch({ homeScore: 1, awayScore: 1 }, { homeScore: 2, awayScore: 2 });
    expect(r.winnerPoints).toBe(2);
    expect(r.exactPoints).toBe(0);
  });

  it('empate predicho pero gana uno: 0 puntos', () => {
    const r = scoreMatch({ homeScore: 1, awayScore: 1 }, { homeScore: 2, awayScore: 0 });
    expect(r.total).toBe(0);
  });

  it('scoreGroupMatch sigue siendo un alias de scoreMatch', () => {
    expect(scoreGroupMatch).toBe(scoreMatch);
  });
});

describe('scoreGroupStandings', () => {
  const ideal = [
    { position: 1, teamId: 1 },
    { position: 2, teamId: 2 },
    { position: 3, teamId: 3 },
    { position: 4, teamId: 4 },
  ] as const;

  it('acierta los 4: 4+3+2+1 = 10', () => {
    const pts = scoreGroupStandings([...ideal], [...ideal]);
    expect(pts).toBe(10);
  });

  it('acierta solo el 1°: 4 puntos', () => {
    const preds = [
      { position: 1, teamId: 1 },
      { position: 2, teamId: 99 },
      { position: 3, teamId: 98 },
      { position: 4, teamId: 97 },
    ] as const;
    expect(scoreGroupStandings([...preds], [...ideal])).toBe(4);
  });

  it('invierte 1° y 2°: solo acierta 3° y 4° = 3', () => {
    const preds = [
      { position: 1, teamId: 2 },
      { position: 2, teamId: 1 },
      { position: 3, teamId: 3 },
      { position: 4, teamId: 4 },
    ] as const;
    expect(scoreGroupStandings([...preds], [...ideal])).toBe(2 + 1);
  });

  it('sin predicción: 0', () => {
    expect(scoreGroupStandings([], [...ideal])).toBe(0);
  });
});

describe('scoreQualifiers', () => {
  it('R32 acierta 10 de 32: 10 × 2 = 20', () => {
    const predicted = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const official  = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(scoreQualifiers('r32', predicted, official)).toBe(20);
  });

  it('R16 acierta 16 de 16: 16 × 3 = 48 (máximo)', () => {
    const teams = new Set([...Array(16)].map((_, i) => i + 1));
    expect(scoreQualifiers('r16', teams, teams)).toBe(48);
  });

  it('Final acierta 1 de 2: 22 pts', () => {
    expect(scoreQualifiers('final', new Set([10, 20]), new Set([10, 30]))).toBe(22);
  });

  it('Final acierta 2 de 2: 44 pts', () => {
    expect(scoreQualifiers('final', new Set([10, 20]), new Set([10, 20]))).toBe(44);
  });

  it('predicción vacía: 0', () => {
    expect(scoreQualifiers('r32', new Set(), new Set([1, 2, 3]))).toBe(0);
  });

  it('equipos extras no penalizan: solo cuenta intersección', () => {
    const predicted = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99]);
    const official  = new Set([1, 2, 99]);
    expect(scoreQualifiers('r16', predicted, official)).toBe(3 * 3);
  });
});

describe('scoreTopPositions', () => {
  const ideal = [
    { position: 1 as const, teamId: 1 },
    { position: 2 as const, teamId: 2 },
    { position: 3 as const, teamId: 3 },
    { position: 4 as const, teamId: 4 },
  ];

  it('acierta los 4: 90+60+40+28 = 218', () => {
    const r = scoreTopPositions(ideal, ideal);
    expect(r.total).toBe(218);
    expect(r.byPosition[1]).toBe(90);
  });

  it('acierta solo campeón: 90', () => {
    const preds = [
      { position: 1 as const, teamId: 1 },
      { position: 2 as const, teamId: 99 },
      { position: 3 as const, teamId: 98 },
      { position: 4 as const, teamId: 97 },
    ];
    expect(scoreTopPositions(preds, ideal).total).toBe(90);
  });

  it('acierta 3° solamente: 40', () => {
    const preds = [
      { position: 1 as const, teamId: 99 },
      { position: 2 as const, teamId: 98 },
      { position: 3 as const, teamId: 3 },
      { position: 4 as const, teamId: 97 },
    ];
    expect(scoreTopPositions(preds, ideal).total).toBe(40);
  });
});

describe('scoreTopScorer', () => {
  it('acierta exacto: 50', () => {
    expect(scoreTopScorer('Lionel Messi', ['Lionel Messi'])).toBe(50);
  });

  it('case insensitive + trim', () => {
    expect(scoreTopScorer('  lionel MESSI  ', ['Lionel Messi'])).toBe(50);
  });

  it('falla: 0', () => {
    expect(scoreTopScorer('Cristiano Ronaldo', ['Lionel Messi'])).toBe(0);
  });

  it('múltiples goleadores empatados — acierta uno: 50', () => {
    expect(scoreTopScorer('Mbappé', ['Mbappé', 'Messi'])).toBe(50);
    expect(scoreTopScorer('Messi', ['Mbappé', 'Messi'])).toBe(50);
  });

  it('múltiples goleadores empatados — acierta ninguno: 0', () => {
    expect(scoreTopScorer('Cristiano', ['Mbappé', 'Messi'])).toBe(0);
  });
});
