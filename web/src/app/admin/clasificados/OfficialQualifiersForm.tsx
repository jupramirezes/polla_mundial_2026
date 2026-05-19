'use client';

import { useMemo, useState } from 'react';
import { setOfficialQualifier } from '../actions';
import type { Team } from '@/lib/types';

type Round = 'r32' | 'r16' | 'qf' | 'sf' | 'final';

const ROUNDS: Array<{ key: Round; label: string; capacity: number }> = [
  { key: 'r32',   label: 'Dieciseisavos (R32)', capacity: 32 },
  { key: 'r16',   label: 'Octavos',             capacity: 16 },
  { key: 'qf',    label: 'Cuartos',             capacity: 8  },
  { key: 'sf',    label: 'Semifinales',         capacity: 4  },
  { key: 'final', label: 'Final',               capacity: 2  },
];

export function OfficialQualifiersForm({
  teams, initial,
}: { teams: Team[]; initial: Record<Round, number[]> }) {
  const [picks, setPicks] = useState<Record<Round, Set<number>>>(() => ({
    r32:   new Set(initial.r32),
    r16:   new Set(initial.r16),
    qf:    new Set(initial.qf),
    sf:    new Set(initial.sf),
    final: new Set(initial.final),
  }));
  const [active, setActive] = useState<Round>('r32');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamsByGroup = useMemo(() => {
    const m = new Map<string, Team[]>();
    for (const t of teams) {
      if (!m.has(t.group_letter)) m.set(t.group_letter, []);
      m.get(t.group_letter)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [teams]);

  async function toggle(round: Round, teamId: number) {
    setError(null);
    setBusy(teamId);
    const passing = !picks[round].has(teamId);
    const r = await setOfficialQualifier({ round, teamId, passes: passing });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    setPicks((prev) => {
      const next = { ...prev };
      next[round] = new Set(prev[round]);
      if (passing) next[round].add(teamId);
      else next[round].delete(teamId);
      return next;
    });
  }

  const current = ROUNDS.find((r) => r.key === active)!;
  const filled = picks[active].size;

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ROUNDS.map((r) => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition flex items-center gap-2 ${
              r.key === active
                ? 'border-emerald-700 text-emerald-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {r.label}
            <span className="inline-block rounded bg-slate-100 px-1.5 text-xs font-mono">
              {picks[r.key].size}/{r.capacity}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{current.label}</h2>
          <span className="text-sm">
            <span className="font-mono font-bold">{filled}</span>
            <span className="text-slate-500"> / {current.capacity} equipos</span>
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {teamsByGroup.map(([group, ts]) => (
          <div key={group}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Grupo {group}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ts.map((t) => {
                const selected = picks[active].has(t.id);
                const isBusy = busy === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(active, t.id)}
                    disabled={isBusy}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    } ${isBusy ? 'opacity-50' : ''}`}
                  >
                    <span>{t.flag_emoji ?? ''}</span>
                    <span className="truncate text-left">{t.name}</span>
                    {selected && <span className="ml-auto text-emerald-600">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
