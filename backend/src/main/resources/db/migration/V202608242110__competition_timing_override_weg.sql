set search_path to ready2race, pg_catalog, public;

-- Das Zeitnahme-System und die beiden Dateiformate gehören zur Veranstaltung, nicht zum
-- Wettkampf: Zwei Zeitnahme-Softwares in einer Regatta gibt es nicht, und alle Wettkämpfe
-- exportieren und importieren dieselben Spalten. Die Möglichkeit, davon je Wettkampf
-- abzuweichen, erzeugte nur Zustände, die man erklären, anzeigen und beim Ändern der
-- Voreinstellung im Auge behalten musste (die ganze Abweichungsliste existierte dafür).
--
-- Das Rennen zieht in den Zeitnahmeprofil-Baum um (V202608242100) und braucht seine Spalte
-- nicht mehr.
--
-- Datenverlust, bewusst: Die vier Spalten werden mit ihrem Inhalt verworfen, nicht nur
-- umgezogen. Ein Rollback dieser Migration holt die Werte nicht zurück, das kann nur ein
-- Dump von vorher. Vor dem Ausrollen auf einen produktiven Bestand einmal prüfen, was
-- betroffen ist:
--
--   select c.id, cp.identifier, c.timing_system, c.startlist_config, c.result_import_config
--   from competition c join competition_properties cp on cp.competition = c.id
--   where c.timing_system is not null or c.startlist_config is not null
--      or c.result_import_config is not null;
--
-- Trägt diese Abfrage Zeilen, verliert die betroffene Veranstaltung mit dieser Migration
-- den automatischen Ergebnis-Abruf, die Posten-Startliste der internen Zeitnahme oder die
-- abweichenden Dateiformate an genau diesen Wettkämpfen, ohne dass danach irgendwo ein
-- Fehler auftaucht — der Abruf-Job fragt seither nur noch event.timing_system ab.
alter table competition
    drop column raceclocker_race,
    drop column timing_system,
    drop column startlist_config,
    drop column result_import_config;

-- Die alte Zuordnungstabelle der Zeitnahmetypen: ihr Inhalt steht seit V202608242100 im
-- Profil-Baum, und ab diesem Task benutzt sie kein Code mehr.
drop table timing_mode_assignment;
