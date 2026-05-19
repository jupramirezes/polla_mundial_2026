import { getSupabaseServerClient } from '@/lib/supabase/server';
import { TOTAL_MAX_POINTS } from '@/lib/scoring/rules';
import { RealtimeRefresher } from './RealtimeRefresher';
import type { Team } from '@/lib/types';

interface ScoreRow {
  user_id: string;
  display_name: string | null;
  total: number;
  group_winners_hit: number;
  group_exact_hit: number;
  knockout_winners_hit: number;
  knockout_exact_hit: number;
}

export default async function RankingPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user: me } } = await supabase.auth.getUser();

  const [
    { data: scoreRows },
    { data: teams },
    { data: topPositions },
    { data: scorers },
    { data: r16Picks },
  ] = await Promise.all([
    supabase
      .from('user_scores')
      .select(`
        user_id, total, group_winners_hit, group_exact_hit,
        knockout_winners_hit, knockout_exact_hit,
        profiles!inner(display_name)
      `)
      .order('total', { ascending: false }),
    supabase.from('teams').select('*'),
    supabase.from('predictions_top_positions').select('user_id, position, team_id'),
    supabase.from('predictions_top_scorer').select('user_id, player_name'),
    supabase.from('predictions_qualifiers').select('user_id, round, team_id').eq('round', 'r16'),
  ]);

  const rows: ScoreRow[] = (scoreRows ?? []).map((r) => ({
    user_id: r.user_id as string,
    total:   r.total as number,
    group_winners_hit:    (r.group_winners_hit as number) ?? 0,
    group_exact_hit:      (r.group_exact_hit as number) ?? 0,
    knockout_winners_hit: (r.knockout_winners_hit as number) ?? 0,
    knockout_exact_hit:   (r.knockout_exact_hit as number) ?? 0,
    // @ts-expect-error supabase join shape
    display_name: r.profiles?.display_name ?? null,
  }));

  // Mapas auxiliares para "campeón proyectado" y "goleador proyectado"
  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const championByUser = new Map<string, number>();   // user_id → team_id (pos 1)
  for (const r of (topPositions ?? []) as Array<{ user_id: string; position: number; team_id: number }>) {
    if (r.position === 1) championByUser.set(r.user_id, r.team_id);
  }

  const scorerByUser = new Map<string, string>();
  for (const r of (scorers ?? []) as Array<{ user_id: string; player_name: string }>) {
    scorerByUser.set(r.user_id, r.player_name);
  }

  const r16CountByUser = new Map<string, number>();
  for (const r of (r16Picks ?? []) as Array<{ user_id: string }>) {
    r16CountByUser.set(r.user_id, (r16CountByUser.get(r.user_id) ?? 0) + 1);
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Ranking</h1>
          <p className="text-sm text-slate-600">
            Total posible: <strong className="font-mono">{TOTAL_MAX_POINTS} pts</strong>
          </p>
        </div>

        <RealtimeRefresher />

        {rows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay puntos registrados. Espera a que el admin cargue resultados.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2 text-right w-16">Pts</th>
                  <th className="px-3 py-2 hidden md:table-cell">Campeón proyectado</th>
                  <th className="px-3 py-2 hidden md:table-cell">Goleador proyectado</th>
                  <th className="px-3 py-2 text-right hidden sm:table-cell">Aciertos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isMe = me && r.user_id === me.id;
                  const championId = championByUser.get(r.user_id);
                  const champion = championId ? teamById.get(championId) : null;
                  const scorerName = scorerByUser.get(r.user_id);
                  const totalHits = r.group_winners_hit + r.knockout_winners_hit;
                  const totalExacts = r.group_exact_hit + r.knockout_exact_hit;
                  return (
                    <tr
                      key={r.user_id}
                      className={`border-t border-slate-100 ${isMe ? 'bg-amber-50' : ''}`}
                    >
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {r.display_name ?? '(sin nombre)'}
                          {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-xs">tú</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-base text-emerald-700">{r.total}</td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs">
                        {champion ? (
                          <span>{champion.flag_emoji ?? ''} {champion.name}</span>
                        ) : (
                          <span className="text-slate-400 italic">sin pick</span>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs">
                        {scorerName ? (
                          <span className="truncate">{scorerName}</span>
                        ) : (
                          <span className="text-slate-400 italic">sin pick</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right hidden sm:table-cell text-xs font-mono text-slate-600">
                        {totalHits}G · {totalExacts}E
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              <strong>G</strong> = ganador del partido acertado (2 pts c/u). <strong>E</strong> = bonus marcador exacto (3 pts adicionales c/u).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
