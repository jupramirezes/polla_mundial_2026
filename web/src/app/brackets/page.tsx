import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import type { Team } from '@/lib/types';

export default async function BracketsIndexPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  const ssr = await getSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect('/login');

  const admin = getSupabaseAdminClient();
  const [
    { data: profiles },
    { data: scores },
    { data: teams },
    { data: bracketWinners },
    { data: scorers },
    { data: finalMatch },
  ] = await Promise.all([
    admin.from('profiles').select('id, display_name, bracket_locked_at'),
    admin.from('user_scores').select('user_id, total'),
    admin.from('teams').select('*'),
    admin.from('predictions_bracket_winners').select('user_id, match_id, winner_team_id'),
    admin.from('predictions_top_scorer').select('user_id, player_name'),
    admin.from('matches').select('id').eq('external_code', 'FINAL-01').maybeSingle(),
  ]);

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const lockedAt = new Map<string, string | null>();
  for (const p of (profiles ?? []) as Array<{ id: string; bracket_locked_at: string | null }>) {
    lockedAt.set(p.id, p.bracket_locked_at);
  }
  const totalByUser = new Map<string, number>();
  for (const s of (scores ?? []) as Array<{ user_id: string; total: number }>) {
    totalByUser.set(s.user_id, s.total ?? 0);
  }

  const finalMatchId = (finalMatch as { id?: number } | null)?.id ?? null;
  const championByUser = new Map<string, number>();
  if (finalMatchId != null) {
    for (const r of (bracketWinners ?? []) as Array<{ user_id: string; match_id: number; winner_team_id: number }>) {
      if (r.match_id !== finalMatchId) continue;
      if (!lockedAt.get(r.user_id)) continue; // solo brackets confirmados
      championByUser.set(r.user_id, r.winner_team_id);
    }
  }
  const scorerByUser = new Map<string, string>();
  for (const r of (scorers ?? []) as Array<{ user_id: string; player_name: string }>) {
    if (!lockedAt.get(r.user_id)) continue;
    scorerByUser.set(r.user_id, r.player_name);
  }

  const participants = ((profiles ?? []) as Array<{ id: string; display_name: string | null; bracket_locked_at: string | null }>)
    .map((p) => ({
      id: p.id,
      name: p.display_name ?? '(sin nombre)',
      locked: !!p.bracket_locked_at,
      total: totalByUser.get(p.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1;
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

  const confirmedCount = participants.filter((p) => p.locked).length;

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold">Brackets de los participantes</h1>
        <p className="mt-1 text-sm text-slate-600">
          Mira el camino completo que predijo cada quien: octavos, cuartos, semis, final, campeón y goleador.
          Solo se muestran los brackets <strong>confirmados</strong> ({confirmedCount} de {participants.length}).
        </p>

        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {participants.map((p) => {
            const champ = championByUser.get(p.id);
            const champTeam = champ ? teamById.get(champ) : null;
            const scorer = scorerByUser.get(p.id);
            const isMe = p.id === user.id;
            return (
              <li key={p.id}>
                <Link
                  href={`/brackets/${p.id}`}
                  className={`block rounded-lg border p-3 transition hover:border-emerald-300 hover:shadow-sm ${
                    isMe ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold truncate">
                      {p.name}
                      {isMe && <span className="ml-1.5 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-emerald-700 font-semibold">{p.total} pts</span>
                  </div>
                  {p.locked ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-slate-50 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-slate-500">🏆 Campeón</div>
                        <div className="font-medium truncate">
                          {champTeam ? `${champTeam.flag_emoji ?? ''} ${champTeam.name}` : <span className="text-slate-400">—</span>}
                        </div>
                      </div>
                      <div className="rounded bg-slate-50 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-slate-500">⚽ Goleador</div>
                        <div className="font-medium truncate">{scorer ?? <span className="text-slate-400">—</span>}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400">🔒 Aún no confirma su bracket</div>
                  )}
                  <div className="mt-2 text-xs font-semibold text-emerald-700">Ver bracket completo →</div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
