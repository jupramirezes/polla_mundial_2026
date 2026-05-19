import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ResultsForm } from './ResultsForm';
import type { MatchRow, Team } from '@/lib/types';

export default async function AdminResultadosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const supabase = await getSupabaseServerClient();
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from('teams').select('*').order('id'),
    supabase.from('matches').select('*').order('id'),
  ]);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Resultados oficiales</h1>
            <p className="mt-1 text-sm text-slate-600">
              Edita el marcador de cada partido. El ranking se recalcula automáticamente.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <ResultsForm
            teams={(teams ?? []) as Team[]}
            matches={(matches ?? []) as MatchRow[]}
          />
        </div>
      </div>
    </main>
  );
}
