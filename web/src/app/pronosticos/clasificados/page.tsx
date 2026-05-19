import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllTeams, loadMyQualifiers } from '@/lib/data/qualifiers';
import { QualifiersForm } from './QualifiersForm';

export default async function ClasificadosPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [teams, myQualifiers] = await Promise.all([
    loadAllTeams(),
    loadMyQualifiers(),
  ]);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Clasificados a cada ronda</h1>
            <p className="mt-1 text-sm text-slate-600">
              Sin orden · 252 pts en juego
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-slate-600 hover:underline">
            ← Volver
          </Link>
        </div>

        <p className="mt-4 text-sm text-slate-600">
          Marca los equipos que crees que pasan a cada ronda. Cada equipo correcto suma:
          R32: 2 pts · Octavos: 3 · Cuartos: 6 · Semis: 12 · Final: 22.
        </p>

        <div className="mt-6">
          <QualifiersForm
            teams={teams}
            initial={{
              r32:   Array.from(myQualifiers.r32),
              r16:   Array.from(myQualifiers.r16),
              qf:    Array.from(myQualifiers.qf),
              sf:    Array.from(myQualifiers.sf),
              final: Array.from(myQualifiers.final),
            }}
          />
        </div>
      </div>
    </main>
  );
}
