'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const positionSchema = z.object({
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive().nullable(),
});

export async function saveTopPosition(input: z.infer<typeof positionSchema>) {
  const parsed = positionSchema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  if (parsed.teamId == null) {
    const { error } = await supabase
      .from('predictions_top_positions')
      .delete()
      .eq('user_id', user.id)
      .eq('position', parsed.position);
    if (error) return { error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('predictions_top_positions')
    .upsert({
      user_id: user.id,
      position: parsed.position,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function saveTopScorer(name: string) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  const cleaned = name.trim();
  if (cleaned === '') {
    const { error } = await supabase
      .from('predictions_top_scorer')
      .delete()
      .eq('user_id', user.id);
    if (error) return { error: error.message };
    return { ok: true };
  }

  const { error } = await supabase
    .from('predictions_top_scorer')
    .upsert({
      user_id: user.id,
      player_name: cleaned,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}
