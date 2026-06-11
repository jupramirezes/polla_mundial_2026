import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { loadAllGroups, getGroupPhaseLock } from '@/lib/data/groups';
import { loadMyMatchPredictions } from '@/lib/data/predictions';
import { GroupCard } from './GroupCard';

export default async function GruposPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const [groups, predMatches, lockAt] = await Promise.all([
    loadAllGroups(),
    loadMyMatchPredictions(),
    getGroupPhaseLock(),
  ]);

  const totalMatches = groups.reduce((n, g) => n + g.matches.length, 0);
  const filledMatches = Array.from(predMatches.keys()).filter((mid) =>
    groups.some((g) => g.matches.some((m) => m.id === mid)),
  ).length;
  const lockedMatches = Array.from(predMatches.values()).filter((p) => !!p.locked_at).length;

  const phaseOpen = !lockAt || lockAt > new Date();

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fase de grupos</h1>
            <p className="mt-1 text-sm text-slate-600">
              72 marcadores · 480 pts en juego
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        {/* Header con regla del lock */}
        <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠️ Cada partido tiene su propio botón <strong>Guardar</strong>. Una vez guardado,
          el marcador queda <strong>bloqueado</strong> y solo el admin puede modificarlo
          (si lo pides por WhatsApp con razón válida).
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ProgressTile
            label="Marcadores guardados"
            value={lockedMatches}
            total={totalMatches}
            color="bg-emerald-600"
          />
          <ProgressTile
            label="Por confirmar"
            value={filledMatches - lockedMatches}
            total={totalMatches}
            color="bg-amber-500"
          />
          <div className="rounded-lg border border-slate-200 bg-white p-3 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500">Cierre de pronósticos</div>
            {lockAt ? (
              <div className="mt-1 font-medium text-sm">
                {phaseOpen ? '🟢 Abierto' : '🔒 Cerrado'}
                <div className="text-xs text-slate-500 font-mono">
                  {lockAt.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}
                </div>
              </div>
            ) : (
              <div className="mt-1 font-medium">—</div>
            )}
          </div>
        </div>

        {!phaseOpen && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            La fase de grupos ya cerró. Tus pronósticos quedaron fijos para el cálculo.
          </div>
        )}

        <div className="mt-6 space-y-3">
          {groups.map((g) => {
            const matchPreds = new Map<number, { home: number; away: number; locked_at: string | null }>();
            for (const m of g.matches) {
              const p = predMatches.get(m.id);
              if (p) matchPreds.set(m.id, {
                home: p.home_score, away: p.away_score, locked_at: p.locked_at,
              });
            }

            return (
              <GroupCard
                key={g.letter}
                letter={g.letter}
                teams={g.teams}
                matches={g.matches}
                initialMatchPreds={Array.from(matchPreds.entries())}
                phaseOpen={phaseOpen}
                isAdmin={me.isAdmin}
                userId={me.id}
              />
            );
          })}
        </div>
      </div>
    </main>
  );
}

function ProgressTile({
  label, value, total, color,
}: { label: string; value: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : (value / total) * 100;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1 font-mono">
        <span className="font-semibold text-lg">{value}</span>
        <span className="text-slate-400 text-sm">/ {total}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
