// Tipos compartidos del dominio Polla Mundial 2026.

export type GroupLetter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export const GROUP_LETTERS: readonly GroupLetter[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
] as const;

export type MatchStage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';

export type PredictionPhase =
  | 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  | 'top_positions' | 'top_scorer';

// ---------- Tablas (shape de Supabase) ----------

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  phone: string | null;
  is_admin: boolean;
  input_mode: 'web' | 'excel';
  created_at: string;
}

export interface Team {
  id: number;
  code: string;
  name: string;
  group_letter: GroupLetter;
  flag_emoji: string | null;
}

export interface MatchRow {
  id: number;
  stage: MatchStage;
  group_letter: GroupLetter | null;
  external_code: string;
  home_team_id: number | null;
  away_team_id: number | null;
  scheduled_at: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: number | null;
  result_locked: boolean;
}

export interface PhaseLock {
  phase: PredictionPhase;
  locks_at: string;
  notes: string | null;
}

export interface UserScoreRow {
  user_id: string;
  total: number;
  group_match_winner: number;
  group_match_exact: number;
  group_standings: number;
  qual_r32: number;
  qual_r16: number;
  qual_qf: number;
  qual_sf: number;
  qual_final: number;
  top_position_1: number;
  top_position_2: number;
  top_position_3: number;
  top_position_4: number;
  top_scorer: number;
  group_matches_total: number;
  group_winners_hit: number;
  group_exact_hit: number;
  updated_at: string;
}

// ---------- Counts esperados ----------

export const EXPECTED_COUNTS = {
  teams: 48,
  groups: 12,
  groupMatchesPerGroup: 6,   // C(4,2) = 6
  groupMatchesTotal: 72,
  r32Qualifiers: 32,
  r16Qualifiers: 16,
  qfQualifiers: 8,
  sfQualifiers: 4,
  finalQualifiers: 2,
  topPositions: 4,
} as const;
