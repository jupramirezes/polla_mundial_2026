'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Team } from '@/lib/types';
import { STAGE_LABEL } from '@/lib/bracket/structure';
import { crucesByStage, type DerivedBracket, type DerivedCruce } from '@/lib/bracket/derive';
import { saveBracketWinner, lockBracketWinners } from './actions';
import { saveTopScorer } from './scorer-action';

interface Props {
  userId: string;
  bracket: DerivedBracket;
  teams: Team[];
  initialScorer: string;
  bracketLockedAt: string | null;
  isAdmin: boolean;
}

type Banner = { kind: 'success' | 'error' | 'info'; text: string } | null;

const STAGE_ORDER: Array<keyof typeof STAGE_LABEL> = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];

export function BracketView({
  bracket, teams, initialScorer, bracketLockedAt, isAdmin,
}: Props) {
  const router = useRouter();
  const locked = !!bracketLockedAt && !isAdmin;

  const teamById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const [busy, setBusy] = useState<number | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [scorer, setScorer] = useState(initialScorer);
  const [confirmingLock, setConfirmingLock] = useState(false);
  const [lockingNow, setLockingNow] = useState(false);

  // Cuántos picks tiene el usuario
  const totalPicks = bracket.cruces.filter((c) => c.userPickedWinnerTeamId != null).length;
  const totalCruces = bracket.cruces.length;  // 32
  const allPicksDone = totalPicks === totalCruces;
  const scorerDone = scorer.trim() !== '';
  const canConfirm = allPicksDone && scorerDone;

  async function pickWinner(matchNum: number, teamId: number) {
    if (locked) return;
    setBusy(matchNum);
    setBanner(null);
    const r = await saveBracketWinner({ matchNum, winnerTeamId: teamId });
    setBusy(null);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 4000);
      return;
    }
    router.refresh();
  }

  async function commitScorer() {
    if (locked) return;
    setBanner(null);
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

  async function handleLock() {
    setLockingNow(true);
    const r = await lockBracketWinners();
    setLockingNow(false);
    setConfirmingLock(false);
    if (r.error) {
      setBanner({ kind: 'error', text: r.error });
      setTimeout(() => setBanner(null), 5000);
      return;
    }
    setBanner({ kind: 'success', text: '✓ Bracket confirmado y bloqueado. ¡Suerte!' });
    setTimeout(() => setBanner(null), 4000);
    router.refresh();
  }

  const byStage = useMemo(() => crucesByStage(bracket.cruces), [bracket.cruces]);

  return (
    <div className="mt-6">
      {locked && (
        <div className="mb-4 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
          <div className="font-bold text-emerald-900">🔒 Bracket confirmado</div>
          <p className="mt-1 text-sm text-emerald-800">
            Confirmaste tu bracket el{' '}
            {new Date(bracketLockedAt!).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.
            No puedes cambiarlo. Para ajustes legítimos, contacta al admin.
          </p>
        </div>
      )}

      {banner && (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
          banner.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' :
          banner.kind === 'error'   ? 'border-red-200 bg-red-50 text-red-900' :
                                       'border-blue-200 bg-blue-50 text-blue-900'
        }`}>
          {banner.text}
        </div>
      )}

      {bracket.warnings.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ {bracket.warnings.join(' ')}
        </div>
      )}

      {/* Progress */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span><strong>Picks:</strong> <span className="font-mono">{totalPicks}/32</span> partidos</span>
          <span><strong>Goleador:</strong> {scorerDone ? '✓' : '—'}</span>
        </div>
        <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${(totalPicks / totalCruces) * 100}%` }}
          />
        </div>
      </div>

      {/* Cada etapa */}
      <div className="space-y-6">
        {STAGE_ORDER.map((stage) => {
          const cruces = byStage.get(stage) ?? [];
          if (cruces.length === 0) return null;
          return (
            <StageSection
              key={stage}
              stage={stage}
              cruces={cruces}
              teamById={teamById}
              onPick={pickWinner}
              busy={busy}
              locked={locked}
            />
          );
        })}
      </div>

      {/* Goleador */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
          Goleador del mundial · 50 pts
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <input
              type="text"
              value={scorer}
              onChange={(e) => setScorer(e.target.value)}
              onBlur={commitScorer}
              disabled={locked}
              placeholder="Nombre completo del jugador"
              className="flex-1 rounded border border-slate-300 bg-amber-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
            />
            <button
              onClick={commitScorer}
              disabled={locked}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Si varios jugadores empatan como máximos goleadores del mundial, todos los participantes
            que predijeron a cualquiera de ellos ganan los 50 pts.
          </p>
        </div>
      </section>

      {/* Botón Confirmar Bracket */}
      {!locked && (
        <div className="mt-8 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-900">¿Listo para confirmar tu bracket?</h3>
          <p className="mt-1 text-sm text-amber-900">
            Una vez confirmes, <strong>no podrás cambiar nada</strong>. Solo el admin podrá modificar.
          </p>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setConfirmingLock(true)}
              disabled={!canConfirm || lockingNow}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white hover:bg-emerald-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {canConfirm ? '🔒 Confirmar mi bracket' : 'Falta completar todo'}
            </button>
            {!canConfirm && (
              <span className="text-xs text-amber-800">
                Falta: {[
                  !allPicksDone && `${totalCruces - totalPicks} partidos sin pick`,
                  !scorerDone && 'goleador',
                ].filter(Boolean).join(', ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmación */}
      {confirmingLock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">¿Confirmar tu bracket?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Después de esto <strong>no podrás cambiar nada</strong>: ni picks de bracket ni goleador.
              Los marcadores de partidos siguen guardándose uno por uno aparte.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmingLock(false)}
                disabled={lockingNow}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                onClick={handleLock}
                disabled={lockingNow}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {lockingNow ? 'Confirmando…' : 'Sí, confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StageSection({
  stage, cruces, teamById, onPick, busy, locked,
}: {
  stage: keyof typeof STAGE_LABEL;
  cruces: DerivedCruce[];
  teamById: Map<number, Team>;
  onPick: (matchNum: number, teamId: number) => void;
  busy: number | null;
  locked: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
        {STAGE_LABEL[stage]} <span className="font-mono text-xs text-slate-500">({cruces.length} partidos)</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cruces.map((c) => (
          <CruceCard
            key={c.matchNum}
            cruce={c}
            teamById={teamById}
            onPick={onPick}
            busy={busy === c.matchNum}
            locked={locked}
          />
        ))}
      </div>
    </section>
  );
}

function CruceCard({
  cruce, teamById, onPick, busy, locked,
}: {
  cruce: DerivedCruce;
  teamById: Map<number, Team>;
  onPick: (matchNum: number, teamId: number) => void;
  busy: boolean;
  locked: boolean;
}) {
  const aResolved = cruce.teamA.kind === 'resolved' ? teamById.get(cruce.teamA.teamId) : null;
  const bResolved = cruce.teamB.kind === 'resolved' ? teamById.get(cruce.teamB.teamId) : null;
  const aPending = cruce.teamA.kind === 'pending';
  const bPending = cruce.teamB.kind === 'pending';
  const ready = !aPending && !bPending && aResolved && bResolved;

  const winnerTeamId = cruce.userPickedWinnerTeamId;

  function TeamButton({ team, isPicked, side }: { team: Team; isPicked: boolean; side: 'A' | 'B' }) {
    return (
      <button
        onClick={() => onPick(cruce.matchNum, team.id)}
        disabled={!ready || busy || locked}
        className={`flex-1 rounded-md border-2 px-2 py-2 text-sm font-medium text-left transition truncate ${
          isPicked
            ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
            : 'border-slate-200 bg-white hover:border-slate-400'
        } ${(!ready || locked) ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <span className="mr-1">{team.flag_emoji ?? ''}</span>
        {team.name}
        {isPicked && <span className="ml-1 text-emerald-700">✓</span>}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-slate-500">M{cruce.matchNum}</span>
        {busy && <span className="text-xs text-blue-700 font-semibold">guardando…</span>}
      </div>
      <div className="flex items-stretch gap-2">
        {aResolved ? (
          <TeamButton team={aResolved} isPicked={winnerTeamId === aResolved.id} side="A" />
        ) : (
          <div className="flex-1 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-400 italic">
            {cruce.teamA.kind === 'pending' ? cruce.teamA.reason : 'por definir'}
          </div>
        )}
        <span className="flex items-center text-xs text-slate-400">vs</span>
        {bResolved ? (
          <TeamButton team={bResolved} isPicked={winnerTeamId === bResolved.id} side="B" />
        ) : (
          <div className="flex-1 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-2 py-2 text-sm text-slate-400 italic">
            {cruce.teamB.kind === 'pending' ? cruce.teamB.reason : 'por definir'}
          </div>
        )}
      </div>
    </div>
  );
}
