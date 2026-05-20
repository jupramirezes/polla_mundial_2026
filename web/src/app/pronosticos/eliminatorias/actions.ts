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

  // ¿Ya bloqueado?
  const { data: existing } = await supabase
    .from('predictions_knockout_matches')
    .select('locked_at')
    .eq('user_id', me.id)
    .eq('match_id', parsed.matchId)
    .maybeSingle();
  if (existing?.locked_at && !me.isAdmin) {
    return { error: 'Este partido ya está guardado y bloqueado. Si necesitas cambiarlo, contacta al admin.' };
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

// =====================================================================
// 🧪 TESTING (admin only): autollenar mis pronósticos KO con marcadores aleatorios
// =====================================================================

export async function autofillMyKnockoutPredictions() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };

  const supa = getSupabaseAdminClient();
  // Cargar partidos KO con equipos asignados (esos son los que se pueden predecir)
  const { data: matches, error: e1 } = await supa
    .from('matches')
    .select('id, home_team_id, away_team_id, result_locked')
    .neq('stage', 'group')
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null);
  if (e1) return { error: e1.message };

  const open = (matches ?? []).filter((m) => {
    const mm = m as { result_locked: boolean };
    return !mm.result_locked;
  });

  if (open.length === 0) {
    return { error: 'No hay partidos KO con equipos asignados. Primero autogenera los cruces en /admin/eliminatorias.' };
  }

  function rand(): number {
    const r = Math.random();
    if (r < 0.30) return 0;
    if (r < 0.65) return 1;
    if (r < 0.85) return 2;
    if (r < 0.95) return 3;
    return 4;
  }

  // Borrar mis predicciones KO existentes y reinsertar
  await supa.from('predictions_knockout_matches').delete().eq('user_id', me.id);
  const rows = open.map((m) => {
    const mm = m as { id: number };
    let h: number, a: number;
    do {
      h = rand(); a = rand();
    } while (h === a);  // en KO no hay empate (es problemático para "ganador")
    return {
      user_id: me.id,
      match_id: mm.id,
      home_score: h,
      away_score: a,
      locked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
  const { error } = await supa.from('predictions_knockout_matches').insert(rows);
  if (error) return { error: error.message };

  return { ok: true, filled: rows.length };
}

/** Admin (testing): borra MIS pronósticos de marcadores KO. */
export async function clearMyKnockoutPredictions() {
  const me = await getCurrentUser();
  if (!me) return { error: 'no autenticado' };
  if (!me.isAdmin) return { error: 'solo admin (test)' };
  const supa = getSupabaseAdminClient();
  const { error } = await supa.from('predictions_knockout_matches').delete().eq('user_id', me.id);
  if (error) return { error: error.message };
  return { ok: true };
}
