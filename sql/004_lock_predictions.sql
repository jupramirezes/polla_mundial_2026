-- =====================================================================
-- Migración 004: Lock por pronóstico (no se puede editar tras guardar)
-- =====================================================================
-- Cuando un usuario guarda un pronóstico de partido (grupos o eliminatoria),
-- se setea locked_at. A partir de ese momento, el usuario NO puede editarlo.
-- Solo el admin puede modificarlo (vía service_role o políticas explícitas).
--
-- Decisión de UX: cada Guardar es definitivo (con confirmación previa).
-- Esto evita que la gente entre a "ajustar" predicciones después de saber
-- el resultado real.
-- =====================================================================

-- Agregar locked_at a predictions_matches (fase de grupos)
alter table public.predictions_matches
  add column if not exists locked_at timestamptz;

-- Agregar locked_at a predictions_knockout_matches
alter table public.predictions_knockout_matches
  add column if not exists locked_at timestamptz;

-- ---------------------------------------------------------------------
-- Reemplazar políticas de predictions_matches: edición sólo si NO está
-- locked_at (o si nunca se ha guardado). Borrado solo si no está locked.
-- ---------------------------------------------------------------------
drop policy if exists "pred_matches_modify_own_if_open" on public.predictions_matches;

create policy "pred_matches_insert_own_if_phase_open" on public.predictions_matches
  for insert with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  );

create policy "pred_matches_update_own_if_unlocked" on public.predictions_matches
  for update using (
    auth.uid() = user_id
    and locked_at is null
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  ) with check (
    auth.uid() = user_id
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  );

create policy "pred_matches_delete_own_if_unlocked" on public.predictions_matches
  for delete using (
    auth.uid() = user_id
    and locked_at is null
    and (select locks_at from public.phase_locks where phase = 'group') > now()
  );

-- ---------------------------------------------------------------------
-- Mismo para predictions_knockout_matches
-- ---------------------------------------------------------------------
drop policy if exists "pred_ko_modify_own_if_open" on public.predictions_knockout_matches;

create policy "pred_ko_insert_own_if_open" on public.predictions_knockout_matches
  for insert with check (
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

create policy "pred_ko_update_own_if_unlocked" on public.predictions_knockout_matches
  for update using (
    auth.uid() = user_id
    and locked_at is null
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

create policy "pred_ko_delete_own_if_unlocked" on public.predictions_knockout_matches
  for delete using (
    auth.uid() = user_id
    and locked_at is null
  );

-- ---------------------------------------------------------------------
-- Historial de cambios admin: queda registro de quién cambió qué y cuándo.
-- ---------------------------------------------------------------------
create table if not exists public.admin_overrides (
  id            bigserial primary key,
  admin_id      uuid not null references public.profiles(id),
  target_user   uuid not null references public.profiles(id),
  table_name    text not null,
  record_key    jsonb not null,
  old_value     jsonb,
  new_value     jsonb,
  reason        text,
  created_at    timestamptz not null default now()
);
alter table public.admin_overrides enable row level security;
create policy "admin_overrides_admin_read" on public.admin_overrides
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
