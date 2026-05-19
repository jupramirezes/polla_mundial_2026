'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// R32 NO se guarda manualmente: se deriva de las predicciones de grupos.
// Solo se gestiona aquí R16, QF, SF, Final.
const RoundEnum = z.enum(['r16', 'qf', 'sf', 'final']);
const MAX_PER_ROUND: Record<z.infer<typeof RoundEnum>, number> = {
  r16: 16, qf: 8, sf: 4, final: 2,
};

const toggleSchema = z.object({
  round: RoundEnum,
  teamId: z.number().int().positive(),
});

/** Toggle de equipo para una ronda (R16+). Valida cupo. */
export async function toggleQualifier(input: z.infer<typeof toggleSchema>) {
  const parsed = toggleSchema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  // ¿Ya existe?
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

  // Cupo
  const { count } = await supabase
    .from('predictions_qualifiers')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('round', parsed.round);

  if ((count ?? 0) >= MAX_PER_ROUND[parsed.round]) {
    return {
      error: `Ya tienes ${MAX_PER_ROUND[parsed.round]} equipos elegidos para esta ronda. Quita uno antes de añadir otro.`,
    };
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
