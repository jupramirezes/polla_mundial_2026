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
              Paso 1 de 2 para cada partido KO: asignas QUIÉN JUEGA CONTRA QUIÉN.
            </p>
          </div>
          <Link href="/admin" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <strong className="block mb-1">📋 Cómo es el flujo completo de un partido KO:</strong>
          <ol className="ml-4 list-decimal space-y-0.5">
            <li>Aquí: <strong>asignas los 2 equipos</strong> del partido (ej. R32-01: México vs Senegal).</li>
            <li>Eso abre automáticamente el formulario en <code className="bg-white px-1 rounded">/pronosticos/eliminatorias</code> para que los participantes predigan el marcador.</li>
            <li>Cuando el partido termina, vas a <Link href="/admin/resultados" className="font-bold underline">/admin/resultados</Link> → tab de la etapa → metes el marcador OFICIAL (ej. 2-1). El ranking se recalcula solo.</li>
          </ol>
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
