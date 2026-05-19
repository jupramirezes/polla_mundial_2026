import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllTeams, loadMyQualifiers } from '@/lib/data/qualifiers';
import { loadAllGroups } from '@/lib/data/groups';
import { loadMyMatchPredictions } from '@/lib/data/predictions';
import {
  derivePredictedR32,
  type UserGroupMatchPred,
} from '@/lib/predicted-r32';
import { BracketForm } from './BracketForm';

export default async function ClasificadosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const supabase = await getSupabaseServerClient();
  const [
    teams,
    myQualifiers,
    groups,
    predMatches,
    { data: topPositionsRows },
    { data: scorerRow },
  ] = await Promise.all([
    loadAllTeams(),
    loadMyQualifiers(),
    loadAllGroups(),
    loadMyMatchPredictions(),
    supabase.from('predictions_top_positions').select('position, team_id').eq('user_id', me.id),
    supabase.from('predictions_top_scorer').select('player_name').eq('user_id', me.id).maybeSingle(),
  ]);

  const initialTop: Record<number, number> = {};
  for (const r of (topPositionsRows ?? []) as Array<{ position: number; team_id: number }>) {
    initialTop[r.position] = r.team_id;
  }
  const initialScorer = (scorerRow as { player_name?: string } | null)?.player_name ?? '';

  const groupLetters = groups.map((g) => g.letter);
  const teamsByGroup = new Map<string, number[]>();
  for (const g of groups) teamsByGroup.set(g.letter, g.teams.map((t) => t.id));

  const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
  for (const g of groups) {
    const list: UserGroupMatchPred[] = [];
    for (const m of g.matches) {
      if (!m.home_team_id || !m.away_team_id) continue;
      const p = predMatches.get(m.id);
      if (!p) continue;
      list.push({
        matchId: m.id,
        groupLetter: g.letter,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: p.home_score,
        awayScore: p.away_score,
      });
    }
    matchPredsByGroup.set(g.letter, list);
  }

  const derivedR32 = derivePredictedR32(groupLetters, teamsByGroup, matchPredsByGroup);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bracket de eliminatorias</h1>
            <p className="mt-1 text-sm text-slate-600">
              Clasificados (252 pts) + Top 4 final + Goleador (268 pts) = <strong>520 pts</strong>
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>Cómo funciona:</strong> Tu lista de <strong>R32</strong> se llena <strong>automáticamente</strong> con
          los top 2 + 8 mejores 3ros (regla FIFA: Pts → DG → GF) que salen
          de tus marcadores en <Link href="/pronosticos/grupos" className="underline font-semibold">Fase de grupos</Link>.
          De ahí eliges los 16 a octavos, 8 a cuartos, 4 a semis, 2 a la final, después asignas el campeón/sub/3°/4°
          y el goleador, y al final <strong>guardas todo de una</strong>.
        </div>

        <div className="mt-6">
          <BracketForm
            userId={me.id}
            allTeams={teams}
            derivedR32={Array.from(derivedR32.teams)}
            derivedR32Warnings={derivedR32.warnings}
            byGroup={derivedR32.byGroup.map((g) => ({
              groupLetter: g.groupLetter,
              complete: g.complete,
              first:  g.standings[0]?.teamId ?? null,
              second: g.standings[1]?.teamId ?? null,
              third:  g.standings[2]?.teamId ?? null,
              thirdPasses: g.thirdPasses === true,
              thirdPts: g.standings[2]?.pts ?? 0,
              thirdDg:  g.standings[2]?.dg ?? 0,
              thirdGf:  g.standings[2]?.gf ?? 0,
            }))}
            initial={{
              r16:   Array.from(myQualifiers.r16),
              qf:    Array.from(myQualifiers.qf),
              sf:    Array.from(myQualifiers.sf),
              final: Array.from(myQualifiers.final),
              top:   initialTop,
              scorer: initialScorer,
            }}
          />
        </div>
      </div>
    </main>
  );
}
