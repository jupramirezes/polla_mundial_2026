import { getSupabaseServerClient } from '@/lib/supabase/server';
import { TOTAL_MAX_POINTS } from '@/lib/scoring/rules';

export default async function RankingPage() {
  let rows: Array<{
    user_id: string;
    total: number;
    display_name: string | null;
  }> = [];

  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from('user_scores')
      .select('user_id, total, profiles!inner(display_name)')
      .order('total', { ascending: false });
    rows = (data ?? []).map((r) => ({
      user_id: r.user_id as string,
      total: r.total as number,
      // @ts-expect-error supabase joined shape
      display_name: r.profiles?.display_name ?? null,
    }));
  } catch {
    // BD aún no aplicada o sin usuarios
  }

  return (
    <main className="flex-1 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Ranking</h1>
        <p className="mt-1 text-slate-600">
          Total posible: <strong>{TOTAL_MAX_POINTS} pts</strong>
        </p>

        {rows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay puntos registrados. El ranking se irá llenando a medida
            que el admin cargue los resultados oficiales.
          </div>
        ) : (
          <table className="mt-6 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-4 py-2 w-12">#</th>
                <th className="px-4 py-2">Jugador</th>
                <th className="px-4 py-2 text-right w-24">Puntos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2">{r.display_name ?? '(sin nombre)'}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
