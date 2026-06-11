import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { Team, MatchRow } from '@/lib/types';
import {
  deriveUserBracket, crucesByStage,
  type UserGroupMatchPred, type ResolvedSlot, type DerivedCruce,
} from '@/lib/bracket/derive';
import { UnlockBracketButton } from './UnlockBracketButton';
import { LockBracketButton } from './LockBracketButton';
import { ScoresSection, ScorerEditor } from './UserPredictionsEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STAGE_LABEL: Record<string, string> = {
  r32: 'Dieciseisavos', r16: 'Octavos', qf: 'Cuartos',
  sf: 'Semifinales', tp: 'Tercer puesto', final: 'Final',
};

// external_code (R32-01 … FINAL-01) → matchNum lógico 73-104
function matchNumFromExternalCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const mm = code.match(/^(R32|R16|QF|SF|TP|FINAL)-(\d{2})$/);
  if (!mm) return null;
  const stage = mm[1], idx = parseInt(mm[2], 10);
  if (stage === 'R32') return 72 + idx;
  if (stage === 'R16') return 88 + idx;
  if (stage === 'QF')  return 96 + idx;
  if (stage === 'SF')  return 100 + idx;
  if (stage === 'TP')  return 103;
  if (stage === 'FINAL') return 104;
  return null;
}

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

  // ============================================================
  // Bracket del usuario — derivado igual que el motor de scoring
  // (deriveUserBracket), para que el admin vea EXACTAMENTE los cruces
  // que el usuario pickeó, ronda por ronda, no sólo "quién pasa".
  // ============================================================

  // teams por grupo + lista de grupos
  const teamsByGroup = new Map<string, number[]>();
  for (const t of (teams ?? []) as Team[]) {
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }
  const groupLetters = Array.from(teamsByGroup.keys()).sort();

  // picks del usuario: matchNum (73-104) → team_id ganador
  const picks = new Map<number, number>();
  for (const r of (predBracketWinners ?? []) as Array<{ match_id: number; winner_team_id: number }>) {
    const m = matchById.get(r.match_id);
    const num = matchNumFromExternalCode(m?.external_code);
    if (num != null) picks.set(num, r.winner_team_id);
  }

  // marcadores de grupo del usuario indexados por grupo (input para deriveUserBracket)
  const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
  for (const [matchId, pred] of matchPredsMap) {
    const m = matchById.get(matchId);
    if (!m || m.stage !== 'group' || !m.group_letter || !m.home_team_id || !m.away_team_id) continue;
    if (!matchPredsByGroup.has(m.group_letter)) matchPredsByGroup.set(m.group_letter, []);
    matchPredsByGroup.get(m.group_letter)!.push({
      matchId, groupLetter: m.group_letter,
      homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
      homeScore: pred.home, awayScore: pred.away,
    });
  }

  const userBracket = deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroup, picks);
  const crucesStageMap = crucesByStage(userBracket.cruces);
  const cruceByNum = new Map(userBracket.cruces.map((c) => [c.matchNum, c]));

  // Un pick SOLO es válido si su cruce está resuelto desde los grupos guardados
  // y el ganador elegido es uno de los dos equipos del cruce. Esto ignora picks
  // "huérfanos" (sin grupos) para que no se muestren como reales.
  function isValidPick(c: DerivedCruce | undefined): boolean {
    if (!c) return false;
    const a = c.teamA.kind === 'resolved' ? c.teamA.teamId : null;
    const b = c.teamB.kind === 'resolved' ? c.teamB.teamId : null;
    if (a == null || b == null) return false;
    return c.userPickedWinnerTeamId === a || c.userPickedWinnerTeamId === b;
  }
  const validPicksCount = userBracket.cruces.filter(isValidPick).length;

  // Top 4 derivado del bracket REAL del usuario:
  //  Campeón   = ganador de la Final (M104)
  //  Subcampeón= el OTRO equipo de la Final (perdedor)
  //  3°        = ganador del Tercer Puesto (M103)
  //  4°        = el OTRO equipo del Tercer Puesto (perdedor)
  function otherTeamInCruce(matchNum: number, winnerId: number | null): number | null {
    if (!winnerId) return null;
    const c = cruceByNum.get(matchNum);
    if (!c) return null;
    const a = c.teamA.kind === 'resolved' ? c.teamA.teamId : null;
    const b = c.teamB.kind === 'resolved' ? c.teamB.teamId : null;
    return a === winnerId ? b : a;
  }
  const finalCruce = cruceByNum.get(104);
  const tpCruce = cruceByNum.get(103);
  const championId = isValidPick(finalCruce) ? finalCruce!.userPickedWinnerTeamId : null;
  const subId = otherTeamInCruce(104, championId);
  const thirdId = isValidPick(tpCruce) ? tpCruce!.userPickedWinnerTeamId : null;
  const fourthId = otherTeamInCruce(103, thirdId);

  const profileData = profile as {
    display_name: string; email: string; phone: string | null;
    is_admin: boolean; bracket_locked_at: string | null; input_mode: string;
  };
  const totalPoints = (scoreRow as { total?: number } | null)?.total ?? 0;
  const scorerName = (predScorer as { player_name?: string } | null)?.player_name ?? '';
  const bracketLocked = !!profileData.bracket_locked_at;

  // Listas de partidos por sección
  const groupMatches = Array.from(matchById.values()).filter((m) => m.stage === 'group');
  const koMatches = Array.from(matchById.values())
    .filter((m) => m.stage !== 'group')
    .sort((a, b) => {
      const order = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];
      return order.indexOf(a.stage) - order.indexOf(b.stage);
    });

  // helper render de un lado del cruce
  const renderSide = (slot: ResolvedSlot, isPick: boolean) => {
    if (slot.kind === 'resolved') {
      const t = teamById.get(slot.teamId);
      return (
        <span className={isPick ? 'font-bold text-emerald-700' : 'text-slate-700'}>
          {t?.flag_emoji ?? ''} {t?.name ?? `#${slot.teamId}`}
        </span>
      );
    }
    return <span className="text-slate-400 italic">por definir</span>;
  };

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
              {bracketLocked
                ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">🔒 cruces confirmados</span>
                : <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">⚠️ cruces sin confirmar</span>}
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

        {!bracketLocked && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>⚠️ Este usuario aún NO confirmó sus cruces.</strong> Por la regla
            <em> &ldquo;no cuenta hasta guardar&rdquo;</em>, sus picks de eliminatorias (campeón,
            subcampeón, 3°, 4°) y su goleador <strong>todavía no suman puntos ni aparecen en el
            ranking</strong> hasta que se confirme. Sus marcadores de grupos sí cuentan a medida
            que los guarda. (Picks de cruces válidos: {validPicksCount}/32.)
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <LockBracketButton userId={userId} />
              <span className="text-[11px] text-amber-700">
                Solo funciona si ya llenó todo (72 grupos + 32 picks + goleador). Úsalo para confirmar en su nombre.
              </span>
            </div>
          </div>
        )}

        {bracketLocked && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
            <div className="text-sm text-amber-900">
              El usuario confirmó sus cruces el{' '}
              {new Date(profileData.bracket_locked_at!).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}.
              Si necesita editar sus cruces, desbloquéalo.
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
          <h2 className="text-lg font-bold">Cruces de eliminatorias del usuario</h2>
          <p className="text-xs text-slate-500 mb-2">
            Cada cruce que el usuario pickeó, ronda por ronda. El equipo <span className="font-bold text-emerald-700">resaltado</span> es
            su ganador elegido. Los cruces se derivan de sus marcadores de grupos + sus picks de ganador.
          </p>
          {userBracket.warnings.length > 0 && (
            <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              {userBracket.warnings.map((w, i) => <div key={i}>· {w}</div>)}
            </div>
          )}
          <div className="space-y-3">
            {(['r32', 'r16', 'qf', 'sf', 'tp', 'final'] as const).map((stage) => {
              const cruces = crucesStageMap.get(stage) ?? [];
              if (cruces.length === 0) return null;
              const picked = cruces.filter(isValidPick).length;
              return (
                <div key={stage} className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-semibold mb-2">
                    {STAGE_LABEL[stage]} <span className="text-slate-400">({picked}/{cruces.length} pickeados)</span>
                  </h3>
                  <table className="w-full text-xs sm:text-sm">
                    <tbody>
                      {cruces.map((c) => {
                        const winnerId = c.userPickedWinnerTeamId;
                        const aPick = c.teamA.kind === 'resolved' && c.teamA.teamId === winnerId;
                        const bPick = c.teamB.kind === 'resolved' && c.teamB.teamId === winnerId;
                        const bothResolved = c.teamA.kind === 'resolved' && c.teamB.kind === 'resolved';
                        const validPick = isValidPick(c);
                        return (
                          <tr key={c.matchNum} className="border-t border-slate-100 first:border-0">
                            <td className="py-1 pr-2 text-right whitespace-nowrap">{renderSide(c.teamA, aPick)}</td>
                            <td className="py-1 px-1 text-center text-slate-400">vs</td>
                            <td className="py-1 pl-2 whitespace-nowrap">{renderSide(c.teamB, bPick)}</td>
                            <td className="py-1 pl-3 text-right whitespace-nowrap">
                              {bothResolved
                                ? (validPick
                                    ? <span className="text-emerald-700 font-semibold">✓ pasa</span>
                                    : <span className="text-slate-400">sin pick</span>)
                                : <span className="text-slate-400">—</span>}
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
          <h2 className="text-lg font-bold">Top 4 + Goleador</h2>
          <p className="text-xs text-slate-500 mb-2">
            Top 4 derivado de los cruces del usuario: campeón = ganador de su Final, subcampeón = el
            otro finalista, 3° = ganador del Tercer Puesto, 4° = el otro. El goleador es editable.
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
