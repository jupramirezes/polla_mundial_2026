'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

const schema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

/** Guarda un pronóstico de marcador de partido de eliminatoria. Bloquea al guardar. */
export async function saveKnockoutPrediction(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  const supabase = await getSupabaseServerClient();

  // ¿Ya bloqueado?
  const { data: existing } = await supabase
    .from('predictions_knockout_matches')
    .select('locked_at')
    .eq('user_id', me.id)
    .eq('match_id', parsed.matchId)
    .maybeSingle();
  if (existing?.locked_at && !me.isAdmin) {
    return { error: 'Este partido ya está guardado y bloqueado. Si necesitas cambiarlo, contacta al admin.' };
  }

  const client = me.isAdmin ? getSupabaseAdminClient() : supabase;
  const { error } = await client
    .from('predictions_knockout_matches')
    .upsert({
      user_id: me.id,
      match_id: parsed.matchId,
      home_score: parsed.homeScore,
      away_score: parsed.awayScore,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}
