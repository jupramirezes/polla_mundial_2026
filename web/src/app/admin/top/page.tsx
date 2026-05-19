import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { OfficialTopForm } from './OfficialTopForm';
import type { Team } from '@/lib/types';

export default async function AdminTopPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const supabase = await getSupabaseServerClient();
  const [{ data: teams }, { data: positions }, { data: scorers }] = await Promise.all([
    supabase.from('teams').select('*').order('name'),
    supabase.from('official_top_positions').select('position, team_id'),
    supabase.from('official_top_scorers').select('player_name, goals'),
  ]);

  const initialPositions: Record<number, number> = {};
  for (const r of (positions ?? []) as Array<{ position: number; team_id: number }>) {
    initialPositions[r.position] = r.team_id;
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Top 4 + goleador oficiales</h1>
            <p className="mt-1 text-sm text-slate-600">
              Resultado final del mundial. Disparará el recálculo final del ranking.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <OfficialTopForm
            teams={(teams ?? []) as Team[]}
            initialPositions={initialPositions}
            initialScorers={(scorers ?? []) as Array<{ player_name: string; goals: number }>}
          />
        </div>
      </div>
    </main>
  );
}
