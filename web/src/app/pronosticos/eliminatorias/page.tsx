import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { EliminatoriasPredictForm } from './EliminatoriasPredictForm';
import type { MatchRow, Team } from '@/lib/types';

export default async function EliminatoriasPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const supabase = await getSupabaseServerClient();
  const [{ data: teams }, { data: matches }, { data: preds }] = await Promise.all([
    supabase.from('teams').select('*').order('name'),
    supabase
      .from('matches')
      .select('*')
      .neq('stage', 'group')
      .order('id'),
    supabase
      .from('predictions_knockout_matches')
      .select('match_id, home_score, away_score, locked_at')
      .eq('user_id', me.id),
  ]);

  const myPreds = new Map<number, { home: number; away: number; lockedAt: string | null }>();
  for (const r of (preds ?? []) as Array<{ match_id: number; home_score: number; away_score: number; locked_at: string | null }>) {
    myPreds.set(r.match_id, { home: r.home_score, away: r.away_score, lockedAt: r.locked_at });
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Marcadores en eliminatorias</h1>
            <p className="mt-1 text-sm text-slate-600">
              Predice el marcador de cada partido. 2 pts por ganador, +3 por marcador exacto.
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <EliminatoriasPredictForm
            teams={(teams ?? []) as Team[]}
            matches={(matches ?? []) as MatchRow[]}
            initialPreds={Array.from(myPreds.entries())}
            isAdmin={me.isAdmin}
          />
        </div>
      </div>
    </main>
  );
}
