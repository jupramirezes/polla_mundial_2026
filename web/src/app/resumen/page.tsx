import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { MatchRow, Team } from '@/lib/types';
import { getTopScorers } from '@/lib/top-scorers';
import { buildOfficialR32, type ResolvedR32Slot } from '@/lib/official-bracket';
import type { MatchScore } from '@/lib/standings';

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
  const isGoleadores = etapa === 'goleadores';
  const isCuadro = etapa === 'cuadro';
  const stage = isHoy ? 'hoy' : isGoleadores ? 'goleadores' : isCuadro ? 'cuadro' : (STAGE_ORDER.includes(etapa) ? etapa : 'group');
  const scorerData = isGoleadores ? await getTopScorers() : null;

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

  // Pestaña "Cuadro": arma el cuadro oficial de 16avos desde los RESULTADOS
  // (1° y 2° por grupo cerrado en vivo + 8 mejores 3ros al cerrar los 12).
  let cuadroView: ReturnType<typeof buildOfficialR32> | null = null;
  if (isCuadro) {
    const { data: allM } = await supabase.from('matches')
      .select('id, stage, group_letter, external_code, home_team_id, away_team_id, home_score, away_score')
      .in('stage', ['group', 'r32']);
    const teamsByGroup = new Map<string, number[]>();
    for (const t of (teams ?? []) as Team[]) {
      if (!t.group_letter) continue;
      if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
      teamsByGroup.get(t.group_letter)!.push(t.id);
    }
    const officialMatchesByGroup = new Map<string, MatchScore[]>();
    const persistedR32 = new Map<number, { home: number | null; away: number | null }>();
    for (const m of (allM ?? []) as MatchRow[]) {
      if (m.stage === 'group' && m.group_letter && m.home_team_id && m.away_team_id) {
        if (!officialMatchesByGroup.has(m.group_letter)) officialMatchesByGroup.set(m.group_letter, []);
        officialMatchesByGroup.get(m.group_letter)!.push({
          homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score, awayScore: m.away_score,
        });
      } else if (m.stage === 'r32' && m.external_code) {
        const mm = m.external_code.match(/^R32-(\d{2})$/);
        if (mm) persistedR32.set(72 + parseInt(mm[1], 10), { home: m.home_team_id, away: m.away_team_id });
      }
    }
    cuadroView = buildOfficialR32(teamsByGroup, officialMatchesByGroup, persistedR32);
  }

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
          <Link
            href="/resumen?etapa=goleadores"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition ${
              isGoleadores ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-emerald-700 hover:text-emerald-900'
            }`}
          >
            ⚽ Goleadores
          </Link>
          <Link
            href="/resumen?etapa=cuadro"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition ${
              isCuadro ? 'border-emerald-700 text-emerald-900' : 'border-transparent text-emerald-700 hover:text-emerald-900'
            }`}
          >
            🔑 Cuadro
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

        {isGoleadores && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-600">⚽ Goleadores del Mundial · se actualiza solo cada ~2 horas (fuente: Wikipedia oficial del torneo).</p>
            {scorerData?.error ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No se pudo cargar la tabla de goleadores ahora mismo. Reintenta en un rato.
              </div>
            ) : (scorerData?.scorers.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                Aún no hay goles registrados en el torneo.
              </div>
            ) : (
              <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                {scorerData!.scorers.map((s) => (
                  <li key={`${s.rank}-${s.name}`} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-6 text-center font-mono text-slate-400">{s.rank}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{s.name}</span>
                      {s.team && <span className="ml-2 text-xs text-slate-500">{s.team}</span>}
                    </span>
                    <span className="font-mono font-bold text-emerald-700">
                      {s.goals}<span className="ml-1 text-xs font-normal text-slate-400">{s.goals === 1 ? 'gol' : 'goles'}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {isCuadro && cuadroView && (
          <div className="mt-4">
            <p className="mb-3 text-sm text-slate-600">
              🔑 Así van quedando los cruces de 16avos. Se llena <strong>solo</strong>: los <strong>1°</strong> y <strong>2°</strong> de cada grupo entran apenas cierra el grupo; los <strong>8 mejores 3°</strong>, al cerrar los 12.
            </p>
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">{cuadroView.finishedGroups.length}/{cuadroView.totalGroups} grupos cerrados</span>
              <span className="rounded bg-slate-100 px-2 py-1 font-semibold text-slate-700">{cuadroView.slotsFilled}/32 cupos definidos</span>
              {!cuadroView.thirdsResolved && (
                <span className="rounded bg-amber-100 px-2 py-1 font-medium text-amber-800">los 3° se ubican al cerrar todos los grupos</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cuadroView.matches.map((m) => (
                <div key={m.matchNum} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{m.code}</div>
                  <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <CuadroSlot slot={m.slotA} teamById={teamById} align="right" />
                    <span className="text-[11px] text-slate-300">vs</span>
                    <CuadroSlot slot={m.slotB} teamById={teamById} align="left" />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Se actualiza solo con los resultados oficiales. Las rondas siguientes (octavos en adelante) se irán
              armando igual cuando empiece la eliminación.
            </p>
          </div>
        )}

        {!isGoleadores && !isCuadro && (
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
        )}
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

// Un lado de una llave de 16avos: equipo resuelto (bandera + nombre + posición de
// origen) o el slot pendiente ("2° Grupo B", "Mejor 3°") en gris.
function CuadroSlot({ slot, teamById, align }: {
  slot: ResolvedR32Slot;
  teamById: Map<number, Team>;
  align: 'left' | 'right';
}) {
  const cls = align === 'right' ? 'text-right' : 'text-left';
  if (slot.teamId) {
    const t = teamById.get(slot.teamId);
    return (
      <span className={`${cls} text-sm`}>
        <span className="font-semibold">{t?.flag_emoji ?? ''} {t?.name ?? '?'}</span>
        <span className="ml-1 text-[10px] font-normal text-slate-400">{slot.label}</span>
      </span>
    );
  }
  return <span className={`${cls} text-xs italic text-slate-400`}>{slot.label}</span>;
}
