-- =====================================================================
-- Migración 006: Arregla 004 y 005 — drop + recreate idempotente
-- =====================================================================
-- Si ya corriste 004 o 005 parcialmente, esta migración limpia las
-- políticas existentes y las vuelve a crear. Es seguro correrla múltiples
-- veces.
-- =====================================================================

-- ---- predictions_matches ----
drop policy if exists "pred_matches_insert_own_if_phase_open" on public.predictions_matches;
drop policy if exists "pred_matches_update_own_if_unlocked"   on public.predictions_matches;
drop policy if exists "pred_matches_delete_own_if_unlocked"   on public.predictions_matches;
drop policy if exists "pred_matches_modify_own_if_open"       on public.predictions_matches;

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

-- ---- predictions_knockout_matches ----
drop policy if exists "pred_ko_insert_own_if_open"        on public.predictions_knockout_matches;
drop policy if exists "pred_ko_update_own_if_unlocked"    on public.predictions_knockout_matches;
drop policy if exists "pred_ko_delete_own_if_unlocked"    on public.predictions_knockout_matches;
drop policy if exists "pred_ko_modify_own_if_open"        on public.predictions_knockout_matches;

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

-- ---- predictions_qualifiers ----
drop policy if exists "pred_qual_insert_own_if_unlocked"  on public.predictions_qualifiers;
drop policy if exists "pred_qual_delete_own_if_unlocked"  on public.predictions_qualifiers;
drop policy if exists "pred_qual_modify_own_if_open"      on public.predictions_qualifiers;

create policy "pred_qual_insert_own_if_unlocked" on public.predictions_qualifiers
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
    and (select locks_at from public.phase_locks where phase = round) > now()
  );

create policy "pred_qual_delete_own_if_unlocked" on public.predictions_qualifiers
  for delete using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );

-- ---- predictions_top_positions ----
drop policy if exists "pred_top_insert_own_if_unlocked"   on public.predictions_top_positions;
drop policy if exists "pred_top_update_own_if_unlocked"   on public.predictions_top_positions;
drop policy if exists "pred_top_delete_own_if_unlocked"   on public.predictions_top_positions;
drop policy if exists "pred_top_modify_own_if_open"       on public.predictions_top_positions;

create policy "pred_top_insert_own_if_unlocked" on public.predictions_top_positions
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );

create policy "pred_top_update_own_if_unlocked" on public.predictions_top_positions
  for update using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  ) with check (auth.uid() = user_id);

create policy "pred_top_delete_own_if_unlocked" on public.predictions_top_positions
  for delete using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );

-- ---- predictions_top_scorer ----
drop policy if exists "pred_scorer_insert_own_if_unlocked" on public.predictions_top_scorer;
drop policy if exists "pred_scorer_update_own_if_unlocked" on public.predictions_top_scorer;
drop policy if exists "pred_scorer_delete_own_if_unlocked" on public.predictions_top_scorer;
drop policy if exists "pred_scorer_modify_own_if_open"     on public.predictions_top_scorer;

create policy "pred_scorer_insert_own_if_unlocked" on public.predictions_top_scorer
  for insert with check (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );

create policy "pred_scorer_update_own_if_unlocked" on public.predictions_top_scorer
  for update using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  ) with check (auth.uid() = user_id);

create policy "pred_scorer_delete_own_if_unlocked" on public.predictions_top_scorer
  for delete using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.profiles
      where id = auth.uid() and bracket_locked_at is not null
    )
  );
