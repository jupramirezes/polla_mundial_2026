import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { GroupLetter, Team, MatchRow } from '@/lib/types';

export interface GroupData {
  letter: GroupLetter;
  teams: Team[];
  matches: MatchRow[];
}

/** Carga todos los grupos con sus equipos y partidos de fase de grupos. */
export async function loadAllGroups(): Promise<GroupData[]> {
  const supabase = await getSupabaseServerClient();

  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from('teams').select('*').order('group_letter').order('id'),
    supabase.from('matches').select('*').eq('stage', 'group').order('id'),
  ]);

  const groups: Record<string, GroupData> = {};
  for (const t of (teams ?? []) as Team[]) {
    const g = t.group_letter;
    if (!groups[g]) groups[g] = { letter: g, teams: [], matches: [] };
    groups[g].teams.push(t);
  }
  for (const m of (matches ?? []) as MatchRow[]) {
    if (!m.group_letter) continue;
    if (groups[m.group_letter]) groups[m.group_letter].matches.push(m);
  }

  return Object.values(groups).sort((a, b) => a.letter.localeCompare(b.letter));
}

/** Saca cuándo se cierra la fase de grupos (deadline). */
export async function getGroupPhaseLock(): Promise<Date | null> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from('phase_locks')
    .select('locks_at')
    .eq('phase', 'group')
    .maybeSingle();
  return data?.locks_at ? new Date(data.locks_at as string) : null;
}
