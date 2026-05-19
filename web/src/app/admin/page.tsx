import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getAdminCount } from '@/lib/auth';
import { ClaimAdminButton } from './ClaimAdminButton';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function AdminHomePage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const adminCount = await getAdminCount();

  // Si todavía no hay ningún admin, ofrezco "claim"
  if (adminCount === 0) {
    return (
      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Setup de admin</h1>
          <p className="mt-2 text-sm text-slate-600">
            Todavía no hay administrador en este Polla. La primera persona que reclame el rol
            queda como admin (encárgate tú o un amigo de confianza).
          </p>
          <div className="mt-6">
            <ClaimAdminButton />
          </div>
        </div>
      </main>
    );
  }

  if (!me.isAdmin) {
    return (
      <main className="flex-1 px-4 py-12">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold">Sin acceso</h1>
          <p className="mt-2 text-sm text-slate-600">
            Solo el administrador puede ver esta sección. Pídele que te de permisos si lo necesitas.
          </p>
        </div>
      </main>
    );
  }

  // Stats rápidas
  const supabase = await getSupabaseServerClient();
  const [
    { count: nProfiles },
    { count: nResults },
    { count: nKO },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('matches').select('id', { count: 'exact', head: true }).not('home_score', 'is', null),
    supabase.from('matches').select('id', { count: 'exact', head: true }).not('stage', 'eq', 'group').not('home_team_id', 'is', null),
  ]);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Panel del admin</h1>
        <p className="mt-1 text-sm text-slate-600">
          Logueado como <strong>{me.displayName ?? me.email}</strong>
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Usuarios registrados"     value={nProfiles ?? 0} />
          <Stat label="Partidos con resultado"   value={`${nResults ?? 0}/104`} />
          <Stat label="Pairings de eliminatoria" value={`${nKO ?? 0}/32`} />
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Durante el mundial (los más usados)
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdminTile
                href="/admin/resultados"
                title="① Cargar resultado de un partido"
                desc="Apenas termine cada partido, entra acá y mete el marcador (X — Y). Va por etapa (grupos, R32, octavos…). El ranking se recalcula solo."
              />
              <AdminTile
                href="/admin/eliminatorias"
                title="② Asignar enfrentamientos KO"
                desc="Cuando se conozcan los cruces (ej. Brasil vs Francia en R32), asigna los dos equipos a cada partido. Eso abre el formulario de pronóstico para los participantes."
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Final del mundial
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdminTile
                href="/admin/clasificados"
                title="③ Marcar clasificados oficiales"
                desc="Al terminar cada ronda, marca quién pasa a la siguiente (32 a R32, 16 a octavos, 8 a cuartos, etc). Se usa para calificar los puntos de 'clasificados'."
              />
              <AdminTile
                href="/admin/top"
                title="④ Top 4 + goleador final"
                desc="Al terminar la final, asigna campeón/sub/3°/4° y el goleador del mundial. Cierra los puntos finales."
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 mb-2">
              Gestión
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdminTile
                href="/admin/usuarios"
                title="Usuarios y permisos"
                desc="Lista de registrados. Promover/quitar admin (para tu amigo organizador). Pronto: editar predicciones de cualquier usuario."
              />
              <AdminTile
                href="/admin/upload-excel"
                title="Subir Excel de un participante"
                desc="(En desarrollo) Para usuarios que prefieran llenar el Excel offline."
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
    </div>
  );
}

function AdminTile({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 transition"
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{desc}</p>
    </Link>
  );
}
