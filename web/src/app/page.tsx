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
    <main className="flex-1">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-700 via-emerald-700 to-emerald-900 text-white">
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <div className="text-6xl mb-2">⚽🏆</div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Polla Mundial 2026</h1>
          <p className="mt-2 text-emerald-100">
            Copa Mundial FIFA · USA · México · Canadá · 11 Jun → 19 Jul 2026
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            {userEmail ? (
              <>
                <Link
                  href="/pronosticos"
                  className="rounded-lg bg-amber-400 px-6 py-3 font-bold text-amber-950 hover:bg-amber-300"
                >
                  Mis pronósticos
                </Link>
                <Link
                  href="/ranking"
                  className="rounded-lg bg-white/10 px-6 py-3 font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
                >
                  Ver ranking
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/registro"
                  className="rounded-lg bg-amber-400 px-6 py-3 font-bold text-amber-950 hover:bg-amber-300"
                >
                  Crear cuenta
                </Link>
                <Link
                  href="/login"
                  className="rounded-lg bg-white/10 px-6 py-3 font-semibold text-white ring-1 ring-white/30 hover:bg-white/20"
                >
                  Entrar
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Reglas resumidas */}
      <section className="mx-auto max-w-3xl px-4 py-10">
        <h2 className="text-xl font-bold text-center mb-6">Cómo se juega</h2>

        <div className="space-y-3">
          <RuleCard
            icon="⚽"
            title="1. Marcadores de fase de grupos"
            desc="Los 72 partidos. Por cada uno: 2 pts si aciertas el ganador, +3 pts si aciertas el marcador exacto. Las posiciones de cada grupo se calculan SOLAS a partir de tus marcadores."
            pts="máx 480 pts"
          />
          <RuleCard
            icon="🎯"
            title="2. Clasificados a cada ronda"
            desc="R32 (dieciseisavos) se llena automático: top 2 de cada grupo + 8 mejores 3ros con regla FIFA. De octavos en adelante eliges los que crees que pasan."
            pts="máx 252 pts"
          />
          <RuleCard
            icon="🥇"
            title="3. Top 4 final + Goleador"
            desc="Quién queda campeón, subcampeón, 3° y 4°. Y el goleador del mundial."
            pts="máx 268 pts"
          />
          <RuleCard
            icon="🔴"
            title="4. Marcadores en eliminatorias (EN VIVO)"
            desc="Cuando empiezan los dieciseisavos, se abren formularios para predecir el marcador de cada partido (R32 → final). Mismas reglas: 2+3 pts por partido. Tienes hasta antes del pitazo inicial."
            pts="máx 160 pts"
          />
        </div>

        <div className="mt-6 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-900 mb-1">⚠️ Regla importante</h3>
          <p className="text-sm text-amber-900">
            Una vez le das <strong>Guardar</strong> a un pronóstico, queda bloqueado y
            <strong> no se puede cambiar</strong>. Esto evita que alguien entre a editar
            después de saber lo que pasó. Si necesitas un cambio legítimo, contacta al admin
            por WhatsApp con la razón.
          </p>
        </div>

        <div className="mt-6 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4 text-center">
          <div className="text-sm text-emerald-900 font-medium">Total a repartir</div>
          <div className="font-mono text-3xl font-extrabold text-emerald-700">1.160 pts</div>
        </div>
      </section>

      {/* Cómo funciona en vivo */}
      <section className="bg-white border-y border-slate-200">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <h2 className="text-xl font-bold text-center mb-6">¿Cómo va a ser en eliminatorias?</h2>
          <ol className="space-y-3 text-sm">
            <Step n={1}>
              <strong>Termina la fase de grupos.</strong> El admin confirma quién pasa a dieciseisavos (top 2 de cada grupo + 8 mejores 3ros).
            </Step>
            <Step n={2}>
              Apenas se conocen los <strong>enfrentamientos</strong> de la siguiente ronda (ej. Brasil vs Francia en R32), la web te abre el formulario para que predigas <strong>el marcador de ese partido</strong>.
            </Step>
            <Step n={3}>
              Tienes hasta <strong>antes del pitazo inicial</strong> para guardar. Después se bloquea.
            </Step>
            <Step n={4}>
              Termina el partido → el admin carga el resultado oficial → el ranking se actualiza <strong>en vivo</strong> para todos.
            </Step>
            <Step n={5}>
              Se repite para octavos, cuartos, semis, tercer puesto y final.
            </Step>
          </ol>
          <p className="mt-4 text-xs text-center text-slate-500">
            Aunque no hayas acertado quién pasaba a octavos, todavía puedes seguir sumando puntos
            con los marcadores en vivo. Nadie queda fuera del juego.
          </p>
        </div>
      </section>
    </main>
  );
}

function RuleCard({
  icon, title, desc, pts,
}: { icon: string; title: string; desc: string; pts: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-300 transition">
      <div className="text-2xl shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <span className="text-xs font-mono text-emerald-700 font-semibold">{pts}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">{desc}</p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-mono text-xs font-bold text-white">
        {n}
      </span>
      <p className="text-slate-700">{children}</p>
    </li>
  );
}
