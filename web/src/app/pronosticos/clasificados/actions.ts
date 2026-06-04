'use server';

import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { deriveUserBracket, type UserGroupMatchPred } from '@/lib/bracket/derive';

const winnerSchema = z.object({
  matchNum: z.number().int().min(73).max(104),
  winnerTeamId: z.number().int().positive(),
});

async function isBracketLocked(userId: string): Promise<boolean> {
  const supa = await getSupabaseServerClient();
  const { data } = await supa
    .from('profiles')
    .select('bracket_locked_at')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { bracket_locked_at?: string | null } | null)?.bracket_locked_at;
}

function externalCodeForMatchNum(matchNum: number): { stage: string; ext: string } | null {
  if (matchNum >= 73 && matchNum <= 88)       return { stage: 'r32', ext: `R32-${String(matchNum - 72).padStart(2, '0')}` };
  if (matchNum >= 89 && matchNum <= 96)       return { stage: 'r16', ext: `R16-${String(matchNum - 88).padStart(2, '0')}` };
  if (matchNum >= 97 && matchNum <= 100)      return { stage: 'qf',  ext: `QF-${String(matchNum - 96).padStart(2, '0')}` };
  if (matchNum === 101)                       return { stage: 'sf',  ext: 'SF-01' };
  if (matchNum === 102)                       return { stage: 'sf',  ext: 'SF-02' };
  if (matchNum === 103)                       return { stage: 'tp',  ext: 'TP-01' };
  if (matchNum === 104)                       return { stage: 'final', ext: 'FINAL-01' };
  return null;
}

async function getMatchIdForKnockoutNumber(matchNum: number): Promise<number | null> {
  const ec = externalCodeForMatchNum(matchNum);
  if (!ec) return null;
  const supa = getSupabaseAdminClient();
  const { data } = await supa
    .from('matches')
    .select('id')
    .eq('stage', ec.stage)
    .eq('external_code', ec.ext)
    .maybeSingle();
  return (data as { id?: number } | null)?.id ?? null;
}

/** external_code (R32-01 … FINAL-01) → matchNum lógico 73-104 */
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

/**
 * Deriva el bracket del usuario desde sus GRUPOS GUARDADOS + sus picks actuales,
 * con la MISMA lógica que la pantalla de pronóstico y el motor de scoring.
 * Se usa para validar en el servidor que un pick corresponde a un cruce REAL
 * (y no a un bracket "huérfano" creado sin fase de grupos).
 */
async function deriveCrucesForUser(userId: string) {
  const supa = getSupabaseAdminClient();
  const [{ data: teams }, { data: matches }, { data: predMatches }, { data: bw }] = await Promise.all([
    supa.from('teams').select('id, group_letter'),
    supa.from('matches').select('id, stage, group_letter, external_code, home_team_id, away_team_id'),
    supa.from('predictions_matches').select('match_id, home_score, away_score').eq('user_id', userId),
    supa.from('predictions_bracket_winners').select('match_id, winner_team_id').eq('user_id', userId),
  ]);

  const teamsByGroup = new Map<string, number[]>();
  for (const t of (teams ?? []) as Array<{ id: number; group_letter: string | null }>) {
    if (!t.group_letter) continue;
    if (!teamsByGroup.has(t.group_letter)) teamsByGroup.set(t.group_letter, []);
    teamsByGroup.get(t.group_letter)!.push(t.id);
  }
  const groupLetters = Array.from(teamsByGroup.keys()).sort();

  type MRow = {
    id: number; stage: string; group_letter: string | null; external_code: string | null;
    home_team_id: number | null; away_team_id: number | null;
  };
  const matchById = new Map<number, MRow>();
  for (const m of (matches ?? []) as MRow[]) matchById.set(m.id, m);

  const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
  for (const r of (predMatches ?? []) as Array<{ match_id: number; home_score: number; away_score: number }>) {
    const m = matchById.get(r.match_id);
    if (!m || m.stage !== 'group' || !m.group_letter || !m.home_team_id || !m.away_team_id) continue;
    if (!matchPredsByGroup.has(m.group_letter)) matchPredsByGroup.set(m.group_letter, []);
    matchPredsByGroup.get(m.group_letter)!.push({
      matchId: r.match_id, groupLetter: m.group_letter,
      homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
      homeScore: r.home_score, awayScore: r.away_score,
    });
  }

  const picks = new Map<number, number>();
  for (const r of (bw ?? []) as Array<{ match_id: number; winner_team_id: number }>) {
    const num = matchNumFromExternalCode(matchById.get(r.match_id)?.external_code);
    if (num != null) picks.set(num, r.winner_team_id);
  }

  return deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroup, picks);
}

