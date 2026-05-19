import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface UserMatchPrediction {
  match_id: number;
  home_score: number;
  away_score: number;
}

export interface UserStandingPrediction {
  group_letter: string;
  position: number;
  team_id: number;
}

/** Devuelve todas las predicciones de partido de fase de grupos del usuario logueado. */
export async function loadMyMatchPredictions(): Promise<Map<number, UserMatchPrediction>> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data } = await supabase
    .from('predictions_matches')
    .select('match_id, home_score, away_score')
    .eq('user_id', user.id);

  const map = new Map<number, UserMatchPrediction>();
  for (const row of (data ?? []) as UserMatchPrediction[]) {
    map.set(row.match_id, row);
  }
  return map;
}

/** Devuelve las predicciones de posiciones por grupo del usuario logueado. */
export async function loadMyGroupStandings(): Promise<
  Map<string, Map<number, number>>  // group_letter → (position → team_id)
> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data } = await supabase
    .from('predictions_group_standings')
    .select('group_letter, position, team_id')
    .eq('user_id', user.id);

  const map = new Map<string, Map<number, number>>();
  for (const row of (data ?? []) as UserStandingPrediction[]) {
    if (!map.has(row.group_letter)) map.set(row.group_letter, new Map());
    map.get(row.group_letter)!.set(row.position, row.team_id);
  }
  return map;
}
