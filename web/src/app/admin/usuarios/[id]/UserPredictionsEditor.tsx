'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Team, MatchRow } from '@/lib/types';
import {
  adminSaveUserGroupPrediction,
  adminClearUserGroupPrediction,
  adminSaveUserKnockoutPrediction,
  adminClearUserKnockoutPrediction,
  adminSaveUserScorer,
} from './predict-actions';

type Pred = { home: number; away: number; locked_at: string | null } | undefined;

type ActionResult = { ok?: boolean; error?: string };

interface RowProps {
  userId: string;
  match: MatchRow;
  home: Team | null | undefined;
  away: Team | null | undefined;
  pred: Pred;
  kind: 'group' | 'ko';
}

function ScoreRow({ userId, match, home, away, pred, kind }: RowProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [h, setH] = useState<string>(pred ? String(pred.home) : '');
  const [a, setA] = useState<string>(pred ? String(pred.away) : '');
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function clean(raw: string): string {
    let c = raw.replace(/[^0-9]/g, '').slice(0, 2);
    if (c !== '' && Number(c) > 20) c = '20';
    return c;
  }

  function save() {
    if (h === '' || a === '') { setErr('Faltan marcadores'); return; }
    setErr(null);
    const fn = kind === 'group' ? adminSaveUserGroupPrediction : adminSaveUserKnockoutPrediction;
    start(async () => {
      const r: ActionResult = await fn({
        userId, matchId: match.id, homeScore: Number(h), awayScore: Number(a),
      });
      if (r.error) { setErr(r.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  function clearIt() {
    if (!confirm('¿Borrar este pronóstico del usuario?')) return;
    const fn = kind === 'group' ? adminClearUserGroupPrediction : adminClearUserKnockoutPrediction;
    start(async () => {
      const r: ActionResult = await fn({ userId, matchId: match.id });
      if (r.error) { setErr(r.error); return; }
      setEditing(false);
      setH(''); setA('');
      router.refresh();
    });
  }

  return (
    <tr className="border-t border-slate-100 first:border-0 align-middle">
      <td className="py-1 text-right pr-2 text-xs sm:text-sm whitespace-nowrap">
        {home?.flag_emoji ?? ''} {home?.name ?? <span className="text-slate-400 italic">por definir</span>}
      </td>
      <td className="py-1 px-1 text-center w-28">
        {editing ? (
          <div className="flex items-center justify-center gap-1">
            <input
              inputMode="numeric"
              value={h}
              onChange={(e) => setH(clean(e.target.value))}
              className="w-9 rounded border border-amber-300 px-1 py-0.5 text-center font-mono text-sm"
            />
            <span className="text-slate-400">-</span>
            <input
              inputMode="numeric"
              value={a}
              onChange={(e) => setA(clean(e.target.value))}
              className="w-9 rounded border border-amber-300 px-1 py-0.5 text-center font-mono text-sm"
            />
          </div>
        ) : (
          <span className={`font-mono ${pred?.locked_at ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>
            {pred ? `${pred.home} - ${pred.away}` : '— — —'}
          </span>
        )}
      </td>
      <td className="py-1 pl-2 text-xs sm:text-sm whitespace-nowrap">
        {away?.flag_emoji ?? ''} {away?.name ?? <span className="text-slate-400 italic">por definir</span>}
      </td>
      <td className="py-1 pl-2 text-right whitespace-nowrap">
        {editing ? (
          <div className="flex gap-1 justify-end">
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? '...' : 'OK'}
            </button>
            <button
              onClick={() => { setEditing(false); setH(pred ? String(pred.home) : ''); setA(pred ? String(pred.away) : ''); setErr(null); }}
              disabled={busy}
              className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium hover:bg-slate-100 disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-1 justify-end">
            <button
              onClick={() => setEditing(true)}
              disabled={!home || !away}
              className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium hover:bg-slate-100 disabled:opacity-30"
              title={!home || !away ? 'Equipos no asignados aún' : 'Editar'}
            >
              ✎
            </button>
            {pred && (
              <button
                onClick={clearIt}
                disabled={busy}
                className="rounded border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                title="Borrar"
              >
                🗑️
              </button>
            )}
          </div>
        )}
        {err && <div className="mt-1 text-[10px] text-red-700">{err}</div>}
      </td>
    </tr>
  );
}

interface SectionProps {
  userId: string;
  title: string;
  matches: MatchRow[];
  preds: Map<number, { home: number; away: number; locked_at: string | null }>;
  teamById: Map<number, Team>;
  kind: 'group' | 'ko';
  emptyText?: string;
  groupBy?: 'group_letter' | 'stage';
}

export function ScoresSection({ userId, title, matches, preds, teamById, kind, emptyText, groupBy }: SectionProps) {
  if (matches.length === 0) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
          {emptyText ?? 'Sin partidos.'}
        </div>
      </section>
    );
  }

  // Agrupar por group_letter o por stage
  const groups = new Map<string, MatchRow[]>();
  for (const m of matches) {
    const key = groupBy === 'stage'
      ? (m.stage ?? '')
      : (m.group_letter ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const sortedKeys = Array.from(groups.keys()).sort();

  const STAGE_LABEL: Record<string, string> = {
    r32: 'Dieciseisavos', r16: 'Octavos', qf: 'Cuartos',
    sf: 'Semifinales', tp: 'Tercer puesto', final: 'Final',
  };

  const filled = Array.from(preds.values()).filter((p) => p.locked_at).length;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-xs text-slate-500 mb-2">{filled} guardados</p>
      <div className="space-y-3">
        {sortedKeys.map((key) => {
          const list = groups.get(key)!;
          const label = groupBy === 'stage' ? STAGE_LABEL[key] ?? key : `Grupo ${key}`;
          return (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
              <h3 className="text-sm font-semibold text-emerald-900 mb-2">{label}</h3>
              <table className="w-full text-sm">
                <tbody>
                  {list.map((m) => (
                    <ScoreRow
                      key={m.id}
                      userId={userId}
                      match={m}
                      home={m.home_team_id ? teamById.get(m.home_team_id) : null}
                      away={m.away_team_id ? teamById.get(m.away_team_id) : null}
                      pred={preds.get(m.id)}
                      kind={kind}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ScorerEditor({ userId, initialName }: { userId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r: ActionResult = await adminSaveUserScorer({ userId, playerName: name.trim() });
      if (r.error) { setMsg('❌ ' + r.error); return; }
      setMsg('✓ Guardado');
      setTimeout(() => setMsg(null), 1500);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        placeholder="(sin pick)"
        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
      />
      <button
        onClick={save}
        disabled={busy}
        className="rounded bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {busy ? '...' : 'Guardar'}
      </button>
      {msg && <span className={`text-xs ${msg.startsWith('❌') ? 'text-red-700' : 'text-emerald-700'}`}>{msg}</span>}
    </div>
  );
}
