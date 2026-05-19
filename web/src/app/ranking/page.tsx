import { getSupabaseServerClient } from '@/lib/supabase/server';
import { TOTAL_MAX_POINTS } from '@/lib/scoring/rules';
import { RealtimeRefresher } from './RealtimeRefresher';

interface Row {
  user_id: string;
  total: number;
  display_name: string | null;
  group_matches_total: number;
  group_winners_hit: number;
  group_exact_hit: number;
  knockout_matches_scored: number;
  knockout_winners_hit: number;
  knockout_exact_hit: number;
}

export default async function RankingPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user: me } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from('user_scores')
    .select(`
      user_id, total,
      group_matches_total, group_winners_hit, group_exact_hit,
      knockout_matches_scored, knockout_winners_hit, knockout_exact_hit,
      profiles!inner(display_name)
    `)
    .order('total', { ascending: false });

  const rows: Row[] = (data ?? []).map((r) => ({
    user_id: r.user_id as string,
    total: r.total as number,
    group_matches_total:    (r.group_matches_total as number) ?? 0,
    group_winners_hit:      (r.group_winners_hit as number) ?? 0,
    group_exact_hit:        (r.group_exact_hit as number) ?? 0,
    knockout_matches_scored:(r.knockout_matches_scored as number) ?? 0,
    knockout_winners_hit:   (r.knockout_winners_hit as number) ?? 0,
    knockout_exact_hit:     (r.knockout_exact_hit as number) ?? 0,
    // @ts-expect-error supabase joined shape
    display_name: r.profiles?.display_name ?? null,
  }));

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Ranking</h1>
          <p className="text-sm text-slate-600">
            Total posible: <strong className="font-mono">{TOTAL_MAX_POINTS} pts</strong>
          </p>
        </div>

        <RealtimeRefresher />

        {rows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay puntos registrados. El ranking se llenará cuando el admin cargue
            resultados.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2 text-right w-20">Puntos</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">Aciertos grupos</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">Aciertos KO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isMe = me && r.user_id === me.id;
                  return (
                    <tr
                      key={r.user_id}
                      className={`border-t border-slate-100 ${isMe ? 'bg-amber-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {r.display_name ?? '(sin nombre)'}
                        {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs">tú</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-lg">{r.total}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600 hidden sm:table-cell">
                        {r.group_winners_hit}G + {r.group_exact_hit}E
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600 hidden sm:table-cell">
                        {r.knockout_winners_hit}G + {r.knockout_exact_hit}E
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              <strong>G</strong> = ganador del partido acertado (2 pts). <strong>E</strong> = marcador exacto adicional (3 pts).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
