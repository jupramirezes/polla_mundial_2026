-- =====================================================================
-- Polla Mundial 2026 — Schema inicial
-- =====================================================================
-- Estructura mínima para soportar:
--   * 48 equipos en 12 grupos
--   * 104 partidos (72 fase de grupos + 16 R32 + 8 octavos + 4 cuartos
--     + 2 semis + 1 tercer puesto + 1 final)
--   * Pronósticos por usuario (partidos, posiciones de grupo,
--     clasificados a cada ronda, top 4 final, goleador)
--   * Resultados oficiales (cargados por admin)
--   * Cache de puntajes por usuario para leaderboard en vivo
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfil de usuario (extiende auth.users de Supabase)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email       text not null unique,
  phone       text,
  is_admin    boolean not null default false,
  -- 'web' = llena por la web; 'excel' = el admin subió su Excel
  input_mode  text not null default 'web' check (input_mode in ('web','excel')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Equipos (48 selecciones)
-- ---------------------------------------------------------------------
create table public.teams (
  id            serial primary key,
  code          text not null unique,            -- 'BRA', 'COL', 'USA'
  name          text not null,                   -- 'Brasil'
  group_letter  char(1) not null check (group_letter between 'A' and 'L'),
  flag_emoji    text,                            -- opcional para UI
  created_at    timestamptz not null default now()
);
create index idx_teams_group on public.teams(group_letter);

-- ---------------------------------------------------------------------
-- Partidos (104 en total)
-- ---------------------------------------------------------------------
create type match_stage as enum ('group','r32','r16','qf','sf','tp','final');

create table public.matches (
  id              serial primary key,
  stage           match_stage not null,
  group_letter    char(1) check (
                    (stage = 'group' and group_letter is not null)
                    or (stage <> 'group' and group_letter is null)
                  ),
  external_code   text not null unique,          -- 'G-A-01', 'R32-01', 'F-01'
  home_team_id    int references public.teams(id),
  away_team_id    int references public.teams(id),
  scheduled_at    timestamptz,
  -- Resultado oficial (lo carga el admin)
  home_score      int check (home_score >= 0),
  away_score      int check (away_score >= 0),
  -- En knockouts, ganador (para resolver llave)
  winner_team_id  int references public.teams(id),
  result_locked   boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_matches_stage on public.matches(stage);
create index idx_matches_scheduled on public.matches(scheduled_at);

-- ---------------------------------------------------------------------
-- Bloqueo de pronósticos por fase
-- ---------------------------------------------------------------------
-- Define hasta qué momento se pueden editar pronósticos de cada fase.
-- p.ej.: 'group' = deadline antes del primer partido del mundial.
--        'r16'  = deadline antes del primer partido de octavos.
create type prediction_phase as enum (
  'group',       -- todos los marcadores de grupos + posiciones de grupo
  'r32',         -- 32 equipos a R32
  'r16',         -- 16 equipos a octavos
  'qf',          -- 8 equipos a cuartos
  'sf',          -- 4 equipos a semis
  'final',       -- 2 equipos a la final
  'top_positions', -- top 4 final
  'top_scorer'   -- goleador
);

create table public.phase_locks (
  phase       prediction_phase primary key,
  locks_at    timestamptz not null,
  notes       text
);

-- ---------------------------------------------------------------------
-- Pronósticos: marcadores fase de grupos
-- ---------------------------------------------------------------------
create table public.predictions_matches (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    int not null references public.matches(id),
  home_score  int not null check (home_score >= 0 and home_score <= 20),
  away_score  int not null check (away_score >= 0 and away_score <= 20),
  updated_at  timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index idx_pred_matches_user on public.predictions_matches(user_id);

-- ---------------------------------------------------------------------
-- Pronósticos: posiciones finales del grupo (1°-4°)
-- ---------------------------------------------------------------------
create table public.predictions_group_standings (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  group_letter  char(1) not null,
  position      int not null check (position between 1 and 4),
  team_id       int not null references public.teams(id),
  updated_at    timestamptz not null default now(),
  primary key (user_id, group_letter, position),
  unique (user_id, group_letter, team_id)        -- no repetir equipo en mismo grupo
);

-- ---------------------------------------------------------------------
-- Pronósticos: clasificados a cada ronda (sin orden)
-- ---------------------------------------------------------------------
-- round: 'r32', 'r16', 'qf', 'sf', 'final'
create table public.predictions_qualifiers (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  round       prediction_phase not null check (round in ('r32','r16','qf','sf','final')),
  team_id     int not null references public.teams(id),
  updated_at  timestamptz not null default now(),
  primary key (user_id, round, team_id)
);
create index idx_pred_qual_user_round on public.predictions_qualifiers(user_id, round);

-- ---------------------------------------------------------------------
-- Pronósticos: posiciones finales (campeón, sub, 3°, 4°)
-- ---------------------------------------------------------------------
create table public.predictions_top_positions (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  position    int not null check (position between 1 and 4),
  team_id     int not null references public.teams(id),
  updated_at  timestamptz not null default now(),
  primary key (user_id, position),
  unique (user_id, team_id)                      -- mismo equipo no puede estar dos veces
);

-- ---------------------------------------------------------------------
-- Pronósticos: goleador
-- ---------------------------------------------------------------------
create table public.predictions_top_scorer (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  player_name  text not null,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Resultados oficiales: clasificados por ronda
-- ---------------------------------------------------------------------
create table public.official_qualifiers (
  round    prediction_phase not null check (round in ('r32','r16','qf','sf','final')),
  team_id  int not null references public.teams(id),
  primary key (round, team_id)
);

-- ---------------------------------------------------------------------
-- Resultados oficiales: posiciones finales top 4
-- ---------------------------------------------------------------------
create table public.official_top_positions (
  position int primary key check (position between 1 and 4),
  team_id  int not null references public.teams(id)
);

-- ---------------------------------------------------------------------
-- Resultados oficiales: goleador(es) — múltiples si hay empate
-- ---------------------------------------------------------------------
create table public.official_top_scorers (
  player_name  text primary key,
  goals        int not null check (goals >= 0)
);

-- ---------------------------------------------------------------------
-- Cache de puntajes (se recalcula al actualizar resultados oficiales)
-- ---------------------------------------------------------------------
create table public.user_scores (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  total                int not null default 0,
  -- Desglose
  group_match_winner   int not null default 0,   -- 1X2 correctos
  group_match_exact    int not null default 0,   -- bonus marcador exacto
  group_standings      int not null default 0,   -- posiciones grupo
  qual_r32             int not null default 0,
  qual_r16             int not null default 0,
  qual_qf              int not null default 0,
  qual_sf              int not null default 0,
  qual_final           int not null default 0,
  top_position_1       int not null default 0,   -- campeón
  top_position_2       int not null default 0,   -- subcampeón
  top_position_3       int not null default 0,
  top_position_4       int not null default 0,
  top_scorer           int not null default 0,
  -- Conteo de aciertos (útil para UI: "12/72 partidos acertados")
  group_matches_total  int not null default 0,
  group_winners_hit    int not null default 0,
  group_exact_hit      int not null default 0,
  updated_at           timestamptz not null default now()
);
create index idx_user_scores_total on public.user_scores(total desc);

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.profiles                    enable row level security;
alter table public.teams                       enable row level security;
alter table public.matches                     enable row level security;
alter table public.phase_locks                 enable row level security;
alter table public.predictions_matches         enable row level security;
alter table public.predictions_group_standings enable row level security;
alter table public.predictions_qualifiers      enable row level security;
alter table public.predictions_top_positions   enable row level security;
alter table public.predictions_top_scorer      enable row level security;
alter table public.official_qualifiers         enable row level security;
alter table public.official_top_positions      enable row level security;
alter table public.official_top_scorers        enable row level security;
alter table public.user_scores                 enable row level security;

-- profiles: cada uno lee/edita el suyo; todos pueden ver display_name de otros
create policy "profiles_select_all" on public.profiles
  for select using (true);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- teams / matches / phase_locks / official_*: lectura pública; escritura solo admin
create policy "teams_select_all"  on public.teams  for select using (true);
create policy "matches_select_all" on public.matches for select using (true);
create policy "phase_locks_select_all" on public.phase_locks for select using (true);
create policy "official_qual_select_all"  on public.official_qualifiers  for select using (true);
create policy "official_top_positions_select_all" on public.official_top_positions for select using (true);
create policy "official_top_scorers_select_all"   on public.official_top_scorers   for select using (true);

create policy "teams_admin_write" on public.teams
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "matches_admin_write" on public.matches
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "phase_locks_admin_write" on public.phase_locks
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "official_qual_admin_write" on public.official_qualifiers
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "official_top_positions_admin_write" on public.official_top_positions
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
create policy "official_top_scorers_admin_write" on public.official_top_scorers
  for all using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- predictions_*: cada uno lee/edita los suyos. Admin lee todo (para panel/upload Excel).
-- Edición solo permitida si la fase no está bloqueada.
create policy "pred_matches_select_own" on public.predictions_matches
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "pred_matches_modify_own_if_open" on public.predictions_matches
  for all using (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  );

create policy "pred_group_select_own" on public.predictions_group_standings
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "pred_group_modify_own_if_open" on public.predictions_group_standings
  for all using (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  );

create policy "pred_qual_select_own" on public.predictions_qualifiers
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "pred_qual_modify_own_if_open" on public.predictions_qualifiers
  for all using (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = round) > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = round) > now()
  );

create policy "pred_top_select_own" on public.predictions_top_positions
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "pred_top_modify_own_if_open" on public.predictions_top_positions
  for all using (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'top_positions') > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'top_positions') > now()
  );

create policy "pred_scorer_select_own" on public.predictions_top_scorer
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
create policy "pred_scorer_modify_own_if_open" on public.predictions_top_scorer
  for all using (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'top_scorer') > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'top_scorer') > now()
  );

-- user_scores: lectura pública (leaderboard); escritura solo via función (service_role)
create policy "user_scores_select_all" on public.user_scores for select using (true);

-- =====================================================================
-- Trigger: crear profile cuando se crea un user en auth.users
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  insert into public.user_scores (user_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
