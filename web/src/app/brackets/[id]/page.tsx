import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import type { Team, MatchRow } from '@/lib/types';
import { buildUserBracketView, isValidPick } from '@/lib/bracket/view';
import type { ResolvedSlot } from '@/lib/bracket/derive';
import { computeGroupStandings } from '@/lib/standings';
import { scoreMatch, scoreGroupStandings } from '@/lib/scoring/calculate';
import { POINTS } from '@/lib/scoring/rules';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Orden cronológico de las rondas. R32 (dieciseisavos) se deriva
// automáticamente de los grupos; va primero, en tono más tenue.
const STAGE_ORDER = ['r32', 'r16', 'qf', 'sf', 'final', 'tp'] as const;
const STAGE_LABEL: Record<string, string> = {
  r32: 'Dieciseisavos', r16: 'Octavos', qf: 'Cuartos',
  sf: 'Semifinales', tp: 'Tercer puesto', final: 'Final',
};

export default async function PublicBracketPage({ params }: PageProps) {
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  // Cualquier usuario autenticado puede mirar. Verificamos que haya sesión.
  const ssr = await getSupabaseServerClient();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) redirect('/login');

  const { id: userId } = await params;
  // service_role: leemos predicciones de OTROS usuarios (RLS las protege del
  // cliente normal). Igual que /ranking y /resumen, respetando la regla
  // "no cuenta / no se ve hasta confirmar" filtrando por bracket_locked_at.
  const admin = getSupabaseAdminClient();

  const [
    { data: profiles },
    { data: teams },
    { data: matches },
    { data: predMatches },
    { data: predKO },
    { data: predBracketWinners },
    { data: predScorer },
    { data: scores },
    { data: myScore },
  ] = await Promise.all([
    admin.from('profiles').select('id, display_name, bracket_locked_at'),
    admin.from('teams').select('*'),
    admin.from('matches').select('*').order('id'),
    admin.from('predictions_matches').select('match_id, home_score, away_score').eq('user_id', userId),
    admin.from('predictions_knockout_matches').select('match_id, home_score, away_score').eq('user_id', userId),
    admin.from('predictions_bracket_winners').select('match_id, winner_team_id').eq('user_id', userId),
    admin.from('predictions_top_scorer').select('player_name').eq('user_id', userId).maybeSingle(),
    admin.from('user_scores').select('user_id, total'),
    admin.from('user_scores').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  type ProfileRow = { id: string; display_name: string | null; bracket_locked_at: string | null };
  const allProfiles = (profiles ?? []) as ProfileRow[];
  const target = allProfiles.find((p) => p.id === userId);
  if (!target) notFound();

  const teamById = new Map<number, Team>();
  for (const t of (teams ?? []) as Team[]) teamById.set(t.id, t);

  const totalByUser = new Map<string, number>();
  for (const s of (scores ?? []) as Array<{ user_id: string; total: number }>) {
    totalByUser.set(s.user_id, s.total ?? 0);
  }

  const locked = !!target.bracket_locked_at;
  const isMe = userId === user.id;

  // Selector de participantes: ordenado por puntos desc; confirmados primero.
  const participants = allProfiles
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

  const targetName = target.display_name ?? '(sin nombre)';

  // Desglose de puntos del usuario (para que cada quien verifique cómo va sumando).
  const sc = (myScore ?? {}) as Record<string, number | null>;
  const n = (k: string) => Number(sc[k] ?? 0);
  const pts = {
    total: n('total'),
    grupos: n('group_match_winner') + n('group_match_exact') + n('group_standings'),
    gruposWHit: n('group_winners_hit'),
    gruposEHit: n('group_exact_hit'),
    clasificados: n('qual_r32') + n('qual_r16') + n('qual_qf') + n('qual_sf') + n('qual_final'),
    ko: n('knockout_match_winner') + n('knockout_match_exact'),
    koWHit: n('knockout_winners_hit'),
    koEHit: n('knockout_exact_hit'),
    top4: n('top_position_1') + n('top_position_2') + n('top_position_3') + n('top_position_4'),
    goleador: n('top_scorer'),
  };

  // helper de render de un lado del cruce
  const renderSide = (slot: ResolvedSlot, isPick: boolean) => {
    if (slot.kind === 'resolved') {
      const t = teamById.get(slot.teamId);
      return (
        <span className={isPick ? 'font-bold text-emerald-700' : 'text-slate-500'}>
          {t?.flag_emoji ?? ''} {t?.name ?? `#${slot.teamId}`}
        </span>
      );
    }
    return <span className="text-slate-400 italic">por definir</span>;
  };

  const teamLabel = (id: number | null) => {
    if (!id) return null;
    const t = teamById.get(id);
    return t ? `${t.flag_emoji ?? ''} ${t.name}` : `#${id}`;
  };

  // Resumen de la fase de grupos: orden final 1º→4º de cada grupo según sus marcadores.
  const teamsByGroup = new Map<string, number[]>();
  for (const t of (teams ?? []) as Team[]) {
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }
  const matchById = new Map<number, MatchRow>();
  for (const m of (matches ?? []) as MatchRow[]) matchById.set(m.id, m);
  const predByGroup = new Map<string, { homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null }[]>();
  for (const r of (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number }>) {
    const m = matchById.get(r.match_id);
    if (!m || m.stage !== 'group' || !m.group_letter || !m.home_team_id || !m.away_team_id) continue;
    if (!predByGroup.has(m.group_letter)) predByGroup.set(m.group_letter, []);
    predByGroup.get(m.group_letter)!.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: r.home_score, awayScore: r.away_score });
  }
  // Posiciones OFICIALES por grupo: se infieren de los resultados oficiales, igual
  // que el recálculo real (solo cuando los 6 partidos del grupo ya se jugaron).
  const officialByGroup = new Map<string, { homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null }[]>();
  for (const m of (matches ?? []) as MatchRow[]) {
    if (m.stage !== 'group' || !m.group_letter || !m.home_team_id || !m.away_team_id) continue;
    if (!officialByGroup.has(m.group_letter)) officialByGroup.set(m.group_letter, []);
    officialByGroup.get(m.group_letter)!.push({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score, awayScore: m.away_score });
  }

  // Tarjetas por grupo (visibles para todos): orden predicho 1º→4º con su valor en
  // puntos (4·3·2·1), marca de quién pasa a 16avos (2 primeros directo, 3º puede
  // colarse) y, si el grupo ya terminó, los puntos de posición ya ganados.
  const groupCards = Array.from(teamsByGroup.keys()).sort().map((letter) => {
    const teamIds = teamsByGroup.get(letter)!;
    const pred = predByGroup.get(letter) ?? [];
    const predStanding = computeGroupStandings(teamIds, pred).slice(0, 4);
    const off = officialByGroup.get(letter) ?? [];
    const offDone = off.length >= 6 && off.every((m) => m.homeScore != null && m.awayScore != null);
    const offStanding = offDone ? computeGroupStandings(teamIds, off).slice(0, 4) : null;
    const posPts = offStanding
      ? scoreGroupStandings(
          predStanding.map((s) => ({ position: s.position as 1 | 2 | 3 | 4, teamId: s.teamId })),
          offStanding.map((s) => ({ position: s.position as 1 | 2 | 3 | 4, teamId: s.teamId })),
        )
      : 0;
    return {
      letter,
      filled: pred.length,
      offDone,
      posPts,
      rows: predStanding.map((s, i) => ({
        teamId: s.teamId,
        pos: i + 1,
        posPts: POINTS.groupStandings[i],
        advances: i < 2,
        third: i === 2,
        hit: offDone && offStanding ? offStanding[i]?.teamId === s.teamId : false,
      })),
    };
  });

  // Detalle por partido: resultado oficial (ya jugado) vs el pronóstico de este
  // usuario + los puntos que le dio. Transparencia total para alejar suspicacias.
  const groupPredMap = new Map<number, { home: number; away: number }>();
  for (const r of (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number }>) {
    groupPredMap.set(r.match_id, { home: r.home_score, away: r.away_score });
  }
  const koPredMap = new Map<number, { home: number; away: number }>();
  for (const r of (predKO ?? []) as Array<{ match_id: number; home_score: number; away_score: number }>) {
    koPredMap.set(r.match_id, { home: r.home_score, away: r.away_score });
  }
  const playedDetail = ((matches ?? []) as MatchRow[])
    .filter((m) => m.home_score != null && m.away_score != null && m.home_team_id && m.away_team_id)
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? '') || a.id - b.id)
    .map((m) => {
      const pred = (m.stage === 'group' ? groupPredMap : koPredMap).get(m.id) ?? null;
      const points = pred
        ? scoreMatch({ homeScore: pred.home, awayScore: pred.away }, { homeScore: m.home_score!, awayScore: m.away_score! }).total
        : 0;
      return {
        id: m.id,
        home: teamById.get(m.home_team_id!),
        away: teamById.get(m.away_team_id!),
        resHome: m.home_score!,
        resAway: m.away_score!,
        pred,
        points,
      };
    });

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Cruces de</p>
            <h1 className="text-2xl font-bold">
              {targetName}
              {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
            </h1>
            <p className="mt-1 text-xs font-mono text-slate-500">{totalByUser.get(userId) ?? 0} pts</p>
          </div>
          <Link href="/brackets" className="shrink-0 text-sm text-emerald-700 hover:underline">
            ← Todos los cruces
          </Link>
        </div>

        {/* Selector rápido de participantes */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {participants.map((p) => (
            <Link
              key={p.id}
              href={`/brackets/${p.id}`}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                p.id === userId
                  ? 'bg-emerald-700 text-white'
                  : p.locked
                    ? 'bg-white border border-slate-200 text-slate-700 hover:border-emerald-300'
                    : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
              }`}
              title={p.locked ? `${p.name} · ${p.total} pts` : `${p.name} · sin confirmar`}
            >
              {!p.locked && '🔒 '}{p.name}
            </Link>
          ))}
        </div>

        {/* Desglose de puntos — para verificar cómo va sumando cada quien */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Puntos hasta ahora</h2>
            <span className="font-mono text-2xl font-extrabold text-emerald-700">{pts.total}</span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            <li className="flex items-center justify-between py-1.5">
              <span>⚽ Fase de grupos <span className="text-xs text-slate-400">({pts.gruposWHit} ganadores · {pts.gruposEHit} exactos)</span></span>
              <span className="font-mono font-semibold">{pts.grupos}</span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>🎯 Clasificados a rondas</span>
              <span className="font-mono font-semibold">{pts.clasificados}</span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>🔴 Eliminatorias en vivo <span className="text-xs text-slate-400">({pts.koWHit} ganadores · {pts.koEHit} exactos)</span></span>
              <span className="font-mono font-semibold">{pts.ko}</span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>🏆 Top 4 (campeón/sub/3°/4°)</span>
              <span className="font-mono font-semibold">{pts.top4}</span>
            </li>
            <li className="flex items-center justify-between py-1.5">
              <span>⚽ Goleador del mundial</span>
              <span className="font-mono font-semibold">{pts.goleador}</span>
            </li>
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Cada categoría suma aparte. Abajo está el detalle partido por partido.
          </p>
        </div>

        {playedDetail.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">
              Detalle por partido <span className="text-xs font-normal text-slate-400">(lo que ya jugó y te sumó)</span>
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 text-left font-medium">Partido</th>
                    <th className="py-1 text-center font-medium">Oficial</th>
                    <th className="py-1 text-center font-medium">Tu pick</th>
                    <th className="py-1 text-right font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {playedDetail.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {d.home?.flag_emoji ?? ''} {d.home?.name ?? '?'} <span className="text-slate-300">vs</span> {d.away?.flag_emoji ?? ''} {d.away?.name ?? '?'}
                      </td>
                      <td className="py-1 px-2 text-center font-mono font-semibold whitespace-nowrap">{d.resHome}-{d.resAway}</td>
                      <td className="py-1 px-2 text-center font-mono text-slate-500 whitespace-nowrap">{d.pred ? `${d.pred.home}-${d.pred.away}` : '—'}</td>
                      <td className="py-1 pl-2 text-right whitespace-nowrap">
                        {d.points === 5
                          ? <span className="font-bold text-emerald-700">+5 ✓exacto</span>
                          : d.points === 2
                            ? <span className="text-emerald-700">+2 ✓ganador</span>
                            : <span className="text-slate-300">0</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Marcador exacto = 5 pts · solo ganador = 2 pts. (Las posiciones de grupo y los clasificados suman aparte — mira la sección de abajo.)
            </p>
          </div>
        )}

        {/* Posiciones de grupo y clasificación a 16avos. Visible para TODOS (estos
            puntos cuentan con o sin bracket confirmado). Hace visible el mecanismo:
            de dónde salen los puntos de posición y de clasificados, y cuándo suman. */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Posiciones de grupo y clasificación a 16avos</h2>
          <div className="mt-2 rounded-md bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-600">
            <p><strong className="text-slate-800">Posición exacta</strong> en el grupo: 1°=4 · 2°=3 · 3°=2 · 4°=1 pt. Se cuentan <strong>cuando el grupo termina</strong> (sus 6 partidos jugados).</p>
            <p className="mt-1"><strong className="text-slate-800">Clasificar a 16avos</strong>: pasan los <strong>2 primeros</strong> de cada grupo + los <strong>8 mejores terceros</strong> (regla FIFA — sale solo de los resultados oficiales, no a mano). Cada equipo tuyo que clasifique de verdad = <strong className="text-emerald-700">+2 pts</strong>.</p>
            <p className="mt-1">Si avanzan más rondas, cada equipo suma más: octavos <strong>+3</strong> · cuartos <strong>+6</strong> · semis <strong>+12</strong> · final <strong>+22</strong>.</p>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {groupCards.map((g) => (
              <div key={g.letter} className="rounded-lg border border-slate-200 overflow-hidden text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
                  <span className="font-semibold text-slate-600">Grupo {g.letter}</span>
                  {g.offDone
                    ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">✓ definido · +{g.posPts}</span>
                    : <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">en juego</span>}
                </div>
                {g.filled < 6 ? (
                  <div className="px-2.5 py-3 text-center text-[11px] text-slate-400">Sin pronóstico completo del grupo</div>
                ) : (
                  <ol>
                    {g.rows.map((r) => (
                      <li
                        key={r.teamId}
                        className={`flex items-center gap-1.5 border-l-2 px-2.5 py-1 ${
                          r.advances ? 'border-emerald-400 bg-emerald-50/40'
                          : r.third ? 'border-amber-300 bg-amber-50/30'
                          : 'border-transparent'
                        }`}
                      >
                        <span className="w-4 tabular-nums text-slate-400">{r.pos}°</span>
                        <span className={`flex-1 truncate ${r.advances ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                          {teamLabel(r.teamId)}
                        </span>
                        {g.offDone
                          ? (r.hit
                              ? <span className="font-bold text-emerald-700">✓ +{r.posPts}</span>
                              : <span className="text-slate-300">—</span>)
                          : <span className="tabular-nums text-[10px] text-slate-400">vale {r.posPts}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-300 align-middle"></span>
            pasa directo (2 primeros)
            <span className="ml-2 mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-300 align-middle"></span>
            3º (puede colarse entre los 8 mejores). Orden por Pts → diferencia de gol → goles a favor.
          </p>
        </div>

        {!locked ? (
          <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-6 text-center">
            <div className="text-3xl">🔒</div>
            <p className="mt-2 font-semibold text-slate-700">
              {isMe ? 'Todavía no confirmaste tus cruces.' : `${targetName} todavía no confirmó sus cruces.`}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Los picks de eliminatorias solo se hacen públicos cuando el participante pulsa
              <strong> “Confirmar mis cruces”</strong>. Mientras tanto se mantienen privados.
            </p>
            {isMe && (
              <Link
                href="/pronosticos/clasificados"
                className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
              >
                Ir a completar mis cruces →
              </Link>
            )}
          </div>
        ) : (
          <PublicBracketBody
            view={buildUserBracketView({
              teams: (teams ?? []) as Team[],
              matches: (matches ?? []) as MatchRow[],
              predMatches: (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number }>,
              predBracketWinners: (predBracketWinners ?? []) as Array<{ match_id: number; winner_team_id: number }>,
            })}
            scorerName={(predScorer as { player_name?: string } | null)?.player_name ?? null}
            renderSide={renderSide}
            teamLabel={teamLabel}
          />
        )}
      </div>
    </main>
  );
}

// Cuerpo del bracket confirmado: titulares (campeón/sub/3°/4°/goleador) + rondas.
function PublicBracketBody({
  view, scorerName, renderSide, teamLabel,
}: {
  view: ReturnType<typeof buildUserBracketView>;
  scorerName: string | null;
  renderSide: (slot: ResolvedSlot, isPick: boolean) => React.ReactNode;
  teamLabel: (id: number | null) => string | null;
}) {
  const { stageMap, championId, subId, thirdId, fourthId } = view;

  const headline = [
    { label: '🏆 Campeón', value: teamLabel(championId), cls: 'border-amber-300 bg-amber-50' },
    { label: '🥈 Subcampeón', value: teamLabel(subId), cls: 'border-slate-300 bg-slate-50' },
    { label: '🥉 Tercero', value: teamLabel(thirdId), cls: 'border-orange-200 bg-orange-50' },
    { label: '4° puesto', value: teamLabel(fourthId), cls: 'border-slate-200 bg-white' },
    { label: '⚽ Goleador', value: scorerName, cls: 'border-emerald-200 bg-emerald-50' },
  ];

  return (
    <>
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {headline.map((h) => (
          <div key={h.label} className={`rounded-lg border p-3 ${h.cls}`}>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{h.label}</div>
            <div className="mt-0.5 font-bold truncate">
              {h.value ?? <span className="font-normal text-slate-400">—</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {STAGE_ORDER.map((stage) => {
          const cruces = stageMap.get(stage) ?? [];
          if (cruces.length === 0) return null;
          const muted = stage === 'r32';
          return (
            <div
              key={stage}
              className={`rounded-lg border p-3 ${muted ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white'}`}
            >
              <h3 className="text-sm font-semibold mb-2">
                {STAGE_LABEL[stage]}
                {muted && <span className="ml-2 text-[11px] font-normal text-slate-400">(automático según sus grupos)</span>}
              </h3>
              <table className="w-full text-xs sm:text-sm">
                <tbody>
                  {cruces.map((c) => {
                    const winnerId = c.userPickedWinnerTeamId;
                    const aPick = c.teamA.kind === 'resolved' && c.teamA.teamId === winnerId;
                    const bPick = c.teamB.kind === 'resolved' && c.teamB.teamId === winnerId;
                    const valid = isValidPick(c);
                    return (
                      <tr key={c.matchNum} className="border-t border-slate-100 first:border-0">
                        <td className="py-1 pr-2 text-right whitespace-nowrap">{renderSide(c.teamA, aPick)}</td>
                        <td className="py-1 px-1 text-center text-slate-300">vs</td>
                        <td className="py-1 pl-2 whitespace-nowrap">{renderSide(c.teamB, bPick)}</td>
                        <td className="py-1 pl-3 text-right whitespace-nowrap">
                          {muted
                            ? null
                            : valid
                              ? <span className="text-emerald-700 font-semibold text-xs">✓ pasa</span>
                              : <span className="text-slate-300 text-xs">—</span>}
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

      <p className="mt-4 text-xs text-slate-400">
        Cruces de solo lectura. El equipo <span className="font-semibold text-emerald-700">resaltado</span> es
        quien este participante eligió que avanza. Los dieciseisavos se derivan automáticamente de sus marcadores de grupos.
      </p>
    </>
  );
}
