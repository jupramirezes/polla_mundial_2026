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

  // Cierre global: se puede predecir/EDITAR hasta 10 minutos antes del inicio (para
  // todos por igual). NO se bloquea al guardar: queda el último valor que haya a los
  // 10 min. El cálculo es por instante absoluto (scheduled_at es timestamptz), así que
  // es exacto sin importar la zona horaria.
  if (!me.isAdmin) {
    const { data: match } = await supabase
      .from('matches').select('scheduled_at').eq('id', parsed.matchId).maybeSingle();
    const kickoff = (match as { scheduled_at?: string | null } | null)?.scheduled_at;
    if (kickoff && Date.now() >= new Date(kickoff).getTime() - 10 * 60 * 1000) {
      return { error: 'Este partido cerró: solo se podía predecir hasta 10 minutos antes del inicio.' };
    }
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