/** Guarda el ganador predicho del partido KO (R32 → Final + 3°). */
export async function saveBracketWinner(input: z.infer<typeof winnerSchema>) {
  const parsed = winnerSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tus cruces ya están confirmados.' };
  }

  const matchId = await getMatchIdForKnockoutNumber(parsed.matchNum);
  if (!matchId) return { error: `No se encontró el partido número ${parsed.matchNum}` };

  // Integridad: el cruce debe estar RESUELTO desde los grupos guardados del usuario
  // (y las rondas previas del bracket), y el ganador debe ser uno de los dos equipos
  // de ese cruce. Esto bloquea picks "huérfanos" sin fase de grupos.
  const { cruces } = await deriveCrucesForUser(me.id);
  const cruce = cruces.find((c) => c.matchNum === parsed.matchNum);
  const aId = cruce && cruce.teamA.kind === 'resolved' ? cruce.teamA.teamId : null;
  const bId = cruce && cruce.teamB.kind === 'resolved' ? cruce.teamB.teamId : null;
  if (!aId || !bId) {
    return { error: 'Aún no puedes elegir este cruce: primero completa y GUARDA toda tu fase de grupos (y las rondas previas de los cruces).' };
  }
  if (parsed.winnerTeamId !== aId && parsed.winnerTeamId !== bId) {
    return { error: 'El equipo elegido no juega en ese cruce. Recarga la página e inténtalo de nuevo.' };
  }

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('predictions_bracket_winners')
    .upsert({
      user_id: me.id,
      match_id: matchId,
      winner_team_id: parsed.winnerTeamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Lock del bracket completo: valida los 32 picks + goleador y bloquea. */
export async function lockBracketWinners() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  // No se puede confirmar el bracket sin la fase de grupos completa y guardada:
  // sin los 72 marcadores, los cruces no se pueden derivar de verdad.
  const { groupsComplete } = await deriveCrucesForUser(me.id);
  if (!groupsComplete) {
    return { error: 'Primero completa y guarda los 72 marcadores de la fase de grupos.' };
  }

  const supa = getSupabaseAdminClient();
  const { count } = await supa
    .from('predictions_bracket_winners')
    .select('match_id', { count: 'exact', head: true })
    .eq('user_id', me.id);
  if ((count ?? 0) < 32) return { error: `Te faltan partidos por predecir (${count}/32).` };

  const { data: scorer } = await supa
    .from('predictions_top_scorer').select('player_name').eq('user_id', me.id).maybeSingle();
  const name = (scorer as { player_name?: string } | null)?.player_name;
  if (!name || name.trim() === '') return { error: 'Falta el goleador del mundial.' };

  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Admin: resetea el lock para un usuario específico. */
export async function adminUnlockBracket(userId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: null })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Admin: confirma (bloquea) el bracket de un usuario EN SU NOMBRE.
 * Valida exactamente lo mismo que el lock normal: grupos completos + 32 picks + goleador.
 * Sirve para usuarios que ya llenaron todo pero no pulsaron "Confirmar".
 */
export async function adminLockBracket(userId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };

  const { groupsComplete } = await deriveCrucesForUser(userId);
  if (!groupsComplete) {
    return { error: 'El usuario no tiene los 72 marcadores de grupos completos.' };
  }

  const supa = getSupabaseAdminClient();
  const { count } = await supa
    .from('predictions_bracket_winners')
    .select('match_id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if ((count ?? 0) < 32) return { error: `El usuario tiene ${count ?? 0}/32 picks de cruces.` };

  const { data: scorer } = await supa
    .from('predictions_top_scorer').select('player_name').eq('user_id', userId).maybeSingle();
  const name = (scorer as { player_name?: string } | null)?.player_name;
  if (!name || name.trim() === '') return { error: 'El usuario no tiene goleador.' };

  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { ok: true };
}

