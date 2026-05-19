import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export default async function HomePage() {
  let userEmail: string | null = null;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userEmail = data.user?.email ?? null;
  } catch {
    // env no configurada todavía
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-xl w-full text-center">
        <div className="text-6xl mb-4">⚽</div>
        <h1 className="text-4xl font-bold mb-3">Polla Mundial 2026</h1>
        <p className="text-lg text-slate-600 mb-8">
          Pronósticos para la Copa Mundial FIFA 2026 · USA · México · Canadá
        </p>

        {userEmail ? (
          <div className="flex flex-col gap-3">
            <p className="text-slate-700">
              Hola, <strong>{userEmail}</strong>
            </p>
            <Link
              href="/pronosticos"
              className="rounded-lg bg-slate-900 text-white px-6 py-3 font-medium hover:bg-slate-800 transition"
            >
              Mis pronósticos
            </Link>
            <Link
              href="/ranking"
              className="rounded-lg border border-slate-300 px-6 py-3 font-medium hover:bg-slate-100 transition"
            >
              Ver ranking
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-slate-900 text-white px-6 py-3 font-medium hover:bg-slate-800 transition"
            >
              Entrar
            </Link>
            <Link
              href="/registro"
              className="rounded-lg border border-slate-300 px-6 py-3 font-medium hover:bg-slate-100 transition"
            >
              Crear cuenta
            </Link>
          </div>
        )}

        <p className="mt-12 text-sm text-slate-500">
          1.000 puntos en juego · 20 amigos · 104 partidos
        </p>
      </div>
    </main>
  );
}
