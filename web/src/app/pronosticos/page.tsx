import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export default async function PronosticosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { count: matchesFilled },
    { count: bracketWinnersFilled },
    { data: scorerRow },
    { count: koPredsFilled },
    { data: profileRow },
  ] = await Promise.all([
    supabase.from('predictions_matches').select('match_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('predictions_bracket_winners').select('match_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('predictions_top_scorer').select('player_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('predictions_knockout_matches').select('match_id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('profiles').select('bracket_locked_at').eq('id', user.id).maybeSingle(),
  ]);

  const hasScorer = !!(scorerRow as { player_name?: string } | null)?.player_name;
  // El bracket son 32 cruces (R32 + R16 + QF + SF + 3°P + Final) + 1 goleador = 33
  const bracketPicks = (bracketWinnersFilled ?? 0) + (hasScorer ? 1 : 0);
  const bracketTotal = 33;
  const bracketLocked = !!(profileRow as { bracket_locked_at?: string | null } | null)?.bracket_locked_at;
  // Llenó los 32 cruces + goleador pero todavía NO confirmó → sus picks no cuentan aún.
  const bracketComplete = (bracketWinnersFilled ?? 0) >= 32 && hasScorer;
  const bracketNeedsConfirm = !bracketLocked && bracketComplete;

  const sections = [
    {
      key: 'grupos',
      title: '⚽ Fase de grupos',
      desc: 'Predice los 72 marcadores. Las posiciones de cada grupo se calculan solas.',
      pts: '480 pts',
      href: '/pronosticos/grupos',
      progress: `${matchesFilled ?? 0} / 72 marcadores`,
      done: (matchesFilled ?? 0) >= 72,
      warn: false,
    },
    {
      key: 'bracket',
      title: '🏆 Bracket completo',
      desc: 'R32 automático. Eliges octavos, cuartos, semis, final, campeón/sub/3°/4° y goleador.',
      pts: '520 pts',
      href: '/pronosticos/clasificados',
      progress: bracketLocked
        ? '🔒 Confirmado'
        : bracketNeedsConfirm
          ? '⚠️ 33/33 — falta CONFIRMAR'
          : `${bracketPicks} / ${bracketTotal} picks`,
      done: bracketLocked,
      warn: bracketNeedsConfirm,
    },
    {
      key: 'ko',
      title: '🔴 Marcadores en eliminatorias (EN VIVO)',
      desc: 'Predice los marcadores de cada partido cuando el admin asigne los enfrentamientos.',
      pts: '160 pts',
      href: '/pronosticos/eliminatorias',
      progress: `${koPredsFilled ?? 0} marcadores predichos`,
      done: false,
      warn: false,
    },
  ];

  return (
    <main className="flex-1 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Mis pronósticos</h1>
        <p className="mt-1 text-sm text-slate-600">
          Total en juego: <strong>1.160 pts</strong>.
        </p>

        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          💡 <strong>Tip:</strong> primero llena todo (lo que vayas escribiendo se guarda en tu navegador
          aunque cambies de pantalla). Cuando estés conforme, le das <strong>Guardar</strong> partido por partido.
          Una vez guardado queda bloqueado y solo el admin puede cambiarlo. El <strong>bracket</strong> además
          necesita un paso final: pulsar <strong>“Confirmar mi bracket”</strong> al terminar.
        </div>

        {bracketNeedsConfirm && (
          <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-4">
            <div className="font-bold text-amber-900">⚠️ ¡Te falta confirmar tu bracket!</div>
            <p className="mt-1 text-sm text-amber-900">
              Ya llenaste los 32 cruces y el goleador, pero <strong>todavía no los confirmaste</strong>.
              Tus picks de eliminatorias (campeón, subcampeón, 3°, 4°) y tu goleador
              <strong> NO cuentan para el ranking</strong> hasta que entres al bracket y pulses
              <strong> “Confirmar mi bracket”</strong>.
            </p>
            <Link
              href="/pronosticos/clasificados"
              className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700"
            >
              Ir a confirmar mi bracket →
            </Link>
          </div>
        )}

        <ul className="mt-6 grid gap-3">
          {sections.map((s) => (
            <li key={s.key}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 hover:border-emerald-300 transition">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{s.title}</h2>
                  <span className="text-xs font-mono text-emerald-700 font-semibold">{s.pts}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-mono">
                    {s.done
                      ? <span className="text-emerald-700 font-semibold">✓ {s.progress}</span>
                      : s.warn
                        ? <span className="text-amber-700 font-bold">{s.progress}</span>
                        : <span className="text-slate-500">{s.progress}</span>}
                  </div>
                  <Link
                    href={s.href}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-bold transition ${
                      s.done
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : s.warn
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    {s.done ? 'Revisar / editar' : s.warn ? '🔒 Confirmar ahora →' : 'Iniciar pronóstico →'}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
