'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const matchSchema = z.object({
  matchId: z.number().int().positive(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

const standingSchema = z.object({
  groupLetter: z.string().regex(/^[A-L]$/),
  position: z.number().int().min(1).max(4),
  teamId: z.number().int().positive(),
});

/** Guarda un pronóstico de marcador de partido de fase de grupos. */
export async function saveMatchPrediction(input: z.infer<typeof matchSchema>) {
  const parsed = matchSchema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  const { error } = await supabase
    .from('predictions_matches')
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

/** Borra un pronóstico de marcador (cuando el usuario vacía las dos celdas). */
export async function deleteMatchPrediction(matchId: number) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  const { error } = await supabase
    .from('predictions_matches')
    .delete()
    .eq('user_id', user.id)
    .eq('match_id', matchId);

  if (error) return { error: error.message };
  return { ok: true };
}

/** Guarda una posición de grupo (1°/2°/3°/4°). */
export async function saveGroupStanding(input: z.infer<typeof standingSchema>) {
  const parsed = standingSchema.parse(input);
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  const { error } = await supabase
    .from('predictions_group_standings')
    .upsert({
      user_id: user.id,
      group_letter: parsed.groupLetter,
      position: parsed.position,
      team_id: parsed.teamId,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };
  return { ok: true };
}

/** Borra una predicción de posición (cuando el usuario deselecciona el equipo). */
export async function deleteGroupStanding(groupLetter: string, position: number) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'no autenticado' };

  const { error } = await supabase
    .from('predictions_group_standings')
    .delete()
    .eq('user_id', user.id)
    .eq('group_letter', groupLetter)
    .eq('position', position);

  if (error) return { error: error.message };
  return { ok: true };
}
