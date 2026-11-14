-- Startnummer aus Meldungsnummer (ADR-0111, Entscheidung vom 14.11.2026).
--
-- Bisher war "Meldungsnummern nach Bootsnummern vergeben" nur ein Parameter der Fixierung: er
-- wirkte auf competition_registration.team_number und war danach vergessen. Die Rundenanlage läuft
-- später und vergab die Startnummer im Lauf (competition_match_team.start_number) weiter nach
-- Setzposition - das Boot trug deshalb fast nie die Zahl, die die Anzeigen neben ihm zeigen.
--
-- Die Spalte hält den Wunsch dauerhaft an der Veranstaltung (die Fixierung ist veranstaltungsweit):
-- Jede Fixierung schreibt sie (mit Schalter true, ohne false). Ist sie gesetzt, übernimmt die
-- Rundenanlage (erste Runde, Folgerunden, Folgerunden-Automatik) die Meldungsnummer als
-- Startnummer, und der RaceClocker-Abgleich schreibt keine Listenpositionen mehr in die
-- Startnummern. Bestehende Läufe ändert die Migration nicht.
--
-- Vorgabe false: Für alle bestehenden Veranstaltungen bleibt alles, wie es war. event_view liest
-- die Spalte (afterMigrate.sql).

set search_path to ready2race, pg_catalog, public;

alter table event
    add column team_numbers_as_start_numbers boolean not null default false;
