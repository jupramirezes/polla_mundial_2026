'use server';

import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
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

  // Cierre global: se puede predecir/EDITAR hasta 10 minutos antes del inicio, para
  // TODOS por igual — INCLUIDO el admin desde su propio panel. El admin que necesite
  // corregir a alguien lo hace desde /admin/usuarios/[id] (acción aparte con permisos).
  // El cálculo es por instante absoluto (scheduled_at timestamptz) → exacto sin zona.
  {
    const { data: match } = await supabase
      .from('matches').select('scheduled_at').eq('id', parsed.matchId).maybeSingle();
    const kickoff = (match as { scheduled_at?: string | null } | null)?.scheduled_at;
    if (kickoff && Date.now() >= new Date(kickoff).getTime() - 10 * 60 * 1000) {
      return { error: 'Este partido ya cerró: solo se podía editar hasta 10 minutos antes del inicio.' };
    }
  }

  // Cliente normal (RLS) para TODOS: la regla de los 10 min se aplica también a nivel
  // de base, así nadie (ni el admin) la salta desde aquí.
  const { error } = await supabase
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
