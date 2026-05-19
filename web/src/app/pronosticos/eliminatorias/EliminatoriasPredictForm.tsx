'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

interface InitialKoPred {
  home: number;
  away: number;
  lockedAt: string | null;
}

interface Props {
  teams: Team[];
  matches: MatchRow[];
  initialPreds: Array<[number, InitialKoPred]>;
  isAdmin: boolean;
  userId: string;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

export function EliminatoriasPredictForm({
  teams, matches, initialPreds, isAdmin, userId,
}: Props) {
  const router = useRouter();
  const storageKey = `polla:ko:${userId}`;
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

  const [states, setStates] = useState<Map<number, { home: string; away: string; lockedAt: string | null }>>(() => {
    const m = new Map<number, { home: string; away: string; lockedAt: string | null }>();
    for (const match of matches) m.set(match.id, { home: '', away: '', lockedAt: null });
    for (const [mid, p] of initialPreds) {
      m.set(mid, { home: String(p.home), away: String(p.away), lockedAt: p.lockedAt });
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const drafts = JSON.parse(raw) as Record<string, { home: string; away: string }>;
          for (const [midStr, d] of Object.entries(drafts)) {
            const mid = Number(midStr);
            const cur = m.get(mid);
            if (cur && !cur.lockedAt) {
              m.set(mid, { ...cur, home: d.home ?? '', away: d.away ?? '' });
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return m;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const drafts: Record<string, { home: string; away: string }> = {};
    for (const [mid, s] of states.entries()) {
      if (!s.lockedAt && (s.home !== '' || s.away !== '')) {
        drafts[String(mid)] = { home: s.home, away: s.away };
      }
    }
    try {
      if (Object.keys(drafts).length > 0) {
        window.localStorage.setItem(storageKey, JSON.stringify(drafts));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore
    }
  }, [states, storageKey]);

  const [confirm, setConfirm] = useState<null | {
    matchId: number; home: number; away: number; homeName: string; awayName: string;
  }>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  function update(matchId: number, side: 'home' | 'away', raw: string) {
    const s = states.get(matchId);
    if (!s) return;
    if (s.lockedAt && !isAdmin) return;
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 2);
    setStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId)!;
      next.set(matchId, { ...cur, [side]: clean });
      return next;
    });
  }

  function clickSave(matchId: number) {
    const s = states.get(matchId);
    if (!s || s.home === '' || s.away === '') return;
    const m = matches.find((x) => x.id === matchId)!;
    const home = teamById.get(m.home_team_id!);
    const away = teamById.get(m.away_team_id!);
    setConfirm({
      matchId,
      home: Number(s.home),
      away: Number(s.away),
      homeName: home?.name ?? '?',
      awayName: away?.name ?? '?',
    });
  }

  async function confirmSave() {
    if (!confirm) return;
    setSaving(confirm.matchId);
    const r = await saveKnockoutPrediction({
      matchId: confirm.matchId,
      homeScore: confirm.home,
      awayScore: confirm.away,
    });
    setSaving(null);
    setConfirm(null);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 4000);
      return;
    }
    setStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(confirm.matchId)!;
      next.set(confirm.matchId, { ...cur, lockedAt: new Date().toISOString() });
      return next;
    });
    setBanner({ kind: 'success', text: `✓ ${confirm.homeName} ${confirm.home} - ${confirm.away} ${confirm.awayName} guardado.` });
    setTimeout(() => setBanner(null), 3000);
    router.refresh();
  }

  const openMatches = matches.filter((m) => m.home_team_id && m.away_team_id);
  const locked = Array.from(states.entries()).filter(([mid, s]) => {
    return s.lockedAt && openMatches.some((m) => m.id === mid);
  }).length;

  return (
    <div>
      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        ⚠️ Cada partido tiene su propio botón <strong>Guardar</strong>. Una vez guardado,
        el marcador queda <strong>bloqueado</strong>.
      </div>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <strong>{locked}/{openMatches.length}</strong> partidos guardados · 2 pts ganador + 3 pts marcador exacto
      </div>

      {banner && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          banner.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-900'
        }`}>
          {banner.text}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {STAGE_ORDER.map((stage) => {
          const stageMatches = matchesByStage.get(stage) ?? [];
          const opens = stageMatches.filter((m) => m.home_team_id && m.away_team_id);

          if (opens.length === 0) {
            return (
              <section key={stage}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
                  {STAGE_LABEL[stage]}
                </h2>
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  🔒 Se abre cuando el admin asigne los enfrentamientos.
                </div>
              </section>
            );
          }

          return (
            <section key={stage}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
                {STAGE_LABEL[stage]} <span className="font-mono text-xs text-slate-500">({opens.length} partidos)</span>
              </h2>
              <div className="space-y-2">
                {opens.map((m) => {
                  const home = teamById.get(m.home_team_id!);
                  const away = teamById.get(m.away_team_id!);
                  const s = states.get(m.id) ?? { home: '', away: '', lockedAt: null };
                  const locked = !!s.lockedAt;
                  const matchResultLocked = m.result_locked;
                  const editable = !matchResultLocked && (!locked || isAdmin);
                  const canSave = editable && s.home !== '' && s.away !== '';
                  const isSaving = saving === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-2 rounded-lg border p-2 ${
                        locked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex-1 text-right text-sm font-medium truncate">
                        {home?.flag_emoji ?? ''} {home?.name}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={s.home}
                        onChange={(e) => update(m.id, 'home', e.target.value)}
                        disabled={!editable}
                        className={`w-12 rounded border px-2 py-1.5 text-center font-mono font-bold focus:outline-none focus:ring-2 ${
                          locked
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900 cursor-not-allowed'
                            : 'border-slate-300 bg-amber-50 focus:ring-amber-400'
                        } disabled:opacity-80`}
                      />
                      <span className="text-slate-400">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={s.away}
                        onChange={(e) => update(m.id, 'away', e.target.value)}
                        disabled={!editable}
                        className={`w-12 rounded border px-2 py-1.5 text-center font-mono font-bold focus:outline-none focus:ring-2 ${
                          locked
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900 cursor-not-allowed'
                            : 'border-slate-300 bg-amber-50 focus:ring-amber-400'
                        } disabled:opacity-80`}
                      />
                      <div className="flex-1 text-left text-sm font-medium truncate">
                        {away?.flag_emoji ?? ''} {away?.name}
                      </div>
                      {locked ? (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
                          🔒 GUARDADO
                        </span>
                      ) : matchResultLocked ? (
                        <span className="shrink-0 text-[10px] font-semibold text-slate-500">CERRADO</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => clickSave(m.id)}
                          disabled={!canSave || isSaving}
                          className="shrink-0 rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-30"
                        >
                          {isSaving ? '…' : 'Guardar'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Modal de confirmación */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">¿Confirmar marcador?</h3>
            <p className="mt-2 text-sm text-slate-600">Vas a guardar:</p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold">
                {confirm.homeName} <span className="font-mono text-emerald-700">{confirm.home} - {confirm.away}</span> {confirm.awayName}
              </div>
            </div>
            <p className="mt-3 text-sm text-amber-800">
              ⚠️ Una vez guardado <strong>no podrás cambiarlo</strong>. Solo el admin puede modificarlo después.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={confirmSave}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
              >
                Sí, guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
