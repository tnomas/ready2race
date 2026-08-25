set search_path to ready2race, pg_catalog, public;

-- Wozu diese Zwischenzeit gehört, in Metern. Die Zwischenzeit trägt es selbst, statt es über den
-- Postennamen nachzuschlagen: Der Name ist frei vergeben und änderbar, und die Zuordnung eines
-- Postens kann sich ändern, nachdem die Zeit schon gelaufen ist -- eine gespeicherte Zeit soll
-- dann nicht rückwirkend eine andere Distanz bekommen.
--
-- Null bei den RaceClocker-Rundenzeiten: Deren Spaltennamen kommen aus dem Fremdsystem und
-- gehören keinem Posten. Dort gibt es folglich kein Tempo, und die Anzeige lässt die Stelle leer,
-- statt eine Zahl zu erfinden.
alter table competition_match_team_lap
    add column distance_meters int
        check (distance_meters is null or distance_meters >= 0);
