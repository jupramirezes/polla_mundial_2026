import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { Team, MatchRow } from '@/lib/types';
import { UnlockBracketButton } from './UnlockBracketButton';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STAGE_LABEL: Record<string, string> = {
  group: 'Grupos', r32: 'R32', r16: 'Octavos', qf: 'Cuartos',
  sf: 'Semis', tp: 'Tercer puesto', final: 'Final',
};

export default async function AdminUserPage({ params }: PageProps) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const { id: userId } = await params;
  const supabase = await getSupabaseServerClient();

  const [
    { data: profile },
    { data: teams },
    { data: matches },
    { data: predMatches },
    { data: predKO },
    { data: predQual },
    { data: predTop },
    { data: predScorer },
    { data: scoreRow },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('teams').select('*'),
    supabase.from('matches').select('*').order('id'),
    supabase.from('predictions_matches').select('match_id, home_score, away_score, locked_at').eq('user_id', userId),
    supabase.from('predictions_knockout_matches').select('match_id, home_score, away_score, locked_at').eq('user_id', userId),
    supabase.from('predictions_qualifiers').select('round, team_id').eq('user_id', userId),
    supabase.from('predictions_top_positions').select('position, team_id').eq('user_id', userId),
    supabase.from('predictions_top_scorer').select('player_name').eq('user_id', userId).maybeSingle(),
    supabase.from('user_scores').select('total').eq('user_id', userId).maybeSingle(),
  ]);

  if (!profile) notFound();

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const matchById = new Map<number, MatchRow>();
  for (const m of (matches ?? []) as MatchRow[]) matchById.set(m.id, m);

  const matchPredsMap = new Map<number, { home: number; away: number; locked_at: string | null }>();
  for (const r of (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number; locked_at: string | null }>) {
    matchPredsMap.set(r.match_id, { home: r.home_score, away: r.away_score, locked_at: r.locked_at });
  }
  const koPredsMap = new Map<number, { home: number; away: number; locked_at: string | null }>();
  for (const r of (predKO ?? []) as Array<{ match_id: number; home_score: number; away_score: number; locked_at: string | null }>) {
    koPredsMap.set(r.match_id, { home: r.home_score, away: r.away_score, locked_at: r.locked_at });
  }

  const qualByRound = new Map<string, Set<number>>();
  for (const r of (predQual ?? []) as Array<{ round: string; team_id: number }>) {
    if (!qualByRound.has(r.round)) qualByRound.set(r.round, new Set());
    qualByRound.get(r.round)!.add(r.team_id);
  }

  const topByPosition = new Map<number, number>();
  for (const r of (predTop ?? []) as Array<{ position: number; team_id: number }>) {
    topByPosition.set(r.position, r.team_id);
  }

  const profileData = profile as {
    display_name: string; email: string; phone: string | null;
    is_admin: boolean; bracket_locked_at: string | null; input_mode: string;
  };
  const totalPoints = (scoreRow as { total?: number } | null)?.total ?? 0;

  // Agrupar marcadores de grupos por grupo letter
  const groupMatches = Array.from(matchById.values()).filter((m) => m.stage === 'group');
  const groupsLetters = Array.from(new Set(groupMatches.map((m) => m.group_letter).filter(Boolean))).sort();

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{profileData.display_name}</h1>
            <p className="mt-1 text-sm text-slate-600">{profileData.email} {profileData.phone && <>· {profileData.phone}</>}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="font-mono">Puntos: <strong className="text-emerald-700">{totalPoints}</strong></span>
              {profileData.is_admin && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">admin</span>}
              {profileData.bracket_locked_at && (
                <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
                  🔒 bracket confirmado
                </span>
              )}
            </div>
          </div>
          <Link href="/admin/usuarios" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        {profileData.bracket_locked_at && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
            <div className="text-sm text-amber-900">
              El usuario confirmó su bracket el{' '}
              {new Date(profileData.bracket_locked_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.
              Si necesita editar, puedes desbloquearlo.
            </div>
            <UnlockBracketButton userId={userId} />
          </div>
        )}

        <section className="mt-6">
          <h2 className="text-lg font-bold">Marcadores de grupos</h2>
          <p className="text-xs text-slate-500 mb-2">
            {Array.from(matchPredsMap.values()).filter((p) => p.locked_at).length} / {groupMatches.length} guardados
          </p>
          <div className="space-y-3">
            {groupsLetters.map((letter) => {
              const ms = groupMatches.filter((m) => m.group_letter === letter);
              return (
                <div key={letter} className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold text-emerald-900 mb-2">Grupo {letter}</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {ms.map((m) => {
                        const home = m.home_team_id ? teamById.get(m.home_team_id) : null;
                        const away = m.away_team_id ? teamById.get(m.away_team_id) : null;
                        const p = matchPredsMap.get(m.id);
                        return (
                          <tr key={m.id} className="border-t border-slate-100 first:border-0">
                            <td className="py-1 text-right pr-2">{home?.flag_emoji ?? ''} {home?.name}</td>
                            <td className="py-1 px-1 text-center font-mono w-16">
                              {p
                                ? <span className={p.locked_at ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                                    {p.home} - {p.away}
                                  </span>
                                : <span className="text-slate-300">— — —</span>}
                            </td>
                            <td className="py-1 pl-2">{away?.flag_emoji ?? ''} {away?.name}</td>
                            <td className="py-1 pl-2 text-[10px] text-slate-500">
                              {p?.locked_at && '🔒'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">Bracket de eliminatorias</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['r16', 'qf', 'sf', 'final'] as const).map((round) => {
              const ids = qualByRound.get(round) ?? new Set<number>();
              const labels: Record<string, string> = { r16: 'Octavos', qf: 'Cuartos', sf: 'Semis', final: 'Final' };
              return (
                <div key={round} className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold mb-2">{labels[round]} ({ids.size})</h3>
                  <ul className="text-xs space-y-1">
                    {Array.from(ids).map((id) => {
                      const t = teamById.get(id);
                      return <li key={id}>{t?.flag_emoji ?? ''} {t?.name}</li>;
                    })}
                    {ids.size === 0 && <li className="text-slate-400 italic">vacío</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">Top 4 + Goleador</h2>
          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <table className="w-full text-sm">
              <tbody>
                {[1, 2, 3, 4].map((pos) => {
                  const id = topByPosition.get(pos);
                  const t = id ? teamById.get(id) : null;
                  const labels = ['Campeón', 'Subcampeón', 'Tercero', 'Cuarto'];
                  return (
                    <tr key={pos} className="border-t border-slate-100 first:border-0">
                      <td className="py-1 pr-3 font-semibold w-32">{labels[pos - 1]}</td>
                      <td className="py-1">{t ? `${t.flag_emoji ?? ''} ${t.name}` : <span className="text-slate-400 italic">sin pick</span>}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-semibold">Goleador</td>
                  <td className="py-1">
                    {(predScorer as { player_name?: string } | null)?.player_name ?? <span className="text-slate-400 italic">sin pick</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">Marcadores en eliminatorias</h2>
          <p className="text-xs text-slate-500 mb-2">
            {Array.from(koPredsMap.values()).filter((p) => p.locked_at).length} guardados
          </p>
          {koPredsMap.size === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              El usuario no ha hecho predicciones de eliminatorias todavía.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <table className="w-full text-sm">
                <tbody>
                  {Array.from(koPredsMap.entries()).map(([matchId, p]) => {
                    const m = matchById.get(matchId);
                    const home = m?.home_team_id ? teamById.get(m.home_team_id) : null;
                    const away = m?.away_team_id ? teamById.get(m.away_team_id) : null;
                    return (
                      <tr key={matchId} className="border-t border-slate-100 first:border-0">
                        <td className="py-1 text-right pr-2 text-xs">{home?.flag_emoji ?? ''} {home?.name}</td>
                        <td className="py-1 px-1 text-center font-mono w-16">
                          <span className={p.locked_at ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                            {p.home} - {p.away}
                          </span>
                        </td>
                        <td className="py-1 pl-2 text-xs">{away?.flag_emoji ?? ''} {away?.name}</td>
                        <td className="py-1 pl-2 text-[10px] text-slate-500">
                          {STAGE_LABEL[m?.stage ?? '']} {p.locked_at && '🔒'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
