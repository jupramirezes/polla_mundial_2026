'use client';

import { useState } from 'react';
import { setOfficialTopPosition, setOfficialScorer } from '../actions';
import type { Team } from '@/lib/types';

const LABELS: Record<number, string> = {
  1: '1° Campeón', 2: '2° Subcampeón', 3: '3° (Tercero)', 4: '4° (Cuarto)',
};

export function OfficialTopForm({
  teams, initialPositions, initialScorers,
}: {
  teams: Team[];
  initialPositions: Record<number, number>;
  initialScorers: Array<{ player_name: string; goals: number }>;
}) {
  const [picks, setPicks] = useState<Record<number, number | null>>({
    1: initialPositions[1] ?? null,
    2: initialPositions[2] ?? null,
    3: initialPositions[3] ?? null,
    4: initialPositions[4] ?? null,
  });
  const [scorers, setScorers] = useState<Array<{ player_name: string; goals: number }>>(initialScorers);
  const [newName, setNewName] = useState('');
  const [newGoals, setNewGoals] = useState('');
  const [error, setError] = useState<string | null>(null);

  function teamsAvailableFor(pos: number): Team[] {
    const used = new Set<number>();
    for (const [p, tid] of Object.entries(picks)) {
      if (Number(p) !== pos && tid != null) used.add(tid);
    }
    return teams.filter((t) => !used.has(t.id));
  }

  async function changePosition(pos: number, teamId: number | null) {
    setError(null);
    setPicks((p) => ({ ...p, [pos]: teamId }));
    const r = await setOfficialTopPosition({ position: pos, teamId });
    if (r.error) setError(r.error);
  }

  async function addScorer() {
    setError(null);
    if (!newName.trim() || !newGoals) return;
    const goalsNum = Number(newGoals);
    const r = await setOfficialScorer({ playerName: newName.trim(), goals: goalsNum });
    if (r.error) {
      setError(r.error);
      return;
    }
    setScorers((s) => [...s.filter((x) => x.player_name !== newName.trim()), { player_name: newName.trim(), goals: goalsNum }]);
    setNewName('');
    setNewGoals('');
  }

  async function removeScorer(name: string) {
    const r = await setOfficialScorer({ playerName: name, goals: 0, remove: true });
    if (r.error) {
      setError(r.error);
      return;
    }
    setScorers((s) => s.filter((x) => x.player_name !== name));
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Posiciones finales
        </h2>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((pos) => (
            <label key={pos} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="w-32 shrink-0 font-semibold">{LABELS[pos]}</div>
              <select
                value={picks[pos] ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  changePosition(pos, v === '' ? null : Number(v));
                }}
                className="min-w-0 flex-1 rounded border border-slate-300 bg-blue-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">— elegir —</option>
                {teamsAvailableFor(pos).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.flag_emoji ? `${t.flag_emoji} ` : ''}{t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Goleador(es) del mundial
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Si varios empatan en goles, agrega a todos. Los participantes que predijeron a cualquiera ganan los 50 pts.
        </p>

        <div className="space-y-2">
          {scorers.map((s) => (
            <div key={s.player_name} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
              <span className="flex-1 font-medium">{s.player_name}</span>
              <span className="font-mono text-sm text-slate-600">{s.goals} goles</span>
              <button
                onClick={() => removeScorer(s.player_name)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                quitar
              </button>
            </div>
          ))}

          <div className="flex flex-col sm:flex-row gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <input
              type="text"
              placeholder="Nombre del jugador"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <input
              type="text"
              inputMode="numeric"
              placeholder="Goles"
              value={newGoals}
              onChange={(e) => setNewGoals(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full sm:w-24 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={addScorer}
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Agregar
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
