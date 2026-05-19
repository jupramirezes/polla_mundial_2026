'use client';

import { useMemo, useState } from 'react';
import { saveTopPosition, saveTopScorer } from './actions';
import type { Team } from '@/lib/types';

interface Props {
  teams: Team[];
  initialPositions: Record<number, number>;
  initialScorer: string;
}

const POSITION_LABELS: Record<number, { label: string; pts: number }> = {
  1: { label: 'Campeón',     pts: 90 },
  2: { label: 'Subcampeón',  pts: 60 },
  3: { label: 'Tercer lugar',pts: 40 },
  4: { label: 'Cuarto lugar',pts: 28 },
};

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function TopForm({ teams, initialPositions, initialScorer }: Props) {
  const [picks, setPicks] = useState<Record<number, number | null>>({
    1: initialPositions[1] ?? null,
    2: initialPositions[2] ?? null,
    3: initialPositions[3] ?? null,
    4: initialPositions[4] ?? null,
  });
  const [posStatus, setPosStatus] = useState<Record<number, Status>>({ 1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle' });
  const [scorer, setScorer] = useState(initialScorer);
  const [scorerStatus, setScorerStatus] = useState<Status>('idle');

  // Equipos disponibles para una posición (los no elegidos en otra)
  function teamsAvailableFor(pos: number): Team[] {
    const usedInOther = new Set<number>();
    for (const [p, tid] of Object.entries(picks)) {
      if (Number(p) !== pos && tid != null) usedInOther.add(tid);
    }
    return teams.filter((t) => !usedInOther.has(t.id));
  }

  async function changePosition(pos: number, teamId: number | null) {
    setPicks((p) => ({ ...p, [pos]: teamId }));
    setPosStatus((s) => ({ ...s, [pos]: 'saving' }));
    const r = await saveTopPosition({ position: pos, teamId });
    setPosStatus((s) => ({ ...s, [pos]: r.ok ? 'saved' : 'error' }));
    if (r.ok) {
      setTimeout(() => {
        setPosStatus((s) => (s[pos] === 'saved' ? { ...s, [pos]: 'idle' } : s));
      }, 1500);
    }
  }

  // Debounce para el goleador
  const scorerTimer = useMemo<{ id: ReturnType<typeof setTimeout> | null }>(() => ({ id: null }), []);
  function changeScorer(v: string) {
    setScorer(v);
    if (scorerTimer.id) clearTimeout(scorerTimer.id);
    scorerTimer.id = setTimeout(async () => {
      setScorerStatus('saving');
      const r = await saveTopScorer(v);
      setScorerStatus(r.ok ? 'saved' : 'error');
      if (r.ok) {
        setTimeout(() => setScorerStatus((s) => (s === 'saved' ? 'idle' : s)), 1500);
      }
    }, 700);
  }

  function statusIcon(s: Status) {
    return s === 'saving' ? '…' : s === 'saved' ? '✓' : s === 'error' ? '✗' : '';
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Posiciones finales del mundial
        </h2>
        <div className="mt-3 space-y-2">
          {[1, 2, 3, 4].map((pos) => {
            const meta = POSITION_LABELS[pos];
            return (
              <label key={pos} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="w-32 shrink-0">
                  <div className="font-semibold">{meta.label}</div>
                  <div className="text-xs text-slate-500">{meta.pts} pts</div>
                </div>
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
                <span className="w-5 text-xs text-slate-500">{statusIcon(posStatus[pos])}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Goleador del mundial
        </h2>
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <label className="flex items-center gap-3">
            <div className="w-32 shrink-0">
              <div className="font-semibold">Jugador</div>
              <div className="text-xs text-slate-500">50 pts</div>
            </div>
            <input
              type="text"
              value={scorer}
              onChange={(e) => changeScorer(e.target.value)}
              placeholder="Nombre completo del jugador"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-amber-50 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="w-5 text-xs text-slate-500">{statusIcon(scorerStatus)}</span>
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Si varios jugadores empatan como máximos goleadores, todos los participantes que predijeron a cualquiera ganan los 50 pts.
          </p>
        </div>
      </section>
    </div>
  );
}
