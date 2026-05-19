'use client';

import { useMemo, useState } from 'react';
import { toggleQualifier } from './actions';
import type { Team } from '@/lib/types';

type Round = 'r16' | 'qf' | 'sf' | 'final';

const ROUNDS: Array<{ key: Round; label: string; capacity: number; pts: number }> = [
  { key: 'r16',   label: 'Octavos',     capacity: 16, pts: 3  },
  { key: 'qf',    label: 'Cuartos',     capacity: 8,  pts: 6  },
  { key: 'sf',    label: 'Semifinales', capacity: 4,  pts: 12 },
  { key: 'final', label: 'Final',       capacity: 2,  pts: 22 },
];

interface ByGroupRow {
  groupLetter: string;
  complete: boolean;
  first: number | null;
  second: number | null;
  third: number | null;
  thirdPasses: boolean;
  thirdPts: number;
  thirdDg: number;
  thirdGf: number;
}

interface Props {
  allTeams: Team[];
  derivedR32: number[];
  derivedR32Warnings: string[];
  byGroupDebug: ByGroupRow[];
  initial: Record<Round, number[]>;
}

export function QualifiersCascadeForm({
  allTeams, derivedR32, derivedR32Warnings, byGroupDebug, initial,
}: Props) {
  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of allTeams) m.set(t.id, t);
    return m;
  }, [allTeams]);

  const [picks, setPicks] = useState<Record<Round, Set<number>>>(() => ({
    r16:   new Set(initial.r16),
    qf:    new Set(initial.qf),
    sf:    new Set(initial.sf),
    final: new Set(initial.final),
  }));
  const [activeTab, setActiveTab] = useState<'r32' | Round>('r32');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const r32Set = useMemo(() => new Set(derivedR32), [derivedR32]);
  const r32Complete = derivedR32.length === 32;

  function sourceFor(round: Round): Set<number> {
    if (round === 'r16') return r32Set;
    if (round === 'qf')  return picks.r16;
    if (round === 'sf')  return picks.qf;
    return picks.sf;
  }

  function isRoundUnlocked(round: Round): boolean {
    if (round === 'r16') return r32Complete;
    if (round === 'qf')  return picks.r16.size === 16;
    if (round === 'sf')  return picks.qf.size === 8;
    return picks.sf.size === 4;
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

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        <TabButton
          active={activeTab === 'r32'}
          onClick={() => setActiveTab('r32')}
          label="Dieciseisavos (R32)"
          progress={`${derivedR32.length}/32`}
          locked={false}
          auto
        />
        {ROUNDS.map((r) => {
          const filled = picks[r.key].size;
          const unlocked = isRoundUnlocked(r.key);
          return (
            <TabButton
              key={r.key}
              active={activeTab === r.key}
              onClick={() => unlocked && setActiveTab(r.key)}
              label={r.label}
              progress={`${filled}/${r.capacity}`}
              locked={!unlocked}
            />
          );
        })}
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {activeTab === 'r32' ? (
        <R32View byGroup={byGroupDebug} teamById={teamById} warnings={derivedR32Warnings} />
      ) : (
        <RoundView
          round={activeTab}
          meta={ROUNDS.find((r) => r.key === activeTab)!}
          source={sourceFor(activeTab)}
          picks={picks[activeTab]}
          teamById={teamById}
          busy={busy}
          onToggle={(tid) => handleToggle(activeTab, tid)}
        />
      )}
    </div>
  );
}

function TabButton({
  active, onClick, label, progress, locked, auto,
}: { active: boolean; onClick: () => void; label: string; progress: string; locked: boolean; auto?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition flex items-center gap-2 ${
        locked
          ? 'border-transparent text-slate-400 cursor-not-allowed'
          : active
            ? 'border-emerald-700 text-emerald-900'
            : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      <span>{label}</span>
      <span className={`inline-block rounded px-1.5 text-xs font-mono ${
        auto
          ? 'bg-blue-100 text-blue-800'
          : locked
            ? 'bg-slate-100 text-slate-400'
            : 'bg-slate-100 text-slate-700'
      }`}>
        {auto ? '🤖 ' : ''}{progress}
      </span>
      {locked && <span className="text-slate-300">🔒</span>}
    </button>
  );
}

function R32View({
  byGroup, teamById, warnings,
}: { byGroup: ByGroupRow[]; teamById: Map<number, Team>; warnings: string[] }) {
  return (
    <div className="mt-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        Esta lista es <strong>100% automática</strong> a partir de tus marcadores en
        Fase de grupos. Para cambiarla, edita tus pronósticos de grupos.
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {warnings.join(' ')}
        </div>
      )}

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2 text-left">Grupo</th>
            <th className="px-3 py-2 text-left">1°</th>
            <th className="px-3 py-2 text-left">2°</th>
            <th className="px-3 py-2 text-left">3° + stats</th>
          </tr>
        </thead>
        <tbody>
          {byGroup.map((g) => {
            const t1 = g.first  ? teamById.get(g.first)  : null;
            const t2 = g.second ? teamById.get(g.second) : null;
            const t3 = g.third  ? teamById.get(g.third)  : null;
            return (
              <tr key={g.groupLetter} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono font-semibold">{g.groupLetter}</td>
                <td className="px-3 py-2">
                  {t1 && g.complete ? <span>{t1.flag_emoji ?? ''} {t1.name}</span> : <span className="text-slate-400 italic">faltan marcadores</span>}
                </td>
                <td className="px-3 py-2">
                  {t2 && g.complete ? <span>{t2.flag_emoji ?? ''} {t2.name}</span> : <span className="text-slate-400 italic">—</span>}
                </td>
                <td className="px-3 py-2">
                  {t3 && g.complete ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={g.thirdPasses ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                        {g.thirdPasses ? '✓ ' : ''}{t3.flag_emoji ?? ''} {t3.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({g.thirdPts} pts · DG {g.thirdDg > 0 ? '+' : ''}{g.thirdDg} · GF {g.thirdGf})
                      </span>
                      {!g.thirdPasses && <span className="text-[10px] text-slate-400">no pasa</span>}
                    </div>
                  ) : <span className="text-slate-400 italic">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RoundView({
  meta, source, picks, teamById, busy, onToggle,
}: {
  round: Round;
  meta: { label: string; capacity: number; pts: number };
  source: Set<number>;
  picks: Set<number>;
  teamById: Map<number, Team>;
  busy: number | null;
  onToggle: (teamId: number) => void;
}) {
  const teams = Array.from(source).map((id) => teamById.get(id)).filter(Boolean) as Team[];
  const byGroup = new Map<string, Team[]>();
  for (const t of teams) {
    if (!byGroup.has(t.group_letter)) byGroup.set(t.group_letter, []);
    byGroup.get(t.group_letter)!.push(t);
  }
  const sortedGroups = Array.from(byGroup.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mt-4">
      <div className="rounded-lg bg-slate-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{meta.label}</h2>
          <span className="text-sm">
            <span className="font-mono font-bold text-emerald-700">{picks.size}</span>
            <span className="text-slate-500"> / {meta.capacity} equipos · </span>
            <span className="font-mono">{meta.pts} pts c/u</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Elige los {meta.capacity} equipos que crees pasan a esta ronda (de los {source.size} disponibles).
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {sortedGroups.map(([group, ts]) => (
          <div key={group}>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
              Grupo {group}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ts.map((t) => {
                const selected = picks.has(t.id);
                const isBusy = busy === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onToggle(t.id)}
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
