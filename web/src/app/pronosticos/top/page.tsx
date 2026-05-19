import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllTeams } from '@/lib/data/qualifiers';
import { TopForm } from './TopForm';

export default async function TopPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [teams, { data: positionRows }, { data: scorerRow }] = await Promise.all([
    loadAllTeams(),
    supabase
      .from('predictions_top_positions')
      .select('position, team_id')
      .eq('user_id', user.id),
    supabase
      .from('predictions_top_scorer')
      .select('player_name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const initialPositions: Record<number, number> = {};
  for (const r of (positionRows ?? []) as Array<{ position: number; team_id: number }>) {
    initialPositions[r.position] = r.team_id;
  }
  const initialScorer = (scorerRow as { player_name?: string } | null)?.player_name ?? '';

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Top 4 final + goleador</h1>
            <p className="mt-1 text-sm text-slate-600">
              Posiciones finales (218 pts) + Goleador (50 pts) = 268 pts
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <TopForm
            teams={teams}
            initialPositions={initialPositions}
            initialScorer={initialScorer}
          />
        </div>
      </div>
    </main>
  );
}
