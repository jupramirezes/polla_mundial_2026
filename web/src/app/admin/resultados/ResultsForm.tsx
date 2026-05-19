'use client';

import { useMemo, useState } from 'react';
import { saveMatchResult } from '../actions';
import type { MatchRow, Team } from '@/lib/types';

interface Props {
  teams: Team[];
  matches: MatchRow[];
}

const STAGE_LABEL: Record<string, string> = {
  group: 'Fase de grupos',
  r32: 'Dieciseisavos (R32)',
  r16: 'Octavos',
  qf: 'Cuartos',
  sf: 'Semifinales',
  tp: 'Tercer puesto',
  final: 'Final',
};

const STAGE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'tp', 'final'];

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function ResultsForm({ teams, matches }: Props) {
  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const [scores, setScores] = useState<Map<number, { home: string; away: string }>>(() => {
    const m = new Map<number, { home: string; away: string }>();
    for (const match of matches) {
      m.set(match.id, {
        home: match.home_score == null ? '' : String(match.home_score),
        away: match.away_score == null ? '' : String(match.away_score),
      });
    }
    return m;
  });
  const [statuses, setStatuses] = useState<Map<number, Status>>(new Map());
  const [activeStage, setActiveStage] = useState<string>('group');

  const matchesByStage = useMemo(() => {
    const m = new Map<string, MatchRow[]>();
    for (const match of matches) {
      if (!m.has(match.stage)) m.set(match.stage, []);
      m.get(match.stage)!.push(match);
    }
    return m;
  }, [matches]);

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
    if (!hasBoth && !hasNeither) {
      // espera a que llene ambos
      return;
    }
    setStatuses((s) => new Map(s).set(matchId, 'saving'));
    const r = await saveMatchResult({
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

  const visibleMatches = matchesByStage.get(activeStage) ?? [];

  return (
    <div>
      {/* Tabs por etapa */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {STAGE_ORDER.map((stage) => {
          const all = matchesByStage.get(stage) ?? [];
          const done = all.filter((m) => m.home_score != null).length;
          const active = stage === activeStage;
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {STAGE_LABEL[stage]}
              <span className="ml-2 inline-block rounded bg-slate-100 px-1.5 text-xs font-mono">
                {done}/{all.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 space-y-1">
        {visibleMatches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No hay partidos en esta ronda todavía.
          </div>
        ) : (
          visibleMatches.map((m) => {
            const home = m.home_team_id ? teamById.get(m.home_team_id) : null;
            const away = m.away_team_id ? teamById.get(m.away_team_id) : null;
            const cur = scores.get(m.id) ?? { home: '', away: '' };
            const status = statuses.get(m.id);
            const pending = !home || !away;
            return (
              <div key={m.id} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2">
                <span className="w-16 shrink-0 text-xs text-slate-500 font-mono">{m.external_code}</span>
                <div className="flex-1 text-right text-sm font-medium truncate">
                  {home ? <>{home.flag_emoji ?? ''} {home.name}</> : <span className="text-slate-400 italic">por definir</span>}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={cur.home}
                  onChange={(e) => update(m.id, 'home', e.target.value)}
                  disabled={pending}
                  className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-30"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={2}
                  value={cur.away}
                  onChange={(e) => update(m.id, 'away', e.target.value)}
                  disabled={pending}
                  className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-30"
                />
                <div className="flex-1 text-left text-sm font-medium truncate">
                  {away ? <>{away.flag_emoji ?? ''} {away.name}</> : <span className="text-slate-400 italic">por definir</span>}
                </div>
                <span className="w-5 text-xs">
                  {status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? '✗' : ''}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
