import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllGroups, getGroupPhaseLock } from '@/lib/data/groups';
import { loadMyMatchPredictions, loadMyGroupStandings } from '@/lib/data/predictions';
import { GroupCard } from './GroupCard';

export default async function GruposPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [groups, predMatches, predStandings, lockAt] = await Promise.all([
    loadAllGroups(),
    loadMyMatchPredictions(),
    loadMyGroupStandings(),
    getGroupPhaseLock(),
  ]);

  const totalMatches = groups.reduce((n, g) => n + g.matches.length, 0);
  const filledMatches = Array.from(predMatches.keys()).filter((mid) =>
    groups.some((g) => g.matches.some((m) => m.id === mid)),
  ).length;

  const totalStandings = groups.length * 4;
  const filledStandings = Array.from(predStandings.values()).reduce((n, m) => n + m.size, 0);

  const phaseOpen = !lockAt || lockAt > new Date();

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Fase de grupos</h1>
            <p className="mt-1 text-sm text-slate-600">
              72 marcadores + 12 grupos · 480 pts en juego
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ProgressTile
            label="Marcadores"
            value={filledMatches}
            total={totalMatches}
            color="bg-amber-500"
          />
          <ProgressTile
            label="Posiciones de grupo"
            value={filledStandings}
            total={totalStandings}
            color="bg-blue-500"
          />
          <div className="rounded-lg border border-slate-200 bg-white p-3 col-span-2 sm:col-span-1">
            <div className="text-xs text-slate-500">Cierre de pronósticos</div>
            {lockAt ? (
              <div className="mt-1 font-medium">
                {phaseOpen ? '🟢 Abierto' : '🔒 Cerrado'}
                <div className="text-xs text-slate-500">
                  {lockAt.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
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
            const matchPreds = new Map<number, { home: number; away: number }>();
            for (const m of g.matches) {
              const p = predMatches.get(m.id);
              if (p) matchPreds.set(m.id, { home: p.home_score, away: p.away_score });
            }
            const standingPreds = predStandings.get(g.letter) ?? new Map<number, number>();

            return (
              <GroupCard
                key={g.letter}
                letter={g.letter}
                teams={g.teams}
                matches={g.matches}
                initialMatchPreds={Array.from(matchPreds.entries())}
                initialStandingPreds={Array.from(standingPreds.entries())}
                editable={phaseOpen}
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
