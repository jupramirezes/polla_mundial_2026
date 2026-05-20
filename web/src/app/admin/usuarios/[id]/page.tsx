import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Team, MatchRow } from '@/lib/types';
import { UnlockBracketButton } from './UnlockBracketButton';
import { ScoresSection, ScorerEditor } from './UserPredictionsEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STAGE_LABEL: Record<string, string> = {
  r32: 'Dieciseisavos', r16: 'Octavos', qf: 'Cuartos',
  sf: 'Semifinales', tp: 'Tercer puesto', final: 'Final',
};

export default async function AdminUserPage({ params }: PageProps) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (!me.isAdmin) redirect('/admin');

  const { id: userId } = await params;
  // Service role: necesitamos leer y editar predicciones de OTRO usuario; RLS las protege.
  const supabase = getSupabaseAdminClient();

  const [
    { data: profile },
    { data: teams },
    { data: matches },
    { data: predMatches },
    { data: predKO },
    { data: predBracketWinners },
    { data: predScorer },
    { data: scoreRow },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('teams').select('*'),
    supabase.from('matches').select('*').order('id'),
    supabase.from('predictions_matches').select('match_id, home_score, away_score, locked_at').eq('user_id', userId),
    supabase.from('predictions_knockout_matches').select('match_id, home_score, away_score, locked_at').eq('user_id', userId),
    supabase.from('predictions_bracket_winners').select('match_id, winner_team_id').eq('user_id', userId),
    supabase.from('predictions_top_scorer').select('player_name').eq('user_id', userId).maybeSingle(),
    supabase.from('user_scores').select('total').eq('user_id', userId).maybeSingle(),
  ]);

  if (!profile) notFound();

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const matchById = new Map<number, MatchRow>();
  for (const m of (matches ?? []) as MatchRow[]) matchById.set(m.id, m);

  // Marcadores de grupos
  const matchPredsMap = new Map<number, { home: number; away: number; locked_at: string | null }>();
  for (const r of (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number; locked_at: string | null }>) {
    matchPredsMap.set(r.match_id, { home: r.home_score, away: r.away_score, locked_at: r.locked_at });
  }
  // Marcadores KO
  const koPredsMap = new Map<number, { home: number; away: number; locked_at: string | null }>();
  for (const r of (predKO ?? []) as Array<{ match_id: number; home_score: number; away_score: number; locked_at: string | null }>) {
    koPredsMap.set(r.match_id, { home: r.home_score, away: r.away_score, locked_at: r.locked_at });
  }

  // Picks del bracket por matchId → ganador predicho
  const bracketByMatchId = new Map<number, number>();
  for (const r of (predBracketWinners ?? []) as Array<{ match_id: number; winner_team_id: number }>) {
    bracketByMatchId.set(r.match_id, r.winner_team_id);
  }

  // Para cada ronda, listar los equipos que el usuario hizo pasar (= ganadores
  // de los partidos de esa ronda). external_code define la ronda.
  // R32 (M73-M88) → 16 picks → Dieciseisavos (los ganadores pasan a R16/Octavos)
  // R16 (M89-M96) → 8 picks → Octavos (los ganadores pasan a QF)
  // QF (M97-M100) → 4 picks → Cuartos (los ganadores pasan a SF)
  // SF (M101-M102) → 2 picks → Semis (los ganadores pasan a Final)
  // TP (M103) → 1 pick → ganador 3°
  // FINAL (M104) → 1 pick → campeón
  const winnersByStage: Record<'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final', number[]> = {
    r32: [], r16: [], qf: [], sf: [], tp: [], final: [],
  };
  for (const m of matchById.values()) {
    const stage = m.stage as keyof typeof winnersByStage | undefined;
    if (!stage || !(stage in winnersByStage)) continue;
    const winner = bracketByMatchId.get(m.id);
    if (winner) winnersByStage[stage].push(winner);
  }

  // Top 4 derivado:
  //  Campeón = ganador de FINAL (M104)
  //  Sub = perdedor de FINAL (el otro equipo del cruce)
  //  3° = ganador de TP (M103)
  //  4° = perdedor de TP
  let championId: number | null = null;
  let subId: number | null = null;
  let thirdId: number | null = null;
  let fourthId: number | null = null;
  {
    const finalMatch = Array.from(matchById.values()).find((m) => m.stage === 'final');
    if (finalMatch) {
      const winner = bracketByMatchId.get(finalMatch.id) ?? null;
      championId = winner;
      if (winner) {
        if (finalMatch.home_team_id && finalMatch.home_team_id !== winner) subId = finalMatch.home_team_id;
        else if (finalMatch.away_team_id && finalMatch.away_team_id !== winner) subId = finalMatch.away_team_id;
      }
    }
    const tpMatch = Array.from(matchById.values()).find((m) => m.stage === 'tp');
    if (tpMatch) {
      const winner = bracketByMatchId.get(tpMatch.id) ?? null;
      thirdId = winner;
      if (winner) {
        if (tpMatch.home_team_id && tpMatch.home_team_id !== winner) fourthId = tpMatch.home_team_id;
        else if (tpMatch.away_team_id && tpMatch.away_team_id !== winner) fourthId = tpMatch.away_team_id;
      }
    }
  }

  const profileData = profile as {
    display_name: string; email: string; phone: string | null;
    is_admin: boolean; bracket_locked_at: string | null; input_mode: string;
  };
  const totalPoints = (scoreRow as { total?: number } | null)?.total ?? 0;
  const scorerName = (predScorer as { player_name?: string } | null)?.player_name ?? '';

  // Listas de partidos por sección
  const groupMatches = Array.from(matchById.values()).filter((m) => m.stage === 'group');
  const koMatches = Array.from(matchById.values())
    .filter((m) => m.stage !== 'group')
    .sort((a, b) => {
      const order = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];
      return order.indexOf(a.stage) - order.indexOf(b.stage);
    });

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{profileData.display_name}</h1>
            <p className="mt-1 text-sm text-slate-600">{profileData.email} {profileData.phone && <>· {profileData.phone}</>}</p>
            <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
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

        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
          <strong>Modo admin:</strong> puedes editar cualquier marcador de este usuario.
          Los cambios cuentan inmediatamente para el ranking (locked).
        </div>

        {profileData.bracket_locked_at && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
            <div className="text-sm text-amber-900">
              El usuario confirmó su bracket el{' '}
              {new Date(profileData.bracket_locked_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}.
              Si necesita editar bracket, desbloquéalo.
            </div>
            <UnlockBracketButton userId={userId} />
          </div>
        )}

        <ScoresSection
          userId={userId}
          title="Marcadores de grupos"
          matches={groupMatches}
          preds={matchPredsMap}
          teamById={teamById}
          kind="group"
          groupBy="group_letter"
        />

        <section className="mt-8">
          <h2 className="text-lg font-bold">Bracket de eliminatorias</h2>
          <p className="text-xs text-slate-500 mb-2">
            Equipos que el usuario hizo pasar a cada ronda (derivado de sus picks de ganador).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(['r32', 'r16', 'qf', 'sf', 'final'] as const).map((round) => {
              const ids = winnersByStage[round];
              return (
                <div key={round} className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold mb-2">
                    {STAGE_LABEL[round]} <span className="text-slate-400">({ids.length})</span>
                  </h3>
                  <ul className="text-xs space-y-1">
                    {ids.map((id) => {
                      const t = teamById.get(id);
                      return <li key={id}>{t?.flag_emoji ?? ''} {t?.name}</li>;
                    })}
                    {ids.length === 0 && <li className="text-slate-400 italic">vacío</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold">Top 4 + Goleador</h2>
          <p className="text-xs text-slate-500 mb-2">
            Top 4 se deriva del bracket (campeón = ganador de la Final, etc.). El goleador es editable.
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { label: 'Campeón', id: championId },
                  { label: 'Subcampeón', id: subId },
                  { label: 'Tercero', id: thirdId },
                  { label: 'Cuarto', id: fourthId },
                ].map(({ label, id }) => {
                  const t = id ? teamById.get(id) : null;
                  return (
                    <tr key={label} className="border-t border-slate-100 first:border-0">
                      <td className="py-1 pr-3 font-semibold w-32">{label}</td>
                      <td className="py-1">{t ? `${t.flag_emoji ?? ''} ${t.name}` : <span className="text-slate-400 italic">sin pick</span>}</td>
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-semibold align-middle">Goleador</td>
                  <td className="py-1">
                    <ScorerEditor userId={userId} initialName={scorerName} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <ScoresSection
          userId={userId}
          title="Marcadores en eliminatorias"
          matches={koMatches}
          preds={koPredsMap}
          teamById={teamById}
          kind="ko"
          groupBy="stage"
          emptyText="No hay partidos de eliminatoria asignados todavía."
        />
      </div>
    </main>
  );
}
