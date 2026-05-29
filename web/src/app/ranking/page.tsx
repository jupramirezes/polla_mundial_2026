import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
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

  // Usa service_role para campeón/goleador (atraviesa tablas de todos los usuarios).
  // Sigue respetando la regla "no cuenta hasta guardar" filtrando por bracket_locked_at.
  const admin = getSupabaseAdminClient();

  const [
    { data: scoreRows },
    { data: teams },
    { data: profiles },
    { data: scorers },
    { data: bracketWinners },
    { data: finalMatch },
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
    admin.from('profiles').select('id, bracket_locked_at'),
    admin.from('predictions_top_scorer').select('user_id, player_name'),
    admin.from('predictions_bracket_winners').select('user_id, match_id, winner_team_id'),
    admin.from('matches').select('id').eq('external_code', 'FINAL-01').maybeSingle(),
  ]);

  const lockedUserIds = new Set<string>();
  for (const p of (profiles ?? []) as Array<{ id: string; bracket_locked_at: string | null }>) {
    if (p.bracket_locked_at) lockedUserIds.add(p.id);
  }
  const finalMatchId = (finalMatch as { id?: number } | null)?.id ?? null;

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

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  // Campeón derivado del pick del usuario en la Final (M104) — solo si confirmó bracket.
  const championByUser = new Map<string, number>();
  if (finalMatchId != null) {
    for (const r of (bracketWinners ?? []) as Array<{ user_id: string; match_id: number; winner_team_id: number }>) {
      if (r.match_id !== finalMatchId) continue;
      if (!lockedUserIds.has(r.user_id)) continue;
      championByUser.set(r.user_id, r.winner_team_id);
    }
  }

  // Goleador solo cuenta si el usuario confirmó el bracket.
  const scorerByUser = new Map<string, string>();
  for (const r of (scorers ?? []) as Array<{ user_id: string; player_name: string }>) {
    if (!lockedUserIds.has(r.user_id)) continue;
    scorerByUser.set(r.user_id, r.player_name);
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">Ranking</h1>
          <p className="text-sm text-slate-600">
            Total: <strong className="font-mono">{TOTAL_MAX_POINTS} pts</strong>
          </p>
        </div>

        <RealtimeRefresher />

        {rows.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay puntos registrados. Espera a que el admin cargue resultados.
          </div>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((r, i) => {
              const isMe = me && r.user_id === me.id;
              const championId = championByUser.get(r.user_id);
              const champion = championId ? teamById.get(championId) : null;
              const scorerName = scorerByUser.get(r.user_id);
              const totalHits = r.group_winners_hit + r.knockout_winners_hit;
              const totalExacts = r.group_exact_hit + r.knockout_exact_hit;
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

              return (
                <li
                  key={r.user_id}
                  className={`rounded-lg border p-3 ${
                    isMe
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  {/* Fila principal: posición + nombre + puntos */}
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 w-8 text-center">
                      {medal ?? <span className="font-mono text-slate-500">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">
                        {r.display_name ?? '(sin nombre)'}
                        {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-2xl font-bold font-mono text-emerald-700 leading-none">
                        {r.total}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">pts</div>
                    </div>
                  </div>

                  {/* Stats compactas */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-slate-500 uppercase tracking-wide text-[9px]">Campeón</div>
                      <div className="font-medium truncate">
                        {champion ? `${champion.flag_emoji ?? ''} ${champion.name}` : <span className="text-slate-400">—</span>}
                      </div>
                    </div>
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-slate-500 uppercase tracking-wide text-[9px]">Goleador</div>
                      <div className="font-medium truncate">
                        {scorerName ?? <span className="text-slate-400">—</span>}
                      </div>
                    </div>
                    <div className="rounded bg-slate-50 px-2 py-1">
                      <div className="text-slate-500 uppercase tracking-wide text-[9px]">Aciertos</div>
                      <div className="font-mono font-semibold">
                        {totalHits}G · {totalExacts}E
                      </div>
                    </div>
                  </div>

                  {/* Ver el bracket completo de este participante */}
                  <div className="mt-2 text-right">
                    <Link
                      href={`/brackets/${r.user_id}`}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Ver bracket completo →
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-xs text-slate-500">
          <strong>G</strong> = ganador del partido acertado (2 pts c/u).
          <strong> E</strong> = bonus marcador exacto (3 pts adicionales c/u).
          El ranking se actualiza solo cuando el admin guarda resultados oficiales.
        </p>
      </div>
    </main>
  );
}
