set search_path to ready2race, pg_catalog, public;

-- Das Zeitnahme-System und die beiden Dateiformate gehören zur Veranstaltung, nicht zum
-- Wettkampf: Zwei Zeitnahme-Softwares in einer Regatta gibt es nicht, und alle Wettkämpfe
-- exportieren und importieren dieselben Spalten. Die Möglichkeit, davon je Wettkampf
-- abzuweichen, erzeugte nur Zustände, die man erklären, anzeigen und beim Ändern der
-- Voreinstellung im Auge behalten musste (die ganze Abweichungsliste existierte dafür).
--
-- Das Rennen zieht in den Zeitnahmeprofil-Baum um (V202608242100) und braucht seine Spalte
-- nicht mehr.
alter table competition
    drop column raceclocker_race,
    drop column timing_system,
    drop column startlist_config,
    drop column result_import_config;

-- Die alte Zuordnungstabelle der Zeitnahmetypen: ihr Inhalt steht seit V202608242100 im
-- Profil-Baum, und ab diesem Task benutzt sie kein Code mehr.
drop table timing_mode_assignment;
