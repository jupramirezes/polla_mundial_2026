-- =====================================================================
-- Migración 005: Lock del bracket completo
-- =====================================================================
-- El usuario llena su bracket en cascada (R16 → QF → SF → Final → Top4 → Goleador).
-- Al final clickea "Confirmar mi bracket" que setea bracket_locked_at en
-- profiles. A partir de ahí, los pronósticos de clasificados/top/scorer
-- quedan bloqueados para el usuario (admin sigue pudiendo editar).
-- =====================================================================

alter table public.profiles
  add column if not exists bracket_locked_at timestamptz;

-- Reemplazar políticas de predictions_qualifiers para respetar bracket_locked_at
drop policy if exists "pred_qual_modify_own_if_open" on public.predictions_qualifiers;

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

-- Reemplazar políticas de predictions_top_positions
drop policy if exists "pred_top_modify_own_if_open" on public.predictions_top_positions;

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

-- Reemplazar políticas de predictions_top_scorer
drop policy if exists "pred_scorer_modify_own_if_open" on public.predictions_top_scorer;

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
