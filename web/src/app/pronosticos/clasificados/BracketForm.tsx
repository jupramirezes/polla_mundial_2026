'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleQualifier, saveTopPosition, saveTopScorer, lockBracket } from './actions';
import type { Team } from '@/lib/types';

type Round = 'r16' | 'qf' | 'sf' | 'final';
type Tab = 'r32' | Round | 'top';

const ROUNDS: Array<{ key: Round; label: string; capacity: number; pts: number }> = [
  { key: 'r16',   label: 'Octavos',     capacity: 16, pts: 3  },
  { key: 'qf',    label: 'Cuartos',     capacity: 8,  pts: 6  },
  { key: 'sf',    label: 'Semifinales', capacity: 4,  pts: 12 },
  { key: 'final', label: 'Final',       capacity: 2,  pts: 22 },
];

const POSITION_LABELS: Record<number, { label: string; pts: number }> = {
  1: { label: 'Campeón',      pts: 90 },
  2: { label: 'Subcampeón',   pts: 60 },
  3: { label: 'Tercer lugar', pts: 40 },
  4: { label: 'Cuarto lugar', pts: 28 },
};

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
  userId: string;
  allTeams: Team[];
  derivedR32: number[];
  derivedR32Warnings: string[];
  byGroup: ByGroupRow[];
  initial: {
    r16: number[]; qf: number[]; sf: number[]; final: number[];
    top: Record<number, number>;
    scorer: string;
  };
  bracketLockedAt: string | null;
  isAdmin: boolean;
}

type Banner = { kind: 'success' | 'error'; text: string } | null;

