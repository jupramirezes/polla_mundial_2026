-- =====================================================================
-- 012 — Re-alinear horas de partidos al horario OFICIAL (fuente: ESPN)
-- =====================================================================
-- scheduled_at en UTC exacto por partido (la app lo muestra en Bogotá).
-- Los que ya estaban bien no cambian; corrige los desfasados (p.ej. hoy
-- Países Bajos-Suecia estaba 5h corrido). Match por pareja de equipos.
-- =====================================================================

with sched(a, b, ts) as (values
  ('México','Sudáfrica','2026-06-11 19:00:00+00'),
  ('Corea del Sur','Chequia','2026-06-12 02:00:00+00'),
  ('Canadá','Bosnia y Herzegovina','2026-06-12 19:00:00+00'),
  ('Estados Unidos','Paraguay','2026-06-13 01:00:00+00'),
  ('Qatar','Suiza','2026-06-13 19:00:00+00'),
  ('Brasil','Marruecos','2026-06-13 22:00:00+00'),
  ('Haití','Escocia','2026-06-14 01:00:00+00'),
  ('Australia','Turquía','2026-06-14 04:00:00+00'),
  ('Alemania','Curazao','2026-06-14 17:00:00+00'),
  ('Países Bajos','Japón','2026-06-14 20:00:00+00'),
  ('Costa de Marfil','Ecuador','2026-06-14 23:00:00+00'),
  ('Suecia','Túnez','2026-06-15 02:00:00+00'),
  ('España','Cabo Verde','2026-06-15 16:00:00+00'),
  ('Bélgica','Egipto','2026-06-15 19:00:00+00'),
  ('Arabia Saudí','Uruguay','2026-06-15 22:00:00+00'),
  ('Irán','Nueva Zelanda','2026-06-16 01:00:00+00'),
  ('Francia','Senegal','2026-06-16 19:00:00+00'),
  ('Iraq','Noruega','2026-06-16 22:00:00+00'),
  ('Argentina','Argelia','2026-06-17 01:00:00+00'),
  ('Austria','Jordania','2026-06-17 04:00:00+00'),
  ('Portugal','RD del Congo','2026-06-17 17:00:00+00'),
  ('Inglaterra','Croacia','2026-06-17 20:00:00+00'),
  ('Ghana','Panamá','2026-06-17 23:00:00+00'),
  ('Uzbekistán','Colombia','2026-06-18 02:00:00+00'),
  ('Chequia','Sudáfrica','2026-06-18 16:00:00+00'),
  ('Suiza','Bosnia y Herzegovina','2026-06-18 19:00:00+00'),
  ('Canadá','Qatar','2026-06-18 22:00:00+00'),
  ('México','Corea del Sur','2026-06-19 01:00:00+00'),
  ('Estados Unidos','Australia','2026-06-19 19:00:00+00'),
  ('Escocia','Marruecos','2026-06-19 22:00:00+00'),
  ('Brasil','Haití','2026-06-20 00:30:00+00'),
  ('Turquía','Paraguay','2026-06-20 03:00:00+00'),
  ('Países Bajos','Suecia','2026-06-20 17:00:00+00'),
  ('Alemania','Costa de Marfil','2026-06-20 20:00:00+00'),
  ('Ecuador','Curazao','2026-06-21 00:00:00+00'),
  ('Túnez','Japón','2026-06-21 04:00:00+00'),
  ('España','Arabia Saudí','2026-06-21 16:00:00+00'),
  ('Bélgica','Irán','2026-06-21 19:00:00+00'),
  ('Uruguay','Cabo Verde','2026-06-21 22:00:00+00'),
  ('Nueva Zelanda','Egipto','2026-06-22 01:00:00+00'),
  ('Argentina','Austria','2026-06-22 17:00:00+00'),
  ('Francia','Iraq','2026-06-22 21:00:00+00'),
  ('Noruega','Senegal','2026-06-23 00:00:00+00'),
  ('Jordania','Argelia','2026-06-23 03:00:00+00'),
  ('Portugal','Uzbekistán','2026-06-23 17:00:00+00'),
  ('Inglaterra','Ghana','2026-06-23 20:00:00+00'),
  ('Panamá','Croacia','2026-06-23 23:00:00+00'),
  ('Colombia','RD del Congo','2026-06-24 02:00:00+00'),
  ('Bosnia y Herzegovina','Qatar','2026-06-24 19:00:00+00'),
  ('Suiza','Canadá','2026-06-24 19:00:00+00'),
  ('Marruecos','Haití','2026-06-24 22:00:00+00'),
  ('Escocia','Brasil','2026-06-24 22:00:00+00'),
  ('Chequia','México','2026-06-25 01:00:00+00'),
  ('Sudáfrica','Corea del Sur','2026-06-25 01:00:00+00'),
  ('Curazao','Costa de Marfil','2026-06-25 20:00:00+00'),
  ('Ecuador','Alemania','2026-06-25 20:00:00+00'),
  ('Japón','Suecia','2026-06-25 23:00:00+00'),
  ('Túnez','Países Bajos','2026-06-25 23:00:00+00'),
  ('Paraguay','Australia','2026-06-26 02:00:00+00'),
  ('Turquía','Estados Unidos','2026-06-26 02:00:00+00'),
  ('Noruega','Francia','2026-06-26 19:00:00+00'),
  ('Senegal','Iraq','2026-06-26 19:00:00+00'),
  ('Cabo Verde','Arabia Saudí','2026-06-27 00:00:00+00'),
  ('Uruguay','España','2026-06-27 00:00:00+00'),
  ('Egipto','Irán','2026-06-27 03:00:00+00'),
  ('Nueva Zelanda','Bélgica','2026-06-27 03:00:00+00'),
  ('Croacia','Ghana','2026-06-27 21:00:00+00'),
  ('Panamá','Inglaterra','2026-06-27 21:00:00+00'),
  ('Colombia','Portugal','2026-06-27 23:30:00+00'),
  ('RD del Congo','Uzbekistán','2026-06-27 23:30:00+00'),
  ('Argelia','Austria','2026-06-28 02:00:00+00'),
  ('Jordania','Argentina','2026-06-28 02:00:00+00')
)
update public.matches m
set scheduled_at = s.ts::timestamptz
from sched s
join public.teams ta on lower(ta.name) = lower(s.a)
join public.teams tb on lower(tb.name) = lower(s.b)
where m.stage = 'group'
  and ((m.home_team_id = ta.id and m.away_team_id = tb.id)
    or (m.home_team_id = tb.id and m.away_team_id = ta.id));
