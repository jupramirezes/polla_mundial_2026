-- =====================================================================
-- 010 — Cierre de predicciones EN VIVO (eliminatorias) a 5 min del inicio
-- =====================================================================
-- Las predicciones de marcador de eliminatorias (predictions_knockout_matches)
-- se cerraban con `scheduled_at > now()` (justo al pitazo). Lo adelantamos a
-- 5 minutos antes: `scheduled_at > now() + interval '5 minutes'`.
-- Es a nivel RLS, así que aplica a TODOS por igual aunque intenten saltarse la
-- app. (El admin usa service_role y no pasa por RLS, así que puede corregir.)
--
-- Requiere que matches.scheduled_at esté poblado. Si está NULL, se permite
-- editar (fail-open) — por eso primero hay que cargar las horas.
-- =====================================================================

drop policy if exists "pred_ko_insert_own_if_open"     on public.predictions_knockout_matches;
drop policy if exists "pred_ko_update_own_if_unlocked" on public.predictions_knockout_matches;

create policy "pred_ko_insert_own_if_open" on public.predictions_knockout_matches
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '5 minutes')
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
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '5 minutes')
    )
  ) with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.home_team_id is not null
        and m.away_team_id is not null
        and m.result_locked = false
        and (m.scheduled_at is null or m.scheduled_at > now() + interval '5 minutes')
    )
  );
