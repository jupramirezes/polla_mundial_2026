-- Alinea las horas de TODAS las eliminatorias (R32..Final) al horario oficial
-- de ESPN (UTC). Mapeo determinístico por slots/feeders (re-confirma structure.ts).
-- Los que ya estaban bien no cambian. Generado por make_ko_sql.py.
with sched(code, ts) as (values
  ('R32-01', '2026-06-28 19:00:00+00'::timestamptz),
  ('R32-02', '2026-06-29 20:30:00+00'::timestamptz),
  ('R32-03', '2026-06-30 01:00:00+00'::timestamptz),
  ('R32-04', '2026-06-29 17:00:00+00'::timestamptz),
  ('R32-05', '2026-06-30 21:00:00+00'::timestamptz),
  ('R32-06', '2026-06-30 17:00:00+00'::timestamptz),
  ('R32-07', '2026-07-01 01:00:00+00'::timestamptz),
  ('R32-08', '2026-07-01 16:00:00+00'::timestamptz),
  ('R32-09', '2026-07-02 00:00:00+00'::timestamptz),
  ('R32-10', '2026-07-01 20:00:00+00'::timestamptz),
  ('R32-11', '2026-07-02 23:00:00+00'::timestamptz),
  ('R32-12', '2026-07-02 19:00:00+00'::timestamptz),
  ('R32-13', '2026-07-03 03:00:00+00'::timestamptz),
  ('R32-14', '2026-07-03 22:00:00+00'::timestamptz),
  ('R32-15', '2026-07-04 01:30:00+00'::timestamptz),
  ('R32-16', '2026-07-03 18:00:00+00'::timestamptz),
  ('R16-01', '2026-07-04 21:00:00+00'::timestamptz),
  ('R16-02', '2026-07-04 17:00:00+00'::timestamptz),
  ('R16-03', '2026-07-05 20:00:00+00'::timestamptz),
  ('R16-04', '2026-07-06 00:00:00+00'::timestamptz),
  ('R16-05', '2026-07-06 19:00:00+00'::timestamptz),
  ('R16-06', '2026-07-07 00:00:00+00'::timestamptz),
  ('R16-07', '2026-07-07 16:00:00+00'::timestamptz),
  ('R16-08', '2026-07-07 20:00:00+00'::timestamptz),
  ('QF-01', '2026-07-09 20:00:00+00'::timestamptz),
  ('QF-02', '2026-07-10 19:00:00+00'::timestamptz),
  ('QF-03', '2026-07-11 21:00:00+00'::timestamptz),
  ('QF-04', '2026-07-12 01:00:00+00'::timestamptz),
  ('SF-01', '2026-07-14 19:00:00+00'::timestamptz),
  ('SF-02', '2026-07-15 19:00:00+00'::timestamptz),
  ('TP-01', '2026-07-18 21:00:00+00'::timestamptz),
  ('FINAL-01', '2026-07-19 19:00:00+00'::timestamptz)
)
update public.matches m
set scheduled_at = s.ts
from sched s
where m.external_code = s.code;
