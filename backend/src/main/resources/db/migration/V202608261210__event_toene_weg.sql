set search_path to ready2race, pg_catalog, public;

-- Die drei Töne sind seit V202608261200 in den Ton-Sätzen und werden seit dem Umbau des Lesewegs
-- von dort gelesen — je Partie über ihren Zeitnahmetyp, mit dem Vorgabesatz als Rückfall für
-- Erfassungen ohne Zuordnung. Erst jetzt dürfen sie fallen: Zwischen den beiden Migrationen hätte
-- sonst ein Stand ohne Töne gestanden.
--
-- V202608261200 hat sie in JEDEN Satz kopiert — in den Vorgabesatz jeder Veranstaltung mit Typen
-- ODER eigenen Tönen und in jeden typeigenen Satz. Ohne Satz bleiben nur Veranstaltungen ohne
-- Typen UND ohne eigene Töne; dort stand in allen drei Spalten null, also der eingebaute Standard,
-- und der gilt auch ohne Satz weiter. Es geht deshalb kein Ton verloren.
--
-- Ein Zurück gibt es nicht: Der Drop nimmt die Werte mit. Der Beleg dafür, dass sie vorher
-- angekommen sind, steht in TimingToneSetMigrationTest.
alter table event
    drop column timing_finish_tone,
    drop column timing_split_tone,
    drop column timing_false_start_tone;
