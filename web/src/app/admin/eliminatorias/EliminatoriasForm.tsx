'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setMatchTeams, autoGenerateKnockoutPairings } from '../actions';
import type { MatchRow, Team } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  r32: 'Dieciseisavos (R32) · 16 partidos',
  r16: 'Octavos · 8 partidos',
  qf:  'Cuartos · 4 partidos',
  sf:  'Semifinales · 2 partidos',
  tp:  'Tercer puesto · 1 partido',
  final: 'Final · 1 partido',
};
const STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];

type Status = 'idle' | 'saving' | 'saved' | 'error';

export function EliminatoriasForm({ teams, matches }: { teams: Team[]; matches: MatchRow[] }) {
  const router = useRouter();
  const [autogenPending, startAutogen] = useTransition();
  const [autogenMsg, setAutogenMsg] = useState<string | null>(null);

  function handleAutogen() {
    if (!confirm('Voy a RE-GENERAR el cuadro oficial desde los resultados: 16avos (1° y 2° de cada grupo cerrado + mejores 3ros si ya cerraron los 12) y la cascada de octavos en adelante. Esto pisa ajustes manuales. ¿Seguro?\n\nNota: el cuadro ya se llena solo con cada resultado; este botón es para forzar/corregir.')) return;
    setAutogenMsg(null);
    startAutogen(async () => {
      const r = await autoGenerateKnockoutPairings();
      if ('error' in r) {
        setAutogenMsg('❌ ' + r.error);
        return;
      }
      setAutogenMsg(`✓ 16avos: ${r.r32} · Oct: ${r.r16} · 4tos: ${r.qf} · Semi: ${r.sf} · 3°P: ${r.tp} · Final: ${r.final}`);
      router.refresh();
    });
  }

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

  const [picks, setPicks] = useState<Map<number, { home: number | null; away: number | null }>>(() => {
    const m = new Map<number, { home: number | null; away: number | null }>();
    for (const match of matches) {
      m.set(match.id, { home: match.home_team_id, away: match.away_team_id });
    }
    return m;
  });
  const [statuses, setStatuses] = useState<Map<number, Status>>(new Map());

  async function update(matchId: number, side: 'home' | 'away', teamId: number | null) {
    setPicks((prev) => {
      const next = new Map(prev);
      const cur = next.get(matchId) ?? { home: null, away: null };
      next.set(matchId, { ...cur, [side]: teamId });
      return next;
    });
    setStatuses((s) => new Map(s).set(matchId, 'saving'));

    const cur = picks.get(matchId) ?? { home: null, away: null };
    const updated = { ...cur, [side]: teamId };

    const r = await setMatchTeams({
      matchId,
      homeTeamId: updated.home,
      awayTeamId: updated.away,
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

  return (
    <div className="space-y-6">
      {/* Re-generar cuadro: correctivo (el cuadro se arma solo con cada resultado) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs text-slate-600">Se arma solo con cada resultado. Usa esto solo si necesitas <strong>forzar o corregir</strong>.</span>
        <div className="flex items-center gap-3">
          {autogenMsg && (
            <span className={`text-xs font-semibold ${autogenMsg.startsWith('❌') ? 'text-red-700' : 'text-emerald-700'}`}>{autogenMsg}</span>
          )}
          <button
            onClick={handleAutogen}
            disabled={autogenPending}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Re-generar cuadro
          </button>
        </div>
      </div>

      {STAGE_ORDER.map((stage) => {
        const stageMatches = matchesByStage.get(stage) ?? [];
        if (stageMatches.length === 0) return null;
        return (
          <section key={stage}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              {STAGE_LABEL[stage]}
            </h2>
            <div className="space-y-2">
              {stageMatches.map((m) => {
                const cur = picks.get(m.id) ?? { home: null, away: null };
                const status = statuses.get(m.id);
                return (
                  <div key={m.id} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2">
                    <span className="w-20 shrink-0 text-xs font-mono text-slate-500">{m.external_code}</span>
                    <select
                      value={cur.home ?? ''}
                      onChange={(e) => update(m.id, 'home', e.target.value === '' ? null : Number(e.target.value))}
                      className="min-w-0 flex-1 rounded border border-slate-300 bg-blue-50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— equipo local —</option>
                      {teams.filter((t) => t.id !== cur.away).map((t) => (
                        <option key={t.id} value={t.id}>{t.flag_emoji ? `${t.flag_emoji} ` : ''}{t.name}</option>
                      ))}
                    </select>
                    <span className="text-slate-400 text-sm">vs</span>
                    <select
                      value={cur.away ?? ''}
                      onChange={(e) => update(m.id, 'away', e.target.value === '' ? null : Number(e.target.value))}
                      className="min-w-0 flex-1 rounded border border-slate-300 bg-blue-50 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="">— equipo visitante —</option>
                      {teams.filter((t) => t.id !== cur.home).map((t) => (
                        <option key={t.id} value={t.id}>{t.flag_emoji ? `${t.flag_emoji} ` : ''}{t.name}</option>
                      ))}
                    </select>
                    <span className="shrink-0 w-20 text-right text-[10px] font-semibold">
                      {status === 'saving' && <span className="text-blue-700">guardando…</span>}
                      {status === 'saved'  && <span className="text-emerald-700">✓ ok</span>}
                      {status === 'error'  && <span className="text-red-700">error</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
