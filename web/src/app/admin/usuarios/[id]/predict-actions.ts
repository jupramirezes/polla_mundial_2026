'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

async function requireAdmin() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' as const };
  if (!me.isAdmin) return { error: 'no autorizado' as const };
  return { me };
}

// =====================================================================
// Marcadores de FASE DE GRUPOS — admin edita en nombre del usuario
// =====================================================================

const matchScoreSchema = z.object({
  userId: z.string().uuid(),
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export async function adminSaveUserGroupPrediction(input: z.infer<typeof matchScoreSchema>) {
  const parsed = matchScoreSchema.parse(input);
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('predictions_matches')
    .upsert({
      user_id: parsed.userId,
      match_id: parsed.matchId,
      home_score: parsed.homeScore,
      away_score: parsed.awayScore,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  revalidatePath(`/admin/usuarios/${parsed.userId}`);
  return { ok: true };
}

export async function adminClearUserGroupPrediction(input: { userId: string; matchId: number }) {
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('predictions_matches')
    .delete()
    .eq('user_id', input.userId)
    .eq('match_id', input.matchId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/usuarios/${input.userId}`);
  return { ok: true };
}

// =====================================================================
// Marcadores de ELIMINATORIAS (KO) — admin edita en nombre del usuario
// =====================================================================

export async function adminSaveUserKnockoutPrediction(input: z.infer<typeof matchScoreSchema>) {
  const parsed = matchScoreSchema.parse(input);
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('predictions_knockout_matches')
    .upsert({
      user_id: parsed.userId,
      match_id: parsed.matchId,
      home_score: parsed.homeScore,
      away_score: parsed.awayScore,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  revalidatePath(`/admin/usuarios/${parsed.userId}`);
  return { ok: true };
}

export async function adminClearUserKnockoutPrediction(input: { userId: string; matchId: number }) {
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('predictions_knockout_matches')
    .delete()
    .eq('user_id', input.userId)
    .eq('match_id', input.matchId);
  if (error) return { error: error.message };
  revalidatePath(`/admin/usuarios/${input.userId}`);
  return { ok: true };
}

// =====================================================================
// Goleador del mundial — admin edita en nombre del usuario
// =====================================================================

const scorerSchema = z.object({
  userId: z.string().uuid(),
  playerName: z.string().trim().max(80),
});

export async function adminSaveUserScorer(input: z.infer<typeof scorerSchema>) {
  const parsed = scorerSchema.parse(input);
  const guard = await requireAdmin();
  if ('error' in guard) return { error: guard.error };

  const supa = getSupabaseAdminClient();
  if (parsed.playerName === '') {
    await supa.from('predictions_top_scorer').delete().eq('user_id', parsed.userId);
  } else {
    const { error } = await supa
      .from('predictions_top_scorer')
      .upsert({
        user_id: parsed.userId,
        player_name: parsed.playerName,
        updated_at: new Date().toISOString(),
      });
    if (error) return { error: error.message };
  }
  revalidatePath(`/admin/usuarios/${parsed.userId}`);
  return { ok: true };
}
