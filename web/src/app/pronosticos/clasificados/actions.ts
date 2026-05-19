'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const RoundEnum = z.enum(['r32', 'r16', 'qf', 'sf', 'final']);
const MAX_PER_ROUND: Record<z.infer<typeof RoundEnum>, number> = {
  r32: 32, r16: 16, qf: 8, sf: 4, final: 2,
};

const toggleSchema = z.object({
  round: RoundEnum,
  teamId: z.number().int().positive(),
});

/** Toggle: si el equipo ya está predicho para esta ronda, lo quita; si no, lo agrega.
 *  Devuelve error si excedería el cupo (32/16/8/4/2). */
export async function toggleQualifier(input: z.infer<typeof toggleSchema>) {
  const parsed = toggleSchema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  // Saber si ya existe
  const { data: existing } = await supabase
    .from('predictions_qualifiers')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('round', parsed.round)
    .eq('team_id', parsed.teamId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('predictions_qualifiers')
      .delete()
      .eq('user_id', user.id)
      .eq('round', parsed.round)
      .eq('team_id', parsed.teamId);
    if (error) return { error: error.message };
    return { ok: true, action: 'removed' as const };
  }

  // Validar cupo: contar cuántos ya hay para esta ronda
  const { count } = await supabase
    .from('predictions_qualifiers')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('round', parsed.round);

  if ((count ?? 0) >= MAX_PER_ROUND[parsed.round]) {
    return { error: `Ya tienes ${MAX_PER_ROUND[parsed.round]} equipos elegidos para esta ronda. Quita uno antes de añadir otro.` };
  }

  const { error } = await supabase
    .from('predictions_qualifiers')
    .insert({
      user_id: user.id,
      round: parsed.round,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true, action: 'added' as const };
}
