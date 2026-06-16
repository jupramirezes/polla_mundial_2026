-- =====================================================================
-- 011 — Cargar horas de inicio (scheduled_at) de los 72 partidos de grupos
-- =====================================================================
-- Horas en HORA COLOMBIA (UTC-5). Se guardan como timestamptz → Postgres
-- almacena el instante absoluto; la app lo muestra en America/Bogota y calcula
-- el corte de "5 min antes" por instante absoluto (exacto, sin depender de TZ).
--
-- Match por grupo + pareja de equipos (en cualquier orden), tolerante a
-- variantes de nombre (ej. "Bosnia" ↔ "Bosnia y Herzegovina").
-- Fuentes: FIFA, ESPN, Al Jazeera, Wikipedia, El Tiempo, Noticias Caracol.
-- =====================================================================

with sched(grp, a, b, ts) as (values
  -- 11 jun
  ('A','México','Sudáfrica','2026-06-11 14:00:00-05'),
  ('A','Corea del Sur','Chequia','2026-06-11 21:00:00-05'),
  -- 12 jun
  ('B','Canadá','Bosnia','2026-06-12 14:00:00-05'),
  ('D','Estados Unidos','Paraguay','2026-06-12 20:00:00-05'),
  -- 13 jun
  ('B','Qatar','Suiza','2026-06-13 14:00:00-05'),
  ('C','Brasil','Marruecos','2026-06-13 17:00:00-05'),
  ('C','Haití','Escocia','2026-06-13 20:00:00-05'),
  ('D','Australia','Turquía','2026-06-13 23:00:00-05'),
  -- 14 jun
  ('E','Alemania','Curazao','2026-06-14 12:00:00-05'),
  ('F','Países Bajos','Japón','2026-06-14 15:00:00-05'),
  ('E','Costa de Marfil','Ecuador','2026-06-14 18:00:00-05'),
  ('F','Suecia','Túnez','2026-06-14 21:00:00-05'),
  -- 15 jun
  ('H','España','Cabo Verde','2026-06-15 11:00:00-05'),
  ('G','Bélgica','Egipto','2026-06-15 14:00:00-05'),
  ('H','Arabia Saudita','Uruguay','2026-06-15 17:00:00-05'),
  ('G','Irán','Nueva Zelanda','2026-06-15 20:00:00-05'),
  -- 16 jun
  ('I','Francia','Senegal','2026-06-16 14:00:00-05'),
  ('I','Irak','Noruega','2026-06-16 17:00:00-05'),
  ('J','Argentina','Argelia','2026-06-16 20:00:00-05'),
  ('J','Austria','Jordania','2026-06-16 23:00:00-05'),
  -- 17 jun
  ('K','Portugal','RD Congo','2026-06-17 12:00:00-05'),
  ('L','Inglaterra','Croacia','2026-06-17 15:00:00-05'),
  ('L','Ghana','Panamá','2026-06-17 18:00:00-05'),
  ('K','Uzbekistán','Colombia','2026-06-17 21:00:00-05'),
  -- 18 jun
  ('A','Chequia','Sudáfrica','2026-06-18 11:00:00-05'),
  ('B','Suiza','Bosnia','2026-06-18 14:00:00-05'),
  ('B','Canadá','Qatar','2026-06-18 17:00:00-05'),
  ('A','México','Corea del Sur','2026-06-18 20:00:00-05'),
  -- 19 jun
  ('D','Estados Unidos','Australia','2026-06-19 14:00:00-05'),
  ('C','Escocia','Marruecos','2026-06-19 17:00:00-05'),
  ('C','Brasil','Haití','2026-06-19 19:30:00-05'),
  ('D','Turquía','Paraguay','2026-06-19 23:00:00-05'),
  -- 20 jun
  ('E','Alemania','Costa de Marfil','2026-06-20 15:00:00-05'),
  ('F','Países Bajos','Suecia','2026-06-20 17:00:00-05'),
  ('E','Ecuador','Curazao','2026-06-20 19:00:00-05'),
  ('F','Túnez','Japón','2026-06-20 23:00:00-05'),
  -- 21 jun
  ('H','España','Arabia Saudita','2026-06-21 11:00:00-05'),
  ('G','Bélgica','Irán','2026-06-21 14:00:00-05'),
  ('H','Uruguay','Cabo Verde','2026-06-21 17:00:00-05'),
  ('G','Nueva Zelanda','Egipto','2026-06-21 20:00:00-05'),
  -- 22 jun
  ('J','Argentina','Austria','2026-06-22 12:00:00-05'),
  ('I','Francia','Irak','2026-06-22 16:00:00-05'),
  ('I','Noruega','Senegal','2026-06-22 19:00:00-05'),
  ('J','Jordania','Argelia','2026-06-22 22:00:00-05'),
  -- 23 jun
  ('K','Portugal','Uzbekistán','2026-06-23 12:00:00-05'),
  ('L','Inglaterra','Ghana','2026-06-23 15:00:00-05'),
  ('L','Panamá','Croacia','2026-06-23 18:00:00-05'),
  ('K','Colombia','RD Congo','2026-06-23 21:00:00-05'),
  -- 24 jun (última fecha grupos A,B,C — simultáneos)
  ('B','Suiza','Canadá','2026-06-24 14:00:00-05'),
  ('B','Bosnia','Qatar','2026-06-24 14:00:00-05'),
  ('C','Escocia','Brasil','2026-06-24 17:00:00-05'),
  ('C','Marruecos','Haití','2026-06-24 17:00:00-05'),
  ('A','Chequia','México','2026-06-24 20:00:00-05'),
  ('A','Sudáfrica','Corea del Sur','2026-06-24 20:00:00-05'),
  -- 25 jun
  ('F','Japón','Suecia','2026-06-25 10:00:00-05'),
  ('F','Túnez','Países Bajos','2026-06-25 10:00:00-05'),
  ('E','Curazao','Costa de Marfil','2026-06-25 15:00:00-05'),
  ('E','Ecuador','Alemania','2026-06-25 15:00:00-05'),
  ('D','Turquía','Estados Unidos','2026-06-25 21:00:00-05'),
  ('D','Paraguay','Australia','2026-06-25 21:00:00-05'),
  -- 26 jun
  ('I','Noruega','Francia','2026-06-26 14:00:00-05'),
  ('I','Senegal','Irak','2026-06-26 14:00:00-05'),
  ('H','Cabo Verde','Arabia Saudita','2026-06-26 19:00:00-05'),
  ('H','Uruguay','España','2026-06-26 19:00:00-05'),
  ('G','Egipto','Irán','2026-06-26 22:00:00-05'),
  ('G','Nueva Zelanda','Bélgica','2026-06-26 22:00:00-05'),
  -- 27 jun
  ('L','Panamá','Inglaterra','2026-06-27 16:00:00-05'),
  ('L','Croacia','Ghana','2026-06-27 16:00:00-05'),
  ('K','Colombia','Portugal','2026-06-27 18:30:00-05'),
  ('K','RD Congo','Uzbekistán','2026-06-27 18:30:00-05'),
  ('J','Argelia','Austria','2026-06-27 21:00:00-05'),
  ('J','Jordania','Argentina','2026-06-27 21:00:00-05')
)
update public.matches m
set scheduled_at = s.ts::timestamptz
from sched s
join public.teams ta
  on ta.group_letter = s.grp
 and (lower(ta.name) = lower(s.a) or lower(ta.name) like lower(s.a) || '%')
join public.teams tb
  on tb.group_letter = s.grp
 and (lower(tb.name) = lower(s.b) or lower(tb.name) like lower(s.b) || '%')
where m.stage = 'group'
  and m.group_letter = s.grp
  and (
    (m.home_team_id = ta.id and m.away_team_id = tb.id)
    or (m.home_team_id = tb.id and m.away_team_id = ta.id)
  );
