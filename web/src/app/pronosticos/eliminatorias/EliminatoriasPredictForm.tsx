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
const CLOSE_MIN = 10; // se cierra 10 minutos antes del inicio

interface InitialKoPred { home: number; away: number; lockedAt: string | null; }
interface Props {
  teams: Team[];
  matches: MatchRow[];
  initialPreds: Array<[number, InitialKoPred]>;
  isAdmin: boolean;
  userId: string;
}
type Banner = { kind: 'success' | 'error'; text: string } | null;
type Cell = { home: string; away: string; savedHome: string; savedAway: string };

/** Hora del partido en Colombia (ej. "dom 28 jun, 2:00 p. m."). */
function fmtKickoff(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota',
  });
}

export function EliminatoriasPredictForm({ teams, matches, initialPreds, userId }: Props) {
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

  const [states, setStates] = useState<Map<number, Cell>>(() => {
    const m = new Map<number, Cell>();
    for (const match of matches) m.set(match.id, { home: '', away: '', savedHome: '', savedAway: '' });
    for (const [mid, p] of initialPreds) {
      m.set(mid, { home: String(p.home), away: String(p.away), savedHome: String(p.home), savedAway: String(p.away) });
    }
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const drafts = JSON.parse(raw) as Record<string, { home: string; away: string }>;
          for (const [midStr, d] of Object.entries(drafts)) {
            const cur = m.get(Number(midStr));
            if (cur) m.set(Number(midStr), { ...cur, home: d.home ?? cur.home, away: d.away ?? cur.away });
          }
        }
      } catch { /* ignore */ }
    }
    return m;
  });

  // Backup local de lo que se va escribiendo (resiliencia ante recargas).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const drafts: Record<string, { home: string; away: string }> = {};
    for (const [mid, s] of states.entries()) {
      if (s.home !== s.savedHome || s.away !== s.savedAway) drafts[String(mid)] = { home: s.home, away: s.away };
    }
    try {
      if (Object.keys(drafts).length > 0) window.localStorage.setItem(storageKey, JSON.stringify(drafts));
      else window.localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  }, [states, storageKey]);

  const [saving, setSaving] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const nowMs = Date.now();
  function isClosed(m: MatchRow): boolean {
    if (m.result_locked) return true;
    if (!m.scheduled_at) return false;
    return nowMs >= new Date(m.scheduled_at).getTime() - CLOSE_MIN * 60 * 1000;
  }

  function update(matchId: number, side: 'home' | 'away', raw: string) {
    let clean = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (clean !== '' && Number(clean) > 20) clean = '20';
    setStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId)!;
      next.set(matchId, { ...cur, [side]: clean });
      return next;
    });
  }

  // Guarda solo (sin botón) al salir de la celda, si está completo y cambió.
  async function autoSave(matchId: number) {
    const m = matches.find((x) => x.id === matchId);
    if (!m) return;
    const s = states.get(matchId);
    if (!s || s.home === '' || s.away === '') return;
    if (s.home === s.savedHome && s.away === s.savedAway) return; // sin cambios
    if (isClosed(m)) return; // cerrado (10 min antes) — aplica a todos, sin excepción
    setSaving(matchId);
    const r = await saveKnockoutPrediction({ matchId, homeScore: Number(s.home), awayScore: Number(s.away) });
    setSaving(null);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 4500);
      return;
    }
    setStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId)!;
      next.set(matchId, { ...cur, savedHome: cur.home, savedAway: cur.away });
      return next;
    });
    setFlash(matchId);
    setTimeout(() => setFlash((f) => (f === matchId ? null : f)), 1600);
    router.refresh();
  }

  const openMatches = matches.filter((m) => m.home_team_id && m.away_team_id);
  const savedCount = openMatches.filter((m) => {
    const s = states.get(m.id);
    return s && s.savedHome !== '' && s.savedAway !== '';
  }).length;

  return (
    <div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        ✍️ Escribe el marcador y <strong>se guarda solo</strong> (sin botón). Lo puedes <strong>cambiar las veces que quieras hasta 10 min antes</strong> de cada partido; queda el último que dejes. · 2 pts ganador + 3 pts marcador exacto
      </div>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <strong>{savedCount}/{openMatches.length}</strong> partidos con marcador guardado
      </div>

      {banner && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          banner.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
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
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">{STAGE_LABEL[stage]}</h2>
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  🔒 Se abre cuando se definan los enfrentamientos (salen solos al avanzar las rondas).
                </div>
              </section>
            );
          }

          return (
            <section key={stage}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
                {STAGE_LABEL[stage]} <span className="font-mono text-xs text-slate-500">({opens.length} partidos)</span>
              </h2>
              <div className="space-y-2">
                {opens.map((m) => {
                  const home = teamById.get(m.home_team_id!);
                  const away = teamById.get(m.away_team_id!);
                  const s = states.get(m.id) ?? { home: '', away: '', savedHome: '', savedAway: '' };
                  const closed = isClosed(m);
                  const filled = s.home !== '' && s.away !== '';
                  const isSaved = filled && s.home === s.savedHome && s.away === s.savedAway;
                  const kickoff = fmtKickoff(m.scheduled_at);
                  return (
                    <div key={m.id} className={`rounded-lg border p-2 ${closed ? 'border-slate-200 bg-slate-50' : isSaved ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'}`}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 truncate text-right text-sm font-medium">{home?.flag_emoji ?? ''} {home?.name}</div>
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2}
                          value={s.home}
                          onChange={(e) => update(m.id, 'home', e.target.value)}
                          onBlur={() => autoSave(m.id)}
                          disabled={closed}
                          className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2}
                          value={s.away}
                          onChange={(e) => update(m.id, 'away', e.target.value)}
                          onBlur={() => autoSave(m.id)}
                          disabled={closed}
                          className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-80"
                        />
                        <div className="flex-1 truncate text-left text-sm font-medium">{away?.flag_emoji ?? ''} {away?.name}</div>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-400">{kickoff ? `🕐 ${kickoff} · cierra 10 min antes` : ''}</span>
                        <span className="shrink-0">
                          {closed
                            ? <span className="font-semibold text-slate-500">🔒 cerrado</span>
                            : saving === m.id
                              ? <span className="text-slate-500">guardando…</span>
                              : flash === m.id
                                ? <span className="font-semibold text-emerald-700">✓ guardado</span>
                                : isSaved
                                  ? <span className="text-emerald-700">✓ guardado</span>
                                  : filled
                                    ? <span className="text-amber-600">se guarda al salir de la casilla</span>
                                    : <span className="text-slate-400">sin marcador</span>}
                        </span>
                      </div>
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
