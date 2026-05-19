'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

// R32 NO se guarda manualmente: se deriva de las predicciones de grupos.
// Solo se gestiona aquí R16, QF, SF, Final + Top4 + Goleador.
const RoundEnum = z.enum(['r16', 'qf', 'sf', 'final']);
const MAX_PER_ROUND: Record<z.infer<typeof RoundEnum>, number> = {
  r16: 16, qf: 8, sf: 4, final: 2,
};

const topPositionSchema = z.object({
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive().nullable(),
});

export async function saveTopPosition(input: z.infer<typeof topPositionSchema>) {
  const parsed = topPositionSchema.parse(input);
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
