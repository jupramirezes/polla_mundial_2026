import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { OfficialQualifiersForm } from './OfficialQualifiersForm';
import type { Team } from '@/lib/types';

export default async function AdminClasificadosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const supabase = await getSupabaseServerClient();
  const [{ data: teams }, { data: rows }] = await Promise.all([
    supabase.from('teams').select('*').order('group_letter').order('name'),
    supabase.from('official_qualifiers').select('round, team_id'),
  ]);

  const initial: Record<'r32' | 'r16' | 'qf' | 'sf' | 'final', number[]> = {
    r32: [], r16: [], qf: [], sf: [], final: [],
  };
  for (const r of (rows ?? []) as Array<{ round: string; team_id: number }>) {
    const k = r.round as keyof typeof initial;
    if (initial[k]) initial[k].push(r.team_id);
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Clasificados oficiales</h1>
            <p className="mt-1 text-sm text-slate-600">
              Marca los equipos que efectivamente pasaron a cada ronda.
              Cambios disparan recálculo automático del ranking.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6">
          <OfficialQualifiersForm
            teams={(teams ?? []) as Team[]}
            initial={initial}
          />
        </div>
      </div>
    </main>
  );
}
