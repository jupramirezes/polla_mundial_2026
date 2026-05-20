'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { z } from 'zod';

const matchSchema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

/**
 * Guarda un pronóstico de marcador de partido (grupos).
 * Si el usuario YA había guardado este partido (locked_at no null), rechaza.
 * Marca locked_at = now() al guardar.
 *
 * El admin puede sobreescribir su propio pronóstico aunque esté locked.
 */
export async function saveMatchPrediction(input: z.infer<typeof matchSchema>) {
  const parsed = matchSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  const supabase = await getSupabaseServerClient();

  // ¿Ya tiene predicción para este partido?
  const { data: existing } = await supabase
    .from('predictions_matches')
    .select('locked_at')
    .eq('user_id', me.id)
    .eq('match_id', parsed.matchId)
    .maybeSingle();

  if (existing?.locked_at && !me.isAdmin) {
    return { error: 'Este partido ya está guardado y bloqueado. Si necesitas cambiarlo, contacta al admin.' };
  }

  // Para escribir bypassing posibles políticas RLS sobre locked_at (admin),
  // usamos service_role si es admin. Si es usuario regular, RLS lo deja escribir
  // mientras locked_at sea null.
  const client = me.isAdmin ? getSupabaseAdminClient() : supabase;

  const { error } = await client
    .from('predictions_matches')
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
