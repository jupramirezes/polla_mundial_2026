-- =====================================================================
-- Migración 007: Tabla para guardar quién predijo el ganador de cada partido KO
-- =====================================================================
-- Reemplaza el modelo de "picks por ronda" (predictions_qualifiers + predictions_top_positions)
-- por un modelo basado en bracket: el usuario predice el ganador de cada partido KO.
-- Los "clasificados" a cada ronda y el top 4 se DERIVAN del bracket.
--
-- Tablas viejas (predictions_qualifiers, predictions_top_positions) quedan
-- por compatibilidad pero ya no se escriben desde la UI nueva. El scoring
-- las lee si no hay datos en bracket_winners.
-- =====================================================================

create table if not exists public.predictions_bracket_winners (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  match_id       int  not null references public.matches(id),
  winner_team_id int  not null references public.teams(id),
  locked_at      timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, match_id)
);
create index if not exists idx_pred_bracket_user on public.predictions_bracket_winners(user_id);

alter table public.predictions_bracket_winners enable row level security;

-- Lectura: propia + admin
create policy "pred_bracket_select_own" on public.predictions_bracket_winners
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Inserción: propia, solo si el bracket no está locked
create policy "pred_bracket_insert_own_if_unlocked" on public.predictions_bracket_winners
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );

-- Update: propia, solo si la fila no está locked Y el bracket no está locked
create policy "pred_bracket_update_own_if_unlocked" on public.predictions_bracket_winners
  for update using (
    auth.uid() = user_id
    and locked_at is null
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  ) with check (auth.uid() = user_id);

-- Delete: propia, solo si no está locked
create policy "pred_bracket_delete_own_if_unlocked" on public.predictions_bracket_winners
  for delete using (
    auth.uid() = user_id
    and locked_at is null
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );
