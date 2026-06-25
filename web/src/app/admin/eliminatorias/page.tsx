import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { EliminatoriasForm } from './EliminatoriasForm';
import type { MatchRow, Team } from '@/lib/types';

export default async function AdminEliminatoriasPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const supabase = await getSupabaseServerClient();
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from('teams').select('*').order('group_letter').order('name'),
    supabase.from('matches').select('*').neq('stage', 'group').order('id'),
  ]);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Enfrentamientos de eliminatorias</h1>
            <p className="mt-1 text-sm text-slate-600">
              Estos cruces se llenan <strong>solos</strong> con cada resultado oficial que guardas. Las
              casillas de abajo son por si necesitas <strong>corregir algo a mano</strong> (excepción).
            </p>
          </div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <EliminatoriasForm
            teams={(teams ?? []) as Team[]}
            matches={(matches ?? []) as MatchRow[]}
          />
        </div>
      </div>
    </main>
  );
}