export function BracketForm({
  userId, allTeams, derivedR32, derivedR32Warnings, byGroup, initial,
  bracketLockedAt, isAdmin,
}: Props) {
  const router = useRouter();
  const locked = !!bracketLockedAt && !isAdmin;
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [locking, setLocking] = useState(false);

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
  const [topPicks, setTopPicks] = useState<Record<number, number | null>>({
    1: initial.top[1] ?? null,
    2: initial.top[2] ?? null,
    3: initial.top[3] ?? null,
    4: initial.top[4] ?? null,
  });
  const [scorer, setScorer] = useState(initial.scorer);
  const [activeTab, setActiveTab] = useState<Tab>('r32');
  const [busy, setBusy] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

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

  const topUnlocked = picks.sf.size === 4;   // top 4 se basa en semifinalistas
  const bracketComplete =
    r32Complete &&
    picks.r16.size === 16 &&
    picks.qf.size === 8 &&
    picks.sf.size === 4 &&
    picks.final.size === 2 &&
    Object.values(topPicks).filter(Boolean).length === 4 &&
    scorer.trim() !== '';

  async function handleConfirmLock() {
    setLocking(true);
    const r = await lockBracket();
    setLocking(false);
    setShowLockConfirm(false);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 5000);
      return;
    }
    setBanner({ kind: 'success', text: '✓ Bracket confirmado y bloqueado. Suerte!' });
    setTimeout(() => setBanner(null), 4000);
    router.refresh();
  }

  async function handleToggle(round: Round, teamId: number) {
    if (locked) return;
    setBusy(teamId);
    const result = await toggleQualifier({ round, teamId });
    setBusy(null);
    if (result.error) {
      setBanner({ kind: 'error', text: result.error });
      setTimeout(() => setBanner(null), 4000);
      return;
    }
    setPicks((prev) => {
      const next = { ...prev };
      next[round] = new Set(prev[round]);
      if (result.action === 'added') next[round].add(teamId);
      else next[round].delete(teamId);
      return next;
    });
    router.refresh();
  }

  async function changeTopPosition(pos: number, teamId: number | null) {
    if (locked) return;
    setTopPicks((p) => ({ ...p, [pos]: teamId }));
    const r = await saveTopPosition({ position: pos, teamId });
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 4000);
      return;
    }
    setBanner({ kind: 'success', text: `${POSITION_LABELS[pos].label} guardado.` });
    setTimeout(() => setBanner(null), 1500);
    router.refresh();
  }

  // Debounce manual para el goleador (sin auto-save: usuario teclea, debe guardar al perder foco)
  async function commitScorer() {
    if (locked) return;
    const r = await saveTopScorer(scorer);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 4000);
      return;
    }
    if (scorer.trim() !== '') {
      setBanner({ kind: 'success', text: 'Goleador guardado.' });
      setTimeout(() => setBanner(null), 1500);
    }
    router.refresh();
  }

  // Top 4 source = semifinalistas (4 equipos de SF)
  const semifinalistas = useMemo(() => Array.from(picks.sf), [picks.sf]);
  function topTeamsAvailableFor(pos: number): Team[] {
    const usedInOther = new Set<number>();
    for (const [p, tid] of Object.entries(topPicks)) {
      if (Number(p) !== pos && tid != null) usedInOther.add(tid);
    }
    return semifinalistas
      .filter((id) => !usedInOther.has(id))
      .map((id) => teamById.get(id))
      .filter(Boolean) as Team[];
  }

  return (
    <div>
      {locked && (
        <div className="mb-4 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 font-bold text-emerald-900">
            🔒 Bracket confirmado
          </div>
          <p className="mt-1 text-sm text-emerald-800">
            Confirmaste tu bracket el {new Date(bracketLockedAt!).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.
            No puedes cambiarlo. Si necesitas un ajuste legítimo, contacta al admin.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        <TabButton
          active={activeTab === 'r32'} onClick={() => setActiveTab('r32')}
          label="R32" progress={`${derivedR32.length}/32`} locked={false} auto
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
        <TabButton
          active={activeTab === 'top'} onClick={() => topUnlocked && setActiveTab('top')}
          label="Top 4 + Goleador"
          progress={`${Object.values(topPicks).filter(Boolean).length}/4`}
          locked={!topUnlocked}
        />
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

      {activeTab === 'r32' && (
        <R32View byGroup={byGroup} teamById={teamById} warnings={derivedR32Warnings} />
      )}

      {(['r16', 'qf', 'sf', 'final'] as Round[]).includes(activeTab as Round) && (
        <RoundView
          round={activeTab as Round}
          meta={ROUNDS.find((r) => r.key === activeTab)!}
          source={sourceFor(activeTab as Round)}
          picks={picks[activeTab as Round]}
          teamById={teamById}
          busy={busy}
          onToggle={(tid) => handleToggle(activeTab as Round, tid)}
        />
      )}

      {activeTab === 'top' && (
        <TopView
          semifinalistas={semifinalistas}
          topPicks={topPicks}
          scorer={scorer}
          teamById={teamById}
          teamsAvailableFor={topTeamsAvailableFor}
          onChangePosition={changeTopPosition}
          onScorerChange={setScorer}
          onScorerCommit={commitScorer}
        />
      )}

      {/* Botón Confirmar bracket — visible siempre, habilitado solo si está completo */}
      {!locked && (
        <div className="mt-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-900">¿Listo para confirmar tu bracket?</h3>
          <p className="mt-1 text-sm text-amber-900">
            Una vez confirmes <strong>no podrás cambiar nada</strong> (clasificados ni top 4 ni goleador).
            Solo el admin puede modificarlo después si hay razón legítima.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => setShowLockConfirm(true)}
              disabled={!bracketComplete}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {bracketComplete ? '🔒 Confirmar mi bracket' : 'Completa todo primero'}
            </button>
            {!bracketComplete && (
              <span className="text-xs text-amber-800">
                Te falta: {[
                  !r32Complete && 'R32',
                  picks.r16.size < 16 && `Octavos (${picks.r16.size}/16)`,
                  picks.qf.size < 8 && `Cuartos (${picks.qf.size}/8)`,
                  picks.sf.size < 4 && `Semis (${picks.sf.size}/4)`,
                  picks.final.size < 2 && `Final (${picks.final.size}/2)`,
                  Object.values(topPicks).filter(Boolean).length < 4 && `Top 4`,
                  scorer.trim() === '' && 'Goleador',
                ].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {showLockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">¿Confirmar tu bracket?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Después de esto <strong>no podrás cambiar nada</strong>: ni clasificados,
              ni top 4, ni goleador. Los marcadores de partidos siguen guardándose uno por uno.
            </p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>✓ R32: 32 equipos (automático)</div>
              <div>✓ Octavos: 16 equipos</div>
              <div>✓ Cuartos: 8 · Semis: 4 · Final: 2</div>
              <div>✓ Top 4 + Goleador</div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowLockConfirm(false)}
                disabled={locking}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLock}
                disabled={locking}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {locking ? 'Confirmando…' : 'Sí, confirmar bracket'}
              </button>
            </div>
          </div>
        </div>
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
        Esta lista es <strong>100% automática</strong> a partir de tus marcadores en Fase de grupos.
        Para cambiarla, edita tus pronósticos de grupos.
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
            <span className="text-slate-500"> / {meta.capacity} · </span>
            <span className="font-mono">{meta.pts} pts c/u</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Elige los {meta.capacity} equipos que crees pasan, de los {source.size} disponibles.
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

function TopView({
  semifinalistas, topPicks, scorer, teamById, teamsAvailableFor,
  onChangePosition, onScorerChange, onScorerCommit,
}: {
  semifinalistas: number[];
  topPicks: Record<number, number | null>;
  scorer: string;
  teamById: Map<number, Team>;
  teamsAvailableFor: (pos: number) => Team[];
  onChangePosition: (pos: number, teamId: number | null) => void;
  onScorerChange: (v: string) => void;
  onScorerCommit: () => void;
}) {
  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        Tus <strong>4 semifinalistas</strong> son: {semifinalistas.map((id) => {
          const t = teamById.get(id);
          return t ? `${t.flag_emoji ?? ''} ${t.name}` : '';
        }).join(', ')}. Asígnales posición final.
      </div>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Posiciones finales del mundial (entre tus semifinalistas)
        </h2>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((pos) => {
            const meta = POSITION_LABELS[pos];
            return (
              <label key={pos} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="w-36 shrink-0">
                  <div className="font-semibold">{meta.label}</div>
                  <div className="text-xs text-slate-500">{meta.pts} pts</div>
                </div>
                <select
                  value={topPicks[pos] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChangePosition(pos, v === '' ? null : Number(v));
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
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-3">
          Goleador del mundial
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <label className="flex items-center gap-3">
            <div className="w-36 shrink-0">
              <div className="font-semibold">Jugador</div>
              <div className="text-xs text-slate-500">50 pts</div>
            </div>
            <input
              type="text"
              value={scorer}
              onChange={(e) => onScorerChange(e.target.value)}
              onBlur={onScorerCommit}
              placeholder="Nombre completo del jugador"
              className="min-w-0 flex-1 rounded border border-slate-300 bg-amber-50 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={onScorerCommit}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Guardar
            </button>
          </label>
          <p className="mt-2 text-xs text-slate-500">
            Si varios jugadores empatan como máximos goleadores, todos los participantes que predijeron a cualquiera de ellos ganan los 50 pts.
          </p>
        </div>
      </section>
    </div>
  );
}
