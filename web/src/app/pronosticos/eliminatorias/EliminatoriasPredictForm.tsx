'use client';

import { useMemo, useState } from 'react';
import { saveKnockoutPrediction } from './actions';
import type { MatchRow, Team } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  r32: 'Dieciseisavos (R32)',
  r16: 'Octavos',
  qf:  'Cuartos',
  sf:  'Semifinales',
  tp:  'Tercer puesto',
  final: 'Final',
};
const STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function EliminatoriasPredictForm({
  teams, matches, initialPreds,
}: { teams: Team[]; matches: MatchRow[]; initialPreds: Array<[number, { home: number; away: number }]> }) {
  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const matchesByStage = useMemo(() => {
    const m = new Map<string, MatchRow[]>();
    for (const match of matches) {
      if (!m.has(match.stage)) m.set(match.stage, []);
      m.get(match.stage)!.push(match);
    }
    return m;
  }, [matches]);

  const [scores, setScores] = useState<Map<number, { home: string; away: string }>>(() => {
    const m = new Map<number, { home: string; away: string }>();
    for (const [mid, { home, away }] of initialPreds) {
      m.set(mid, { home: String(home), away: String(away) });
    }
    return m;
  });
  const [statuses, setStatuses] = useState<Map<number, Status>>(new Map());

  const timeouts = useMemo(() => new Map<number, ReturnType<typeof setTimeout>>(), []);

  function update(matchId: number, side: 'home' | 'away', raw: string) {
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 2);
    setScores((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId) ?? { home: '', away: '' };
      next.set(matchId, { ...cur, [side]: clean });
      return next;
    });
    const existing = timeouts.get(matchId);
    if (existing) clearTimeout(existing);
    timeouts.set(matchId, setTimeout(() => persist(matchId), 600));
  }

  async function persist(matchId: number) {
    const cur = scores.get(matchId);
    if (!cur) return;
    const hasBoth = cur.home !== '' && cur.away !== '';
    const hasNeither = cur.home === '' && cur.away === '';
    if (!hasBoth && !hasNeither) return;
    setStatuses((s) => new Map(s).set(matchId, 'saving'));
    const r = await saveKnockoutPrediction({
      matchId,
      homeScore: hasBoth ? Number(cur.home) : null,
      awayScore: hasBoth ? Number(cur.away) : null,
    });
    setStatuses((s) => new Map(s).set(matchId, r.ok ? 'saved' : 'error'));
    if (r.ok) {
      setTimeout(() => {
        setStatuses((s) => {
          const next = new Map(s);
          if (next.get(matchId) === 'saved') next.delete(matchId);
          return next;
        });
      }, 1500);
    }
  }

  // Determinar qué partidos están "abiertos" para predecir
  // (deben tener ambos equipos asignados y no estar locked)
  const totalOpen = matches.filter((m) => m.home_team_id && m.away_team_id && !m.result_locked).length;
  const totalFilled = Array.from(scores.values()).filter((v) => v.home !== '' && v.away !== '').length;

  return (
    <div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>{totalFilled}/{totalOpen}</strong> partidos predichos · 2 pts ganador + 3 pts marcador exacto
      </div>

      <div className="mt-6 space-y-6">
        {STAGE_ORDER.map((stage) => {
          const stageMatches = matchesByStage.get(stage) ?? [];
          const openMatches = stageMatches.filter((m) => m.home_team_id && m.away_team_id);
          if (openMatches.length === 0) {
            return (
              <section key={stage}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
                  {STAGE_LABEL[stage]}
                </h2>
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  🔒 Esta ronda se abrirá cuando el admin asigne los equipos a cada partido.
                </div>
              </section>
            );
          }

          return (
            <section key={stage}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
                {STAGE_LABEL[stage]} <span className="font-mono text-xs text-slate-500">({openMatches.length} partidos)</span>
              </h2>
              <div className="space-y-2">
                {openMatches.map((m) => {
                  const home = teamById.get(m.home_team_id!);
                  const away = teamById.get(m.away_team_id!);
                  const cur = scores.get(m.id) ?? { home: '', away: '' };
                  const status = statuses.get(m.id);
                  const locked = m.result_locked;
                  return (
                    <div key={m.id} className={`flex items-center gap-2 rounded-lg border p-3 ${
                      locked ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex-1 text-right text-sm font-medium truncate">
                        {home?.flag_emoji ?? ''} {home?.name}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={cur.home}
                        onChange={(e) => update(m.id, 'home', e.target.value)}
                        disabled={locked}
                        className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={cur.away}
                        onChange={(e) => update(m.id, 'away', e.target.value)}
                        disabled={locked}
                        className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                      />
                      <div className="flex-1 text-left text-sm font-medium truncate">
                        {away?.flag_emoji ?? ''} {away?.name}
                      </div>
                      <span className="shrink-0 w-20 text-right text-[10px] font-semibold">
                        {locked && <span className="text-slate-500">🔒 cerrado</span>}
                        {!locked && status === 'saving' && <span className="text-blue-700">guardando…</span>}
                        {!locked && status === 'saved'  && <span className="text-emerald-700">✓ ok</span>}
                        {!locked && status === 'error'  && <span className="text-red-700">error</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
