'use client';

import { useMemo, useState } from 'react';
import { toggleQualifier } from './actions';
import type { Team } from '@/lib/types';

type Round = 'r32' | 'r16' | 'qf' | 'sf' | 'final';

const ROUNDS: Array<{ key: Round; label: string; capacity: number; pts: number }> = [
  { key: 'r32',   label: 'Dieciseisavos (R32)', capacity: 32, pts: 2 },
  { key: 'r16',   label: 'Octavos',             capacity: 16, pts: 3 },
  { key: 'qf',    label: 'Cuartos',             capacity: 8,  pts: 6 },
  { key: 'sf',    label: 'Semifinales',         capacity: 4,  pts: 12 },
  { key: 'final', label: 'Final',               capacity: 2,  pts: 22 },
];

interface Props {
  teams: Team[];
  initial: Record<Round, number[]>;
}

export function QualifiersForm({ teams, initial }: Props) {
  const [picks, setPicks] = useState<Record<Round, Set<number>>>(() => ({
    r32:   new Set(initial.r32),
    r16:   new Set(initial.r16),
    qf:    new Set(initial.qf),
    sf:    new Set(initial.sf),
    final: new Set(initial.final),
  }));
  const [activeRound, setActiveRound] = useState<Round>('r32');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Equipos agrupados por grupo
  const teamsByGroup = useMemo(() => {
    const m = new Map<string, Team[]>();
    for (const t of teams) {
      if (!m.has(t.group_letter)) m.set(t.group_letter, []);
      m.get(t.group_letter)!.push(t);
    }
    return m;
  }, [teams]);

  // Para R16/QF/SF/F sugerimos solo equipos que estén en la ronda anterior
  function suggestedTeams(round: Round): Team[] {
    if (round === 'r32') return teams;
    const prevRound: Record<Round, Round> = { r32: 'r32', r16: 'r32', qf: 'r16', sf: 'qf', final: 'sf' };
    const prevSet = picks[prevRound[round]];
    if (prevSet.size === 0) return teams;
    return teams.filter((t) => prevSet.has(t.id));
  }

  async function handleToggle(round: Round, teamId: number) {
    setError(null);
    setBusy(teamId);
    const result = await toggleQualifier({ round, teamId });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    setPicks((prev) => {
      const next = { ...prev };
      next[round] = new Set(prev[round]);
      if (result.action === 'added') next[round].add(teamId);
      else next[round].delete(teamId);
      return next;
    });
  }

  const current = ROUNDS.find((r) => r.key === activeRound)!;
  const currentPicks = picks[activeRound];
  const visibleTeams = suggestedTeams(activeRound);
  const visibleByGroup = useMemo(() => {
    const m = new Map<string, Team[]>();
    for (const t of visibleTeams) {
      if (!m.has(t.group_letter)) m.set(t.group_letter, []);
      m.get(t.group_letter)!.push(t);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visibleTeams]);

  return (
    <div>
      {/* Tabs de rondas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ROUNDS.map((r) => {
          const filled = picks[r.key].size;
          const active = r.key === activeRound;
          const complete = filled === r.capacity;
          return (
            <button
              key={r.key}
              onClick={() => setActiveRound(r.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {r.label}
              <span className={`ml-2 inline-block rounded px-1.5 text-xs font-mono ${
                complete ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {filled}/{r.capacity}
              </span>
            </button>
          );
        })}
      </div>

      {/* Header de la ronda activa */}
      <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{current.label}</h2>
          <span className="text-sm text-slate-600">
            <span className="font-mono font-semibold">{currentPicks.size}</span>
            {' / '}
            <span className="font-mono">{current.capacity}</span>
            {' equipos · '}
            <span className="font-mono">{current.pts} pts</span> c/u
          </span>
        </div>
        {activeRound !== 'r32' && (
          <p className="mt-1 text-xs text-slate-500">
            Te muestro solo los equipos que marcaste en la ronda anterior (si llevas alguno marcado).
          </p>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Grid de equipos por grupo */}
      <div className="mt-4 space-y-4">
        {visibleByGroup.map(([group, ts]) => (
          <div key={group}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Grupo {group}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ts.map((t) => {
                const selected = currentPicks.has(t.id);
                const isBusy = busy === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleToggle(activeRound, t.id)}
                    disabled={isBusy}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      selected
                        ? 'border-green-600 bg-green-50 font-medium text-green-900'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    } ${isBusy ? 'opacity-50' : ''}`}
                  >
                    <span>{t.flag_emoji ?? ''}</span>
                    <span className="truncate text-left">{t.name}</span>
                    {selected && <span className="ml-auto text-green-600">✓</span>}
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
