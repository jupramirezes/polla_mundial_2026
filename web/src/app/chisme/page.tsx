import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { MatchRow, Team } from '@/lib/types';

const STAGE_LABEL: Record<string, string> = {
  group: 'Fase de grupos',
  r32: 'Dieciseisavos',
  r16: 'Octavos',
  qf:  'Cuartos',
  sf:  'Semifinales',
  tp:  'Tercer puesto',
  final: 'Final',
};
const STAGE_ORDER = ['group', 'r32', 'r16', 'qf', 'sf', 'tp', 'final'];

interface PageProps {
  searchParams: Promise<{ etapa?: string; grupo?: string }>;
}

export default async function ChismePage({ searchParams }: PageProps) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const { etapa = 'group', grupo = 'A' } = await searchParams;
  const stage = STAGE_ORDER.includes(etapa) ? etapa : 'group';

  const supabase = await getSupabaseServerClient();
  const [
    { data: teams },
    { data: matches },
    { data: profiles },
    { data: groupPreds },
    { data: koPreds },
  ] = await Promise.all([
    supabase.from('teams').select('*'),
    supabase.from('matches').select('*').eq('stage', stage).order('id'),
    supabase.from('profiles').select('id, display_name'),
    stage === 'group'
      ? supabase.from('predictions_matches').select('user_id, match_id, home_score, away_score, locked_at').not('locked_at', 'is', null)
      : { data: [] },
    stage !== 'group'
      ? supabase.from('predictions_knockout_matches').select('user_id, match_id, home_score, away_score, locked_at').not('locked_at', 'is', null)
      : { data: [] },
  ]);

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const profileById = new Map<string, { display_name: string }>();
  for (const p of (profiles ?? []) as Array<{ id: string; display_name: string }>) {
    profileById.set(p.id, { display_name: p.display_name });
  }

  // Predicciones por matchId
  const predsByMatch = new Map<number, Array<{ user_id: string; home: number; away: number }>>();
  const rows = stage === 'group' ? (groupPreds ?? []) : (koPreds ?? []);
  for (const r of rows as Array<{ user_id: string; match_id: number; home_score: number; away_score: number }>) {
    if (!predsByMatch.has(r.match_id)) predsByMatch.set(r.match_id, []);
    predsByMatch.get(r.match_id)!.push({ user_id: r.user_id, home: r.home_score, away: r.away_score });
  }

  // Filtrar partidos del grupo si es fase de grupos
  const filteredMatches = stage === 'group'
    ? (matches ?? []).filter((m) => (m as MatchRow).group_letter === grupo)
    : (matches ?? []);

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">📰 Chisme</h1>
            <p className="mt-1 text-sm text-slate-600">
              Las predicciones de todos los participantes, partido por partido. Solo se ven las predicciones <strong>ya guardadas</strong>.
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        {/* Tabs etapas */}
        <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
          {STAGE_ORDER.map((s) => (
            <Link
              key={s}
              href={`/chisme?etapa=${s}${s === 'group' ? '&grupo=' + grupo : ''}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                stage === s
                  ? 'border-emerald-700 text-emerald-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {STAGE_LABEL[s]}
            </Link>
          ))}
        </div>

        {/* Si es grupos, sub-tabs por letra */}
        {stage === 'group' && (
          <div className="mt-3 flex flex-wrap gap-1">
            {'ABCDEFGHIJKL'.split('').map((letter) => (
              <Link
                key={letter}
                href={`/chisme?etapa=group&grupo=${letter}`}
                className={`rounded px-2 py-1 text-xs font-mono font-bold transition ${
                  grupo === letter
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {letter}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-4">
          {filteredMatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {stage === 'group'
                ? `No hay partidos del Grupo ${grupo}.`
                : 'Aún no hay partidos de esta ronda con equipos asignados.'}
            </div>
          ) : (
            filteredMatches.map((m) => {
              const match = m as MatchRow;
              const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
              const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
              const preds = predsByMatch.get(match.id) ?? [];
              const officialFilled = match.home_score != null && match.away_score != null;
              return (
                <MatchPredictionsCard
                  key={match.id}
                  match={match}
                  home={home}
                  away={away}
                  predictions={preds}
                  profileById={profileById}
                  officialFilled={officialFilled}
                  myUserId={me.id}
                />
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

function MatchPredictionsCard({
  match, home, away, predictions, profileById, officialFilled, myUserId,
}: {
  match: MatchRow;
  home: Team | null | undefined;
  away: Team | null | undefined;
  predictions: Array<{ user_id: string; home: number; away: number }>;
  profileById: Map<string, { display_name: string }>;
  officialFilled: boolean;
  myUserId: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="font-semibold">
          {home ? <>{home.flag_emoji ?? ''} {home.name}</> : <span className="text-slate-400 italic">por definir</span>}
          <span className="mx-2 text-slate-400">vs</span>
          {away ? <>{away.flag_emoji ?? ''} {away.name}</> : <span className="text-slate-400 italic">por definir</span>}
        </div>
        {officialFilled ? (
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
            Resultado: <span className="font-mono">{match.home_score} - {match.away_score}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-500">pendiente</span>
        )}
      </div>

      {predictions.length === 0 ? (
        <div className="px-4 py-3 text-sm text-slate-500">
          Nadie ha guardado predicción aún.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {predictions.map((p) => {
            const profile = profileById.get(p.user_id);
            const isMe = p.user_id === myUserId;
            const correctWinner = officialFilled && (
              (Math.sign(p.home - p.away) === Math.sign(match.home_score! - match.away_score!))
            );
            const exactMatch = officialFilled && p.home === match.home_score && p.away === match.away_score;
            return (
              <li
                key={p.user_id}
                className={`flex items-center justify-between px-4 py-2 text-sm ${
                  isMe ? 'bg-amber-50/50' : ''
                }`}
              >
                <span className="font-medium">
                  {profile?.display_name ?? p.user_id.slice(0, 8)}
                  {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
                </span>
                <span className="font-mono font-bold flex items-center gap-2">
                  {p.home} - {p.away}
                  {officialFilled && (
                    exactMatch
                      ? <span className="text-xs text-emerald-700">✓ exacto (+5)</span>
                      : correctWinner
                        ? <span className="text-xs text-emerald-700">✓ ganador (+2)</span>
                        : <span className="text-xs text-red-700">✗</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
