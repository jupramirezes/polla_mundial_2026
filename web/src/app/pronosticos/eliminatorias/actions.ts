'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20).nullable(),
  awayScore: z.number().int().min(0).max(20).nullable(),
});

export async function saveKnockoutPrediction(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  if (parsed.homeScore == null || parsed.awayScore == null) {
    const { error } = await supabase
      .from('predictions_knockout_matches')
      .delete()
      .eq('user_id', user.id)
      .eq('match_id', parsed.matchId);
    if (error) return { error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('predictions_knockout_matches')
    .upsert({
      user_id: user.id,
      match_id: parsed.matchId,
      home_score: parsed.homeScore,
      away_score: parsed.awayScore,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}
