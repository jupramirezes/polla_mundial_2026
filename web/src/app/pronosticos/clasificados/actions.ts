'use server';

import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

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

