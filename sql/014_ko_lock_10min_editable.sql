-- =====================================================================
-- 014 — Predicciones EN VIVO (eliminatorias): editables hasta 10 min antes
-- =====================================================================
-- Cambios sobre 010:
--   1) El cierre pasa de 5 a 10 minutos antes del inicio.
--   2) Se quita la condición `locked_at is null` del UPDATE: ahora el marcador
--      se puede CAMBIAR las veces que quiera hasta 10 min antes (ya no se bloquea
--      al guardar). Queda el último valor que haya a los 10 min.
-- Sigue siendo a nivel RLS → aplica a TODOS por igual. El admin usa service_role
-- (no pasa por RLS) y puede corregir cuando sea.
--
-- Requiere matches.scheduled_at poblado; si está NULL, se permite editar (fail-open).
-- =====================================================================

drop policy if exists "pred_ko_insert_own_if_open"     on public.predictions_knockout_matches;
drop policy if exists "pred_ko_update_own_if_unlocked" on public.predictions_knockout_matches;
drop policy if exists "pred_ko_update_own_if_open"     on public.predictions_knockout_matches;

create policy "pred_ko_insert_own_if_open" on public.predictions_knockout_matches
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '10 minutes')
    )
  );

create policy "pred_ko_update_own_if_open" on public.predictions_knockout_matches
  for update using (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '10 minutes')
    )
  ) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '10 minutes')
    )
  );
