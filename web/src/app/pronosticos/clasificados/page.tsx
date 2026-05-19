import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { loadAllGroups } from '@/lib/data/groups';
import { loadMyMatchPredictions } from '@/lib/data/predictions';
import { deriveUserBracket, type UserGroupMatchPred } from '@/lib/bracket/derive';
import { BracketView } from './BracketView';

export default async function ClasificadosPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const supabase = await getSupabaseServerClient();
  const [
    groups,
    predMatches,
    { data: bracketPicksRows },
    { data: scorerRow },
    { data: profile },
    { data: teamsData },
    { data: matchesData },
  ] = await Promise.all([
    loadAllGroups(),
    loadMyMatchPredictions(),
    supabase.from('predictions_bracket_winners').select('match_id, winner_team_id').eq('user_id', me.id),
    supabase.from('predictions_top_scorer').select('player_name').eq('user_id', me.id).maybeSingle(),
    supabase.from('profiles').select('bracket_locked_at').eq('id', me.id).maybeSingle(),
    supabase.from('teams').select('*'),
    supabase.from('matches').select('id, stage, external_code'),
  ]);

  // Mapeo de match_id → matchNum (73-104) basado en external_code
  function externalCodeToMatchNum(code: string): number | null {
    const m = code.match(/^(R32|R16|QF|SF|TP|FINAL)-(\d{2})$/);
    if (!m) return null;
    const stage = m[1], idx = parseInt(m[2], 10);
    if (stage === 'R32') return 72 + idx;
    if (stage === 'R16') return 88 + idx;
    if (stage === 'QF')  return 96 + idx;
    if (stage === 'SF')  return 100 + idx;
    if (stage === 'TP')  return 103;
    if (stage === 'FINAL') return 104;
    return null;
  }
  const matchIdToNum = new Map<number, number>();
  const matchNumToId = new Map<number, number>();
  for (const row of (matchesData ?? []) as Array<{ id: number; external_code: string }>) {
    const num = externalCodeToMatchNum(row.external_code);
    if (num != null) {
      matchIdToNum.set(row.id, num);
      matchNumToId.set(num, row.id);
    }
  }

  // Picks del usuario: matchNum → team_id
  const userPicks = new Map<number, number>();
  for (const r of (bracketPicksRows ?? []) as Array<{ match_id: number; winner_team_id: number }>) {
    const num = matchIdToNum.get(r.match_id);
    if (num != null) userPicks.set(num, r.winner_team_id);
  }

  // Construir input para derivar bracket
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

  const bracket = deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroup, userPicks);

  const initialScorer = (scorerRow as { player_name?: string } | null)?.player_name ?? '';
  const bracketLockedAt = (profile as { bracket_locked_at?: string | null } | null)?.bracket_locked_at ?? null;

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Bracket de eliminatorias</h1>
            <p className="mt-1 text-sm text-slate-600">
              Predice el ganador de cada enfrentamiento. Total en juego: <strong>520 pts</strong>.
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p>
            <strong>Cómo se arman los cruces:</strong> Con tus marcadores de fase de grupos, el sistema saca los top 2 de cada grupo + 8 mejores 3ros (Pts → DG → GF), y aplica las <strong>495 combinaciones del Anexo C oficial de FIFA</strong> para asignar quién juega contra quién en R32. De ahí, eliges el ganador de cada cruce y los ganadores avanzan automáticamente.
          </p>
        </div>

        <BracketView
          userId={me.id}
          bracket={bracket}
          teams={teamsData ?? []}
          initialScorer={initialScorer}
          bracketLockedAt={bracketLockedAt}
          isAdmin={me.isAdmin}
        />
      </div>
    </main>
  );
}
