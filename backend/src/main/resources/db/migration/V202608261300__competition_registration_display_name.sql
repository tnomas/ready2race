set search_path to ready2race, pg_catalog, public;

-- Der frei vergebene Name einer Mannschaft - "RG Eckernförde/Kappeln" statt der Vereinskette.
--
-- Ausgangslage: Seit dem 09.08.2026 zeigt jede Anzeige die Vereine, die die Crew traegt, als
-- Kette ("Ruderverein Eckernfoerde / Ruderclub Kappeln"). Das beantwortet die Frage des
-- Schiedsrichters (welche Boote sind das?), aber nicht die des Meldenden: Eine Renngemeinschaft
-- fuehrt einen NAMEN, unter dem sie ausgeschrieben, aufgerufen und geehrt wird, und der ist
-- kuerzer und anders geschrieben als die Aneinanderreihung ihrer Vereine.
--
-- Bewusst eine ZWEITE Spalte neben `competition_registration.name`, nicht dessen Uebernahme:
-- `name` ist der automatische Zaehler ("#1", "#2"), den CompetitionRegistrationService beim
-- Anlegen vergibt und beim Loeschen der Reihe nach neu vergibt. Eine Handeingabe darin waere
-- beim naechsten geloeschten Boot desselben Vereins still ueberschrieben.
alter table competition_registration
    add column display_name text;
