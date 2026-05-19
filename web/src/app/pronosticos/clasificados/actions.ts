'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

const RoundEnum = z.enum(['r16', 'qf', 'sf', 'final']);
const MAX_PER_ROUND: Record<z.infer<typeof RoundEnum>, number> = {
  r16: 16, qf: 8, sf: 4, final: 2,
};

const toggleSchema = z.object({
  round: RoundEnum,
  teamId: z.number().int().positive(),
});

async function isBracketLocked(userId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('bracket_locked_at')
    .eq('id', userId)
    .maybeSingle();
  return !!(data as { bracket_locked_at?: string | null } | null)?.bracket_locked_at;
}

/** Toggle de equipo para una ronda. Rechaza si el bracket ya está bloqueado (a menos que admin). */
export async function toggleQualifier(input: z.infer<typeof toggleSchema>) {
  const parsed = toggleSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado. Si necesitas cambios, contacta al admin.' };
  }

  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();

  const { data: existing } = await client
    .from('predictions_qualifiers')
    .select('team_id')
    .eq('user_id', me.id)
    .eq('round', parsed.round)
    .eq('team_id', parsed.teamId)
    .maybeSingle();

  if (existing) {
    const { error } = await client
      .from('predictions_qualifiers')
      .delete()
      .eq('user_id', me.id)
      .eq('round', parsed.round)
      .eq('team_id', parsed.teamId);
    if (error) return { error: error.message };
    return { ok: true, action: 'removed' as const };
  }

  const { count } = await client
    .from('predictions_qualifiers')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', me.id)
    .eq('round', parsed.round);

  if ((count ?? 0) >= MAX_PER_ROUND[parsed.round]) {
    return {
      error: `Ya tienes ${MAX_PER_ROUND[parsed.round]} equipos elegidos para esta ronda. Quita uno antes.`,
    };
  }

  const { error } = await client
    .from('predictions_qualifiers')
    .insert({
      user_id: me.id,
      round: parsed.round,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true, action: 'added' as const };
}

const positionSchema = z.object({
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive().nullable(),
});

export async function saveTopPosition(input: z.infer<typeof positionSchema>) {
  const parsed = positionSchema.parse(input);
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin && await isBracketLocked(me.id)) {
    return { error: 'Tu bracket ya está confirmado.' };
  }
  const client = me.isAdmin ? getSupabaseAdminClient() : await getSupabaseServerClient();

  if (parsed.teamId == null) {
    const { error } = await client
      .from('predictions_top_positions')
      .delete()
      .eq('user_id', me.id)
      .eq('position', parsed.position);
    if (error) return { error: error.message };
    return { ok: true };
  }
  const { error } = await client
    .from('predictions_top_positions')
    .upsert({
      user_id: me.id,
      position: parsed.position,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
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
    const { error } = await client
      .from('predictions_top_scorer')
      .delete()
      .eq('user_id', me.id);
    if (error) return { error: error.message };
    return { ok: true };
  }
  const { error } = await client
    .from('predictions_top_scorer')
    .upsert({
      user_id: me.id,
      player_name: cleaned,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  return { ok: true };
}

/** "Confirmar mi bracket": valida que esté completo y bloquea. */
export async function lockBracket() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };

  const supa = getSupabaseAdminClient();
  // Validar que todo esté completo
  const [
    { count: r16 },
    { count: qf },
    { count: sf },
    { count: finalCount },
    { count: top },
    { data: scorer },
  ] = await Promise.all([
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'r16'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'qf'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'sf'),
    supa.from('predictions_qualifiers').select('team_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('round', 'final'),
    supa.from('predictions_top_positions').select('position', { count: 'exact', head: true }).eq('user_id', me.id),
    supa.from('predictions_top_scorer').select('player_name').eq('user_id', me.id).maybeSingle(),
  ]);

  const errors: string[] = [];
  if ((r16 ?? 0) !== 16) errors.push(`Octavos: ${r16}/16`);
  if ((qf  ?? 0) !== 8)  errors.push(`Cuartos: ${qf}/8`);
  if ((sf  ?? 0) !== 4)  errors.push(`Semifinales: ${sf}/4`);
  if ((finalCount ?? 0) !== 2) errors.push(`Final: ${finalCount}/2`);
  if ((top ?? 0) !== 4)  errors.push(`Top 4: ${top}/4`);
  const scorerName = (scorer as { player_name?: string } | null)?.player_name;
  if (!scorerName || scorerName.trim() === '') errors.push('Goleador: vacío');

  if (errors.length > 0) {
    return { error: `Falta completar: ${errors.join(' · ')}` };
  }

  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: new Date().toISOString() })
    .eq('id', me.id);
  if (error) return { error: error.message };

  return { ok: true };
}

/** Admin-only: reset del lock para un usuario específico. */
export async function adminUnlockBracket(userId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'no autorizado' };

  const supa = getSupabaseAdminClient();
  const { error } = await supa
    .from('profiles')
    .update({ bracket_locked_at: null })
    .eq('id', userId);
  if (error) return { error: error.message };
  return { ok: true };
}
