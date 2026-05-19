import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllTeams, loadMyQualifiers } from '@/lib/data/qualifiers';
import { loadAllGroups } from '@/lib/data/groups';
import { loadMyMatchPredictions, loadMyGroupStandings } from '@/lib/data/predictions';
import {
  derivePredictedR32,
  type UserGroupMatchPred,
  type UserStandingPred,
} from '@/lib/predicted-r32';
import { QualifiersCascadeForm } from './QualifiersCascadeForm';

export default async function ClasificadosPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [teams, myQualifiers, groups, predMatches, predStandings] = await Promise.all([
    loadAllTeams(),
    loadMyQualifiers(),
    loadAllGroups(),
    loadMyMatchPredictions(),
    loadMyGroupStandings(),
  ]);

  // Construir input para derivePredictedR32
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

  const standingPreds: UserStandingPred[] = [];
  for (const [letter, posMap] of predStandings) {
    for (const [position, teamId] of posMap) {
      standingPreds.push({ groupLetter: letter, position: position as 1|2|3|4, teamId });
    }
  }

  const derivedR32 = derivePredictedR32(groupLetters, teamsByGroup, matchPredsByGroup, standingPreds);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Clasificados a cada ronda</h1>
            <p className="mt-1 text-sm text-slate-600">252 pts en juego · sin orden</p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>Cómo funciona:</strong> Tu lista de R32 se llena <strong>automáticamente</strong> a
          partir de tus picks en <Link href="/pronosticos/grupos" className="underline">Fase de grupos</Link> (top 2 de cada
          grupo + 8 mejores 3ros calculados de tus marcadores). De ahí, eliges
          16 a octavos, luego 8 a cuartos, 4 a semis y 2 a la final.
        </div>

        <div className="mt-6">
          <QualifiersCascadeForm
            allTeams={teams}
            derivedR32={Array.from(derivedR32.teams)}
            derivedR32Warnings={derivedR32.warnings}
            byGroupDebug={derivedR32.byGroup}
            initial={{
              r16:   Array.from(myQualifiers.r16),
              qf:    Array.from(myQualifiers.qf),
              sf:    Array.from(myQualifiers.sf),
              final: Array.from(myQualifiers.final),
            }}
          />
        </div>
      </div>
    </main>
  );
}
