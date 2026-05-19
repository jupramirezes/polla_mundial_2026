'use client';

import { useMemo, useState } from 'react';
import type { Team, MatchRow } from '@/lib/types';
import { computeGroupStandings } from '@/lib/standings';
import { saveMatchPrediction } from './actions';

interface InitialPred {
  home: number;
  away: number;
  locked_at: string | null;
}

interface Props {
  letter: string;
  teams: Team[];
  matches: MatchRow[];
  initialMatchPreds: Array<[number, InitialPred]>;
  phaseOpen: boolean;
  isAdmin: boolean;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

interface MatchState {
  home: string;
  away: string;
  lockedAt: string | null;
}

export function GroupCard({
  letter, teams, matches, initialMatchPreds, phaseOpen, isAdmin,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const [states, setStates] = useState<Map<number, MatchState>>(() => {
    const m = new Map<number, MatchState>();
    for (const match of matches) m.set(match.id, { home: '', away: '', lockedAt: null });
    for (const [mid, p] of initialMatchPreds) {
      m.set(mid, { home: String(p.home), away: String(p.away), lockedAt: p.locked_at });
    }
    return m;
  });

  // Estado del modal de confirmación
  const [confirm, setConfirm] = useState<null | {
    matchId: number; home: number; away: number; homeName: string; awayName: string;
  }>(null);

  const [saving, setSaving] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  // Conteos
  const filledMatches = useMemo(() => {
    let n = 0;
    for (const s of states.values()) if (s.home !== '' && s.away !== '') n++;
    return n;
  }, [states]);
  const lockedMatches = useMemo(() => {
    let n = 0;
    for (const s of states.values()) if (s.lockedAt) n++;
    return n;
  }, [states]);

  // Standings en vivo
  const liveStandings = useMemo(() => {
    return computeGroupStandings(
      teams.map((t) => t.id),
      matches.map((m) => {
        const s = states.get(m.id);
        return {
          homeTeamId: m.home_team_id!,
          awayTeamId: m.away_team_id!,
          homeScore: s && s.home !== '' ? Number(s.home) : null,
          awayScore: s && s.away !== '' ? Number(s.away) : null,
        };
      }),
    );
  }, [teams, matches, states]);

  function updateScore(matchId: number, side: 'home' | 'away', raw: string) {
    const state = states.get(matchId);
    if (!state) return;
    // No tocar si está bloqueado (a menos que admin)
    if (state.lockedAt && !isAdmin) return;

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
    const r = await saveMatchPrediction({
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

    // marca lockedAt local
    setStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(confirm.matchId)!;
      next.set(confirm.matchId, { ...cur, lockedAt: new Date().toISOString() });
      return next;
    });
    setBanner({ kind: 'success', text: `✓ Marcador ${confirm.homeName} ${confirm.home} - ${confirm.away} ${confirm.awayName} guardado.` });
    setTimeout(() => setBanner(null), 3000);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-lg text-emerald-900">Grupo {letter}</span>
          <span className="text-xs text-slate-500 truncate">
            {teams.map((t) => t.name).join(' · ')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 font-mono">
            🔒 {lockedMatches}/6
          </span>
          {filledMatches > lockedMatches && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 font-mono">
              ✎ {filledMatches - lockedMatches}
            </span>
          )}
          <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 space-y-5">
          {/* Banner success/error */}
          {banner && (
            <div className={`rounded-lg border px-3 py-2 text-sm ${
              banner.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}>
              {banner.text}
            </div>
          )}

          {/* Marcadores con save explícito */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Marcadores
            </h3>
            <div className="space-y-2">
              {matches.map((m) => {
                const home = teamById.get(m.home_team_id!);
                const away = teamById.get(m.away_team_id!);
                const s = states.get(m.id) ?? { home: '', away: '', lockedAt: null };
                const locked = !!s.lockedAt;
                const editable = phaseOpen && (!locked || isAdmin);
                const canSave = phaseOpen && s.home !== '' && s.away !== '' && (!locked || isAdmin);
                const isSaving = saving === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-lg border p-2 ${
                      locked ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex-1 text-right text-sm truncate font-medium">
                      {home?.flag_emoji ?? ''} {home?.name}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={s.home}
                      onChange={(e) => updateScore(m.id, 'home', e.target.value)}
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
                      onChange={(e) => updateScore(m.id, 'away', e.target.value)}
                      disabled={!editable}
                      className={`w-12 rounded border px-2 py-1.5 text-center font-mono font-bold focus:outline-none focus:ring-2 ${
                        locked
                          ? 'border-emerald-300 bg-emerald-100 text-emerald-900 cursor-not-allowed'
                          : 'border-slate-300 bg-amber-50 focus:ring-amber-400'
                      } disabled:opacity-80`}
                    />
                    <div className="flex-1 text-left text-sm truncate font-medium">
                      {away?.flag_emoji ?? ''} {away?.name}
                    </div>
                    {locked ? (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
                        🔒 GUARDADO
                      </span>
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

          {/* Standings derivados (= la predicción del usuario) */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Posiciones del grupo (según tus marcadores)
            </h3>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-2 py-1 text-left">#</th>
                    <th className="px-2 py-1 text-left">Equipo</th>
                    <th className="px-2 py-1 text-right">PJ</th>
                    <th className="px-2 py-1 text-right">G</th>
                    <th className="px-2 py-1 text-right">E</th>
                    <th className="px-2 py-1 text-right">P</th>
                    <th className="px-2 py-1 text-right">DG</th>
                    <th className="px-2 py-1 text-right font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {liveStandings.map((s) => {
                    const team = teamById.get(s.teamId);
                    const isTop2 = s.position <= 2;
                    return (
                      <tr key={s.teamId} className={`border-t border-slate-100 ${isTop2 ? 'bg-emerald-50/40' : ''}`}>
                        <td className="px-2 py-1 font-mono font-bold">{s.position}</td>
                        <td className="px-2 py-1">
                          {team?.flag_emoji ?? ''} {team?.name}
                          {isTop2 && <span className="ml-1 text-[10px] font-semibold text-emerald-700">✓ a R32</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{s.pj}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.g}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.e}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.p}</td>
                        <td className="px-2 py-1 text-right font-mono">{s.dg > 0 ? '+' + s.dg : s.dg}</td>
                        <td className="px-2 py-1 text-right font-mono font-bold">{s.pts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              El 3° de cada grupo compite por uno de los 8 cupos como mejor 3° (regla FIFA: Pts → DG → GF).
              Mira la pantalla de <a href="/pronosticos/clasificados" className="underline">Clasificados</a> para ver tu R32.
            </p>
          </section>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">¿Confirmar marcador?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Vas a guardar:
            </p>
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
