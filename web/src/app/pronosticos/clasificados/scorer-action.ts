'use server';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

async function isBracketLocked(userId: string): Promise<boolean> {
  const supa = await getSupabaseServerClient();
  const { data } = await supa
    .from('profiles')
    .select('bracket_locked_at')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { bracket_locked_at?: string | null } | null)?.bracket_locked_at;
}

export async function saveTopScorer(name: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado.' };
  }
  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();
  const cleaned = name.trim();
  if (cleaned === '') {
    const { error } = await client.from('predictions_top_scorer').delete().eq('user_id', me.id);
    if (error) return { error: error.message };
    return { ok: true };
  }
  const { error } = await client
    .from('predictions_top_scorer')
    .upsert({ user_id: me.id, player_name: cleaned, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  return { ok: true };
}
