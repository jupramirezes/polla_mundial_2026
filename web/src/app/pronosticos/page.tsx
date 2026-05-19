import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function PronosticosPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // En el futuro: leer progreso real desde la BD
  const sections = [
    {
      key: 'grupos',
      title: 'Fase de grupos',
      desc: '72 marcadores + 12 grupos de posiciones',
      pts: '480 pts en juego',
      href: '/pronosticos/grupos',
      open: true,
    },
    {
      key: 'clasificados',
      title: 'Clasificados a cada ronda',
      desc: 'Qué equipos pasan a R32, octavos, cuartos, semis, final',
      pts: '252 pts',
      href: '/pronosticos/clasificados',
      open: true,
    },
    {
      key: 'top',
      title: 'Top 4 final + goleador',
      desc: 'Campeón, sub, 3°, 4° y goleador del mundial',
      pts: '268 pts',
      href: '/pronosticos/top',
      open: true,
    },
    {
      key: 'ko',
      title: 'Marcadores de eliminatorias',
      desc: 'Predice los marcadores en vivo (R32 → final). Cada ronda se abre cuando el admin asigne los equipos.',
      pts: '160 pts',
      href: '/pronosticos/eliminatorias',
      open: true,
    },
  ];

  return (
    <main className="flex-1 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Mis pronósticos</h1>
        <p className="mt-1 text-slate-600">
          Suma puntos a medida que vas acertando. Total en juego: <strong>1.160 pts</strong>.
        </p>

        <ul className="mt-6 grid gap-3">
          {sections.map((s) => (
            <li key={s.key}>
              {s.open ? (
                <Link
                  href={s.href}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 transition"
                >
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-semibold">{s.title}</h2>
                    <span className="text-sm text-slate-500">{s.pts}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
                </Link>
              ) : (
                <div className="block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 opacity-60">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-semibold">{s.title}</h2>
                    <span className="text-sm text-slate-500">{s.pts}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    🔒 Se desbloquea cuando empiecen las eliminatorias
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
