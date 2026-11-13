-- Fremdschlüssel der Durchführung, nach denen heiße Abfragen filtern, bekommen einen Index.
--
-- competition_match_team.competition_registration: korrelierte exists-Unterabfrage je Zeile der
-- Meldungslisten (competitionRgistrationReferenced), Team-Notizen des Schiedsrichter-Dashboards und
-- die View participant_for_event. Bisher je Aufruf ein Seq-Scan über alle Startplätze aller
-- Veranstaltungen.
-- substitution.competition_registration / participant_in: dieselbe Meldungsliste sowie
-- „Mein Event" (öffentlich).
--
-- Ohne concurrently, weil Flyway jede Migration in einer Transaktion ausführt; die Tabellen sind
-- klein genug für eine kurze Sperre beim Deploy.

set search_path to ready2race, pg_catalog, public;

create index if not exists competition_match_team_competition_registration_idx
    on competition_match_team (competition_registration);

create index if not exists substitution_competition_registration_idx
    on substitution (competition_registration);

create index if not exists substitution_participant_in_idx
    on substitution (participant_in);
