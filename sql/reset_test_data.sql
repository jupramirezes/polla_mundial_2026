-- =====================================================================
-- RESET de datos de prueba (NO es una migración — herramienta puntual)
-- =====================================================================
-- Borra TODOS los pronósticos y resultados oficiales de TODOS los usuarios.
-- NO borra: usuarios, equipos, partidos (estructura del torneo).
-- Después de correr esto, la BD queda lista para que arranquen los amigos.
--
-- ⚠️  CUIDADO: esto es irreversible.
-- =====================================================================

-- Pronósticos de todos los usuarios
delete from public.predictions_matches;
delete from public.predictions_knockout_matches;
delete from public.predictions_qualifiers;
delete from public.predictions_group_standings;
delete from public.predictions_top_positions;
delete from public.predictions_top_scorer;

-- Resetear lock del bracket (que puedan volver a llenar)
update public.profiles set bracket_locked_at = null;

-- Resetear resultados oficiales (admin)
update public.matches
   set home_score = null,
       away_score = null,
       winner_team_id = null,
       result_locked = false;

delete from public.official_qualifiers;
delete from public.official_top_positions;
delete from public.official_top_scorers;

-- Resetear cache de puntajes
update public.user_scores
   set total = 0,
       group_match_winner = 0,
       group_match_exact = 0,
       group_standings = 0,
       qual_r32 = 0, qual_r16 = 0, qual_qf = 0, qual_sf = 0, qual_final = 0,
       knockout_match_winner = 0,
       knockout_match_exact = 0,
       top_position_1 = 0, top_position_2 = 0, top_position_3 = 0, top_position_4 = 0,
       top_scorer = 0,
       group_matches_total = 0,
       group_winners_hit = 0,
       group_exact_hit = 0,
       knockout_matches_scored = 0,
       knockout_winners_hit = 0,
       knockout_exact_hit = 0;
