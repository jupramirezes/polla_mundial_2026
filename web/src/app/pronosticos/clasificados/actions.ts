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

/** Guarda el ganador predicho del partido KO (R32 → Final + 3°). */
export async function saveBracketWinner(input: z.infer<typeof winnerSchema>) {
  const parsed = winnerSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado.' };
  }

  const matchId = await getMatchIdForKnockoutNumber(parsed.matchNum);
  if (!matchId) return { error: `No se encontró el partido número ${parsed.matchNum}` };

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

// =====================================================================
// 🧪 TESTING (admin only): autollenar bracket con picks aleatorios
// =====================================================================

const FAKE_SCORERS = [
  'Lionel Messi', 'Kylian Mbappé', 'Erling Haaland', 'Vinicius Jr',
  'Harry Kane', 'Lautaro Martínez', 'Luis Díaz', 'Phil Foden',
];

export async function autofillMyBracket() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };

  const supa = getSupabaseAdminClient();

  const [{ data: matches }, { data: teams }, { data: predMatches }] = await Promise.all([
    supa.from('matches').select('id, stage, group_letter, home_team_id, away_team_id, external_code'),
    supa.from('teams').select('id, group_letter'),
    supa.from('predictions_matches').select('match_id, home_score, away_score').eq('user_id', me.id),
  ]);

  const matchById = new Map<number, { groupLetter: string; homeTeamId: number; awayTeamId: number }>();
  const matchIdByExt = new Map<string, number>();
  for (const m of matches ?? []) {
    const mm = m as { id: number; stage: string; group_letter: string | null; home_team_id: number | null; away_team_id: number | null; external_code: string };
    matchIdByExt.set(mm.external_code, mm.id);
    if (mm.stage !== 'group' || !mm.group_letter || !mm.home_team_id || !mm.away_team_id) continue;
    matchById.set(mm.id, { groupLetter: mm.group_letter, homeTeamId: mm.home_team_id, awayTeamId: mm.away_team_id });
  }
  const teamsByGroup = new Map<string, number[]>();
  for (const t of teams ?? []) {
    const tt = t as { id: number; group_letter: string };
    if (!teamsByGroup.has(tt.group_letter)) teamsByGroup.set(tt.group_letter, []);
    teamsByGroup.get(tt.group_letter)!.push(tt.id);
  }
  const matchPredsByGroup = new Map<string, UserGroupMatchPred[]>();
  for (const p of predMatches ?? []) {
    const pp = p as { match_id: number; home_score: number; away_score: number };
    const info = matchById.get(pp.match_id);
    if (!info) continue;
    if (!matchPredsByGroup.has(info.groupLetter)) matchPredsByGroup.set(info.groupLetter, []);
    matchPredsByGroup.get(info.groupLetter)!.push({
      matchId: pp.match_id, groupLetter: info.groupLetter,
      homeTeamId: info.homeTeamId, awayTeamId: info.awayTeamId,
      homeScore: pp.home_score, awayScore: pp.away_score,
    });
  }

  const groupLetters = Array.from(teamsByGroup.keys()).sort();
  const picks = new Map<number, number>();
  for (let iter = 0; iter < 8; iter++) {
    const bracket = deriveUserBracket(groupLetters, teamsByGroup, matchPredsByGroup, picks);
    let changed = false;
    for (const c of bracket.cruces) {
      if (picks.has(c.matchNum)) continue;
      if (c.teamA.kind === 'resolved' && c.teamB.kind === 'resolved') {
        const winner = Math.random() < 0.5 ? c.teamA.teamId : c.teamB.teamId;
        picks.set(c.matchNum, winner);
        changed = true;
      }
    }
    if (!changed) break;
  }

  if (picks.size < 32) {
    return { error: `No se pudo resolver el bracket completo (${picks.size}/32). Llena los 72 marcadores de grupos primero.` };
  }

  // Reset y reinsertar
  await supa.from('predictions_bracket_winners').delete().eq('user_id', me.id);
  const rows: Array<{ user_id: string; match_id: number; winner_team_id: number }> = [];
  for (const [matchNum, winnerId] of picks) {
    const ec = externalCodeForMatchNum(matchNum);
    if (!ec) continue;
    const matchId = matchIdByExt.get(ec.ext);
    if (!matchId) continue;
    rows.push({ user_id: me.id, match_id: matchId, winner_team_id: winnerId });
  }
  const { error } = await supa.from('predictions_bracket_winners').insert(rows);
  if (error) return { error: error.message };

  // Goleador random
  await supa.from('predictions_top_scorer').delete().eq('user_id', me.id);
  await supa.from('predictions_top_scorer').insert({
    user_id: me.id,
    player_name: FAKE_SCORERS[Math.floor(Math.random() * FAKE_SCORERS.length)],
  });

  return { ok: true, picks: rows.length };
}

export async function clearMyBracketPicks() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };

  const supa = getSupabaseAdminClient();
  await Promise.all([
    supa.from('predictions_bracket_winners').delete().eq('user_id', me.id),
    supa.from('predictions_top_scorer').delete().eq('user_id', me.id),
    supa.from('profiles').update({ bracket_locked_at: null }).eq('id', me.id),
  ]);
  return { ok: true };
}
