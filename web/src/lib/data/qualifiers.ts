import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { QualifierRound } from '@/lib/scoring/rules';

/** Devuelve los equipos predichos por el usuario para una ronda. */
export async function loadMyQualifiers(): Promise<Record<QualifierRound, Set<number>>> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const empty = { r32: new Set<number>(), r16: new Set<number>(), qf: new Set<number>(), sf: new Set<number>(), final: new Set<number>() } as Record<QualifierRound, Set<number>>;
  if (!user) return empty;

  const { data } = await supabase
    .from('predictions_qualifiers')
    .select('round, team_id')
    .eq('user_id', user.id);

  for (const row of (data ?? []) as Array<{ round: string; team_id: number }>) {
    const r = row.round as QualifierRound;
    if (empty[r]) empty[r].add(row.team_id);
  }
  return empty;
}

export async function loadAllTeams() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('teams')
    .select('*')
    .order('group_letter')
    .order('name');
  return data ?? [];
}
