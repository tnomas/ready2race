-- Indizes ohne Lesenutzen entfernen (reine Schreibkosten).
--
-- Exakte Duplikate:
--   competition_registration_unique   = competition_deregistration_pkey (beide unique auf
--                                       competition_registration; nur ein Index, kein Constraint)
--   event_rating_category_event_rating_category_idx = event_rating_category_pkey (event, rating_category)
-- Durch einen eindeutigen Mehrspalten-Index mit gleicher führender Spalte abgedeckt:
--   competition_match_team_competition_match_idx  -> starting_position_unique_in_match (competition_match, start_number)
--   event_registration_event_idx                  -> event_registration_unique_for_club (event, club)
--   competition_registration_competition_idx      -> competition_registration_competition_club_name_key (competition, club, name)
--   idx_timing_sequence_entry_seq                 -> timing_start_sequence_entry_sequence_position_key (sequence, position)

set search_path to ready2race, pg_catalog, public;

drop index if exists competition_registration_unique;
drop index if exists event_rating_category_event_rating_category_idx;
drop index if exists competition_match_team_competition_match_idx;
drop index if exists event_registration_event_idx;
drop index if exists competition_registration_competition_idx;
drop index if exists idx_timing_sequence_entry_seq;
