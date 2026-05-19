-- =====================================================================
-- Migración 003: Pronósticos de marcadores en partidos de eliminatorias
-- =====================================================================
-- Permite que los participantes predigan el marcador de cada partido de
-- R32 / R16 / cuartos / semis / 3er puesto / final UNA VEZ que se conocen
-- los pairings (no antes — el matchup depende del resultado de la ronda
-- previa).
--
-- Puntuación (en src/lib/scoring/rules.ts):
--   - 2 pts por acertar 1X2
--   - + 3 pts por marcador exacto (encima del anterior)
--   - 32 partidos × 5 pts máx = 160 pts extra (total mundial 1.160)
-- =====================================================================

-- Una sola tabla para todos los marcadores de eliminatorias (R32 → final).
create table public.predictions_knockout_matches (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    int  not null references public.matches(id),
  home_score  int  not null check (home_score >= 0 and home_score <= 20),
  away_score  int  not null check (away_score >= 0 and away_score <= 20),
  updated_at  timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index idx_pred_ko_user on public.predictions_knockout_matches(user_id);

-- Cache de puntajes: agregar columnas para marcadores de eliminatorias
alter table public.user_scores
  add column if not exists knockout_match_winner int not null default 0,
  add column if not exists knockout_match_exact  int not null default 0,
  add column if not exists knockout_matches_scored int not null default 0,
  add column if not exists knockout_winners_hit    int not null default 0,
  add column if not exists knockout_exact_hit      int not null default 0;

-- RLS para predictions_knockout_matches
alter table public.predictions_knockout_matches enable row level security;

create policy "pred_ko_select_own" on public.predictions_knockout_matches
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Edición permitida si:
--   (a) el partido tiene ambos equipos asignados (matchup determinado)
--   (b) el partido NO ha iniciado todavía (scheduled_at > now())
--   (c) el resultado NO está bloqueado
-- Si el admin no marcó scheduled_at, se permite la edición.
create policy "pred_ko_modify_own_if_open" on public.predictions_knockout_matches
  for all using (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now())
    )
  ) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now())
    )
  );
