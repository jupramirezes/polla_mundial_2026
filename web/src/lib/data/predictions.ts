import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface UserMatchPrediction {
  match_id: number;
  home_score: number;
  away_score: number;
  locked_at: string | null;
}

/** Todas las predicciones de partido de fase de grupos del usuario logueado. */
export async function loadMyMatchPredictions(): Promise<Map<number, UserMatchPrediction>> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data } = await supabase
    .from('predictions_matches')
    .select('match_id, home_score, away_score, locked_at')
    .eq('user_id', user.id);

  const map = new Map<number, UserMatchPrediction>();
  for (const row of (data ?? []) as UserMatchPrediction[]) {
    map.set(row.match_id, row);
  }
  return map;
}
