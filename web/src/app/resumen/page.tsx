import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
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

/** Hora del partido en Bogotá (ej. "dom 11 jun, 6:00 p. m." o solo "6:00 p. m."). */
function fmtKickoff(iso: string | null | undefined, withDay: boolean): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('es-CO', {
    ...(withDay ? { weekday: 'short', day: 'numeric', month: 'short' } : {}),
    hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

interface PageProps {
  searchParams: Promise<{ etapa?: string; grupo?: string }>;
}

export default async function ResumenPage({ searchParams }: PageProps) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');

  const { etapa = 'group', grupo = 'A' } = await searchParams;
  const isHoy = etapa === 'hoy';
  const stage = isHoy ? 'hoy' : (STAGE_ORDER.includes(etapa) ? etapa : 'group');

  // Rango "hoy" en Bogotá, expresado en instantes UTC para filtrar scheduled_at.
  const bogotaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // 'YYYY-MM-DD'
  const dayStart = new Date(`${bogotaDate}T00:00:00-05:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // service_role: /resumen muestra predicciones de TODOS. Filtramos manualmente
  // por locked_at (grupos/KO) y por bracket_locked_at (bracket).
  const supabase = getSupabaseAdminClient();
  const [{ data: teams }, { data: profiles }] = await Promise.all([
    supabase.from('teams').select('*'),
    supabase.from('profiles').select('id, display_name, bracket_locked_at'),
  ]);

  // Partidos a mostrar: por etapa, o los de HOY (cualquier etapa, por scheduled_at).
  let matchesRaw: MatchRow[];
  if (isHoy) {
    const { data } = await supabase.from('matches').select('*')
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString())
      .order('scheduled_at');
    matchesRaw = (data ?? []) as MatchRow[];
  } else {
    const { data } = await supabase.from('matches').select('*').eq('stage', stage).order('id');
    matchesRaw = (data ?? []) as MatchRow[];
  }

  const filteredMatches = (stage === 'group'
    ? matchesRaw.filter((m) => m.group_letter === grupo)
    : matchesRaw) as MatchRow[];

  // Acotamos las predicciones SOLO a los partidos visibles (evita el tope de 1000 filas).
  const groupMatchIds = filteredMatches.filter((m) => m.stage === 'group').map((m) => m.id);
  const koMatchIds = filteredMatches.filter((m) => m.stage !== 'group').map((m) => m.id);

  type ScoreRow = { user_id: string; match_id: number; home_score: number; away_score: number };
  type WinRow = { user_id: string; match_id: number; winner_team_id: number };
  const [{ data: gp }, { data: kp }, { data: bp }] = await Promise.all([
    groupMatchIds.length
      ? supabase.from('predictions_matches').select('user_id, match_id, home_score, away_score')
          .in('match_id', groupMatchIds).not('locked_at', 'is', null)
      : Promise.resolve({ data: [] as ScoreRow[] }),
    koMatchIds.length
      ? supabase.from('predictions_knockout_matches').select('user_id, match_id, home_score, away_score')
          .in('match_id', koMatchIds).not('locked_at', 'is', null)
      : Promise.resolve({ data: [] as ScoreRow[] }),
    koMatchIds.length
      ? supabase.from('predictions_bracket_winners').select('user_id, match_id, winner_team_id')
          .in('match_id', koMatchIds)
      : Promise.resolve({ data: [] as WinRow[] }),
  ]);

  const bracketLockedUserIds = new Set<string>();
  for (const p of (profiles ?? []) as Array<{ id: string; bracket_locked_at: string | null }>) {
    if (p.bracket_locked_at) bracketLockedUserIds.add(p.id);
  }

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const profileById = new Map<string, { display_name: string }>();
  for (const p of (profiles ?? []) as Array<{ id: string; display_name: string }>) {
    profileById.set(p.id, { display_name: p.display_name });
  }

  // Marcadores predichos por matchId (grupos + KO combinados, para soportar "Hoy").
  const scoresByMatch = new Map<number, Array<{ user_id: string; home: number; away: number }>>();
  for (const r of ([...((gp ?? []) as ScoreRow[]), ...((kp ?? []) as ScoreRow[])])) {
    if (!scoresByMatch.has(r.match_id)) scoresByMatch.set(r.match_id, []);
    scoresByMatch.get(r.match_id)!.push({ user_id: r.user_id, home: r.home_score, away: r.away_score });
  }

  // Picks de ganador (bracket) por matchId — solo usuarios con bracket confirmado.
  const winnerPicksByMatch = new Map<number, Array<{ user_id: string; winner_team_id: number }>>();
  for (const r of (bp ?? []) as WinRow[]) {
    if (!bracketLockedUserIds.has(r.user_id)) continue;
    if (!winnerPicksByMatch.has(r.match_id)) winnerPicksByMatch.set(r.match_id, []);
    winnerPicksByMatch.get(r.match_id)!.push({ user_id: r.user_id, winner_team_id: r.winner_team_id });
  }

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">📋 Resumen de predicciones</h1>
            <p className="mt-1 text-sm text-slate-600">
              Lo que predijo cada participante por partido. Solo se ven las predicciones <strong>ya guardadas</strong>.
            </p>
          </div>
          <Link href="/pronosticos" className="text-sm text-emerald-700 hover:underline">
            ← Volver
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-1 border-b border-slate-200">
          <Link
            href="/resumen?etapa=hoy"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition ${
              isHoy ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-emerald-700 hover:text-emerald-900'
            }`}
          >
            🔴 Hoy
          </Link>
          {STAGE_ORDER.map((s) => (
            <Link
              key={s}
              href={`/resumen?etapa=${s}${s === 'group' ? '&grupo=' + grupo : ''}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                !isHoy && stage === s
                  ? 'border-emerald-700 text-emerald-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {STAGE_LABEL[s]}
            </Link>
          ))}
        </div>

        {stage === 'group' && (
          <div className="mt-3 flex flex-wrap gap-1">
            {'ABCDEFGHIJKL'.split('').map((letter) => (
              <Link
                key={letter}
                href={`/resumen?etapa=group&grupo=${letter}`}
                className={`rounded px-2 py-1 text-xs font-mono font-bold transition ${
                  grupo === letter ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {letter}
              </Link>
            ))}
          </div>
        )}

        {isHoy && (
          <p className="mt-3 text-sm font-medium text-slate-700">
            Partidos de hoy ({new Date(dayStart).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' })}) · hora Colombia
          </p>
        )}

        <div className="mt-4 space-y-4">
          {filteredMatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              {isHoy
                ? 'No hay partidos hoy (o aún no se han cargado las horas de los partidos).'
                : stage === 'group'
                  ? `No hay partidos del Grupo ${grupo}.`
                  : 'Aún no hay partidos de esta ronda con equipos asignados.'}
            </div>
          ) : (
            filteredMatches.map((match) => {
              const home = match.home_team_id ? teamById.get(match.home_team_id) : null;
              const away = match.away_team_id ? teamById.get(match.away_team_id) : null;
              return (
                <MatchPredictionsCard
                  key={match.id}
                  match={match}
                  home={home}
                  away={away}
                  kickoff={fmtKickoff(match.scheduled_at, !isHoy)}
                  scores={scoresByMatch.get(match.id) ?? []}
                  winnerPicks={winnerPicksByMatch.get(match.id) ?? []}
                  profileById={profileById}
                  teamById={teamById}
                  officialFilled={match.home_score != null && match.away_score != null}
                  myUserId={me.id}
                  isKnockout={match.stage !== 'group'}
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
  match, home, away, kickoff, scores, winnerPicks, profileById, teamById, officialFilled, myUserId, isKnockout,
}: {
  match: MatchRow;
  home: Team | null | undefined;
  away: Team | null | undefined;
  kickoff: string | null;
  scores: Array<{ user_id: string; home: number; away: number }>;
  winnerPicks: Array<{ user_id: string; winner_team_id: number }>;
  profileById: Map<string, { display_name: string }>;
  teamById: Map<number, Team>;
  officialFilled: boolean;
  myUserId: string;
  isKnockout: boolean;
}) {
  let officialWinnerId: number | null = null;
  if (officialFilled) {
    if (match.home_score! > match.away_score!) officialWinnerId = match.home_team_id;
    else if (match.away_score! > match.home_score!) officialWinnerId = match.away_team_id;
  }

  const userIds = new Set<string>();
  for (const s of scores) userIds.add(s.user_id);
  for (const w of winnerPicks) userIds.add(w.user_id);
  const scoreByUser = new Map(scores.map((s) => [s.user_id, s]));
  const winnerByUser = new Map(winnerPicks.map((w) => [w.user_id, w.winner_team_id]));
  const hasAnyPick = userIds.size > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold">
          {home ? <>{home.flag_emoji ?? ''} {home.name}</> : <span className="text-slate-400 italic">por definir</span>}
          <span className="mx-2 text-slate-400">vs</span>
          {away ? <>{away.flag_emoji ?? ''} {away.name}</> : <span className="text-slate-400 italic">por definir</span>}
          {kickoff && <span className="ml-2 text-xs font-normal text-slate-500">🕐 {kickoff}</span>}
        </div>
        {officialFilled ? (
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
            Resultado: <span className="font-mono">{match.home_score} - {match.away_score}</span>
          </span>
        ) : (
          <span className="text-xs text-slate-500">pendiente</span>
        )}
      </div>

      {!hasAnyPick ? (
        <div className="px-4 py-3 text-sm text-slate-500">Nadie ha guardado predicción aún.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {Array.from(userIds).map((userId) => {
            const profile = profileById.get(userId);
            const isMe = userId === myUserId;
            const score = scoreByUser.get(userId);
            const winnerId = winnerByUser.get(userId);
            const winnerTeam = winnerId ? teamById.get(winnerId) : null;

            const correctWinner = officialFilled && score && (
              Math.sign(score.home - score.away) === Math.sign(match.home_score! - match.away_score!)
            );
            const exactMatch = officialFilled && score && score.home === match.home_score && score.away === match.away_score;
            const correctBracketPick = officialFilled && officialWinnerId && winnerId === officialWinnerId;

            return (
              <li key={userId} className={`px-4 py-2 text-sm ${isMe ? 'bg-amber-50/50' : ''}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-medium">
                    {profile?.display_name ?? userId.slice(0, 8)}
                    {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
                  </span>
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {isKnockout && winnerTeam && (
                      <span className="flex items-center gap-1">
                        <span className="text-slate-500">Ganador:</span>
                        <span className="font-medium">{winnerTeam.flag_emoji ?? ''} {winnerTeam.name}</span>
                        {officialFilled && officialWinnerId && (
                          correctBracketPick
                            ? <span className="text-emerald-700 font-bold">✓</span>
                            : <span className="text-red-700">✗</span>
                        )}
                      </span>
                    )}
                    {score && (
                      <span className="flex items-center gap-1">
                        <span className="text-slate-500">Marcador:</span>
                        <span className="font-mono font-bold">{score.home} - {score.away}</span>
                        {officialFilled && (
                          exactMatch
                            ? <span className="text-emerald-700 font-bold">✓ exacto · 5 pts</span>
                            : correctWinner
                              ? <span className="text-emerald-700">✓ ganador · 2 pts</span>
                              : <span className="text-red-700">✗</span>
                        )}
                      </span>
                    )}
                    {isKnockout && winnerTeam && !score && (
                      <span className="text-slate-400 italic text-[10px]">(sin marcador predicho)</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
