import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import type { Team, MatchRow } from '@/lib/types';
import { buildUserBracketView, isValidPick } from '@/lib/bracket/view';
import type { ResolvedSlot } from '@/lib/bracket/derive';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Mostramos las rondas de eliminación directa. R32 (dieciseisavos) se deriva
// automáticamente de los grupos, así que va al final y en tono más tenue.
const STAGE_ORDER = ['r16', 'qf', 'sf', 'final', 'tp', 'r32'] as const;
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
    { data: predBracketWinners },
    { data: predScorer },
    { data: scores },
  ] = await Promise.all([
    admin.from('profiles').select('id, display_name, bracket_locked_at'),
    admin.from('teams').select('*'),
    admin.from('matches').select('*').order('id'),
    admin.from('predictions_matches').select('match_id, home_score, away_score').eq('user_id', userId),
    admin.from('predictions_bracket_winners').select('match_id, winner_team_id').eq('user_id', userId),
    admin.from('predictions_top_scorer').select('player_name').eq('user_id', userId).maybeSingle(),
    admin.from('user_scores').select('user_id, total'),
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

  return (
    <main className="flex-1 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Bracket de</p>
            <h1 className="text-2xl font-bold">
              {targetName}
              {isMe && <span className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">tú</span>}
            </h1>
            <p className="mt-1 text-xs font-mono text-slate-500">{totalByUser.get(userId) ?? 0} pts</p>
          </div>
          <Link href="/brackets" className="shrink-0 text-sm text-emerald-700 hover:underline">
            ← Todos los brackets
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

        {!locked ? (
          <div className="mt-6 rounded-xl border border-slate-300 bg-slate-50 p-6 text-center">
            <div className="text-3xl">🔒</div>
            <p className="mt-2 font-semibold text-slate-700">
              {isMe ? 'Todavía no confirmaste tu bracket.' : `${targetName} todavía no confirmó su bracket.`}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Los picks de eliminatorias solo se hacen públicos cuando el participante pulsa
              <strong> “Confirmar mi bracket”</strong>. Mientras tanto se mantienen privados.
            </p>
            {isMe && (
              <Link
                href="/pronosticos/clasificados"
                className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
              >
                Ir a completar mi bracket →
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
        Bracket de solo lectura. El equipo <span className="font-semibold text-emerald-700">resaltado</span> es
        quien este participante eligió que avanza. Los dieciseisavos se derivan automáticamente de sus marcadores de grupos.
      </p>
    </>
  );
}
