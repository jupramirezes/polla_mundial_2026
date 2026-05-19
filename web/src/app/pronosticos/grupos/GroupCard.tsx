'use client';

import { useMemo, useState } from 'react';
import type { Team, MatchRow } from '@/lib/types';
import { computeGroupStandings } from '@/lib/standings';
import {
  saveMatchPrediction,
  deleteMatchPrediction,
  saveGroupStanding,
  deleteGroupStanding,
} from './actions';

interface Props {
  letter: string;
  teams: Team[];
  matches: MatchRow[];
  initialMatchPreds: Array<[number, { home: number; away: number }]>;
  initialStandingPreds: Array<[number, number]>;   // position → teamId
  editable: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function GroupCard({
  letter, teams, matches, initialMatchPreds, initialStandingPreds, editable,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [matchScores, setMatchScores] = useState<Map<number, { home: string; away: string }>>(
    () => {
      const m = new Map<number, { home: string; away: string }>();
      for (const [mid, { home, away }] of initialMatchPreds) {
        m.set(mid, { home: String(home), away: String(away) });
      }
      return m;
    },
  );
  const [standings, setStandings] = useState<Map<number, number>>(
    () => new Map(initialStandingPreds),
  );
  const [matchStatus, setMatchStatus] = useState<Map<number, SaveStatus>>(new Map());
  const [standingStatus, setStandingStatus] = useState<Map<number, SaveStatus>>(new Map());

  // Conteo de progreso
  const filledMatches = useMemo(() => {
    let n = 0;
    for (const v of matchScores.values()) {
      if (v.home !== '' && v.away !== '') n++;
    }
    return n;
  }, [matchScores]);
  const filledStandings = standings.size;

  // Standings en vivo a partir de los marcadores actuales
  const liveStandings = useMemo(() => {
    return computeGroupStandings(
      teams.map((t) => t.id),
      matches.map((m) => {
        const s = matchScores.get(m.id);
        return {
          homeTeamId: m.home_team_id!,
          awayTeamId: m.away_team_id!,
          homeScore: s && s.home !== '' ? Number(s.home) : null,
          awayScore: s && s.away !== '' ? Number(s.away) : null,
        };
      }),
    );
  }, [teams, matches, matchScores]);

  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  function updateScore(matchId: number, side: 'home' | 'away', raw: string) {
    if (!editable) return;
    // Aceptar vacío o 0-20
    const clean = raw.replace(/[^0-9]/g, '').slice(0, 2);
    setMatchScores((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId) ?? { home: '', away: '' };
      next.set(matchId, { ...cur, [side]: clean });
      return next;
    });

    // Persistir con debounce simple
    debouncedSaveMatch(matchId);
  }

  // Debounce manual (Map de timeouts por matchId)
  const timeouts = useMemo(() => new Map<number, ReturnType<typeof setTimeout>>(), []);
  function debouncedSaveMatch(matchId: number) {
    const existing = timeouts.get(matchId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => persistMatch(matchId), 500);
    timeouts.set(matchId, t);
  }

  async function persistMatch(matchId: number) {
    const cur = matchScores.get(matchId);
    if (!cur) return;
    setMatchStatus((s) => new Map(s).set(matchId, 'saving'));

    let result: { ok?: boolean; error?: string };
    if (cur.home === '' && cur.away === '') {
      result = await deleteMatchPrediction(matchId);
    } else if (cur.home !== '' && cur.away !== '') {
      result = await saveMatchPrediction({
        matchId,
        homeScore: Number(cur.home),
        awayScore: Number(cur.away),
      });
    } else {
      // Sólo un lado lleno: no guardar todavía
      setMatchStatus((s) => new Map(s).set(matchId, 'idle'));
      return;
    }

    setMatchStatus((s) =>
      new Map(s).set(matchId, result.ok ? 'saved' : 'error'),
    );
    // Limpiar el "saved" después de 1.5s
    if (result.ok) {
      setTimeout(() => {
        setMatchStatus((s) => {
          const next = new Map(s);
          if (next.get(matchId) === 'saved') next.delete(matchId);
          return next;
        });
      }, 1500);
    }
  }

  async function setStanding(position: number, teamId: number | null) {
    if (!editable) return;
    setStandingStatus((s) => new Map(s).set(position, 'saving'));

    // Optimistic UI: actualizar localmente
    setStandings((prev) => {
      const next = new Map(prev);
      if (teamId == null) next.delete(position);
      else next.set(position, teamId);
      return next;
    });

    let result: { ok?: boolean; error?: string };
    if (teamId == null) {
      result = await deleteGroupStanding(letter, position);
    } else {
      result = await saveGroupStanding({ groupLetter: letter, position, teamId });
    }
    setStandingStatus((s) => new Map(s).set(position, result.ok ? 'saved' : 'error'));
    if (result.ok) {
      setTimeout(() => {
        setStandingStatus((s) => {
          const next = new Map(s);
          if (next.get(position) === 'saved') next.delete(position);
          return next;
        });
      }, 1500);
    }
  }

  // Equipos disponibles para una posición (los que no están ya en otra posición)
  function teamsAvailableFor(position: number): Team[] {
    const usedInOther = new Set<number>();
    for (const [p, tid] of standings) {
      if (p !== position) usedInOther.add(tid);
    }
    return teams.filter((t) => !usedInOther.has(t.id));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-lg">Grupo {letter}</span>
          <span className="text-xs text-slate-500 truncate">
            {teams.map((t) => t.name).join(' · ')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
          <span>
            <span className="font-mono font-semibold text-slate-900">{filledMatches}</span>/6
          </span>
          <span>
            <span className="font-mono font-semibold text-slate-900">{filledStandings}</span>/4
          </span>
          <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-4 py-4 space-y-5">
          {/* Marcadores */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Marcadores
            </h3>
            <div className="space-y-2">
              {matches.map((m) => {
                const home = teamById.get(m.home_team_id!);
                const away = teamById.get(m.away_team_id!);
                const cur = matchScores.get(m.id) ?? { home: '', away: '' };
                const status = matchStatus.get(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className="flex-1 text-right text-sm truncate font-medium">
                      {home?.flag_emoji ?? ''} {home?.name}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={cur.home}
                      onChange={(e) => updateScore(m.id, 'home', e.target.value)}
                      disabled={!editable}
                      className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                    />
                    <span className="text-slate-400">-</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      value={cur.away}
                      onChange={(e) => updateScore(m.id, 'away', e.target.value)}
                      disabled={!editable}
                      className="w-12 rounded border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
                    />
                    <div className="flex-1 text-left text-sm truncate font-medium">
                      {away?.flag_emoji ?? ''} {away?.name}
                    </div>
                    <span className="w-5 text-xs">
                      {status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? '✗' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Standings preview en vivo */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Cómo va el grupo (calculado)
            </h3>
            <div className="overflow-x-auto">
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
                    return (
                      <tr key={s.teamId} className="border-t border-slate-100">
                        <td className="px-2 py-1 font-mono">{s.position}</td>
                        <td className="px-2 py-1">{team?.flag_emoji ?? ''} {team?.name}</td>
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
          </section>

          {/* Position picks */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Tu predicción de posiciones finales (4/3/2/1 pts)
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4].map((pos) => {
                const status = standingStatus.get(pos);
                return (
                  <label key={pos} className="flex items-center gap-2">
                    <span className="w-12 shrink-0 text-sm font-medium">{pos}°</span>
                    <select
                      value={standings.get(pos) ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setStanding(pos, v === '' ? null : Number(v));
                      }}
                      disabled={!editable}
                      className="min-w-0 flex-1 rounded border border-slate-300 bg-blue-50 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                    >
                      <option value="">— elegir —</option>
                      {teamsAvailableFor(pos).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.flag_emoji ? `${t.flag_emoji} ` : ''}{t.name}
                        </option>
                      ))}
                    </select>
                    <span className="w-5 text-xs shrink-0">
                      {status === 'saving' ? '…' : status === 'saved' ? '✓' : status === 'error' ? '✗' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
