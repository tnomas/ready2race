-- Startsequenz anhalten: der Zustand PAUSED und die zwei Zeitwerte, die das Fortsetzen braucht.
--
-- Warum überhaupt Spalten und kein angehaltener Timer: gefeuert wird serverseitig gegen die
-- GEPLANTEN Zeitpunkte der Einträge (siehe plannedStartMillis in Conversions.kt), es gibt also
-- gar keine laufende Uhr, die man anhalten könnte. Eine Pause ist deshalb ein Zustand plus eine
-- Verschiebung: beim Fortsetzen wandert die ganze Kette um die Pausendauer nach hinten, das
-- Intervall zwischen den Booten bleibt dabei unverändert.
--
-- paused_at_millis   = Beginn der LAUFENDEN Pause (Server-Epoch-Millis), leer sobald fortgesetzt.
-- pause_shift_millis = Summe ALLER bisherigen Pausen dieser Sequenz. Bewusst getrennt von
--                      started_at_millis, damit der tatsächliche Startzeitpunkt der Sequenz
--                      ehrlich bleibt (Boards und Auswertung lesen ihn als das, was er ist) und
--                      die Verschiebung nachvollziehbar danebensteht, statt sich still in den
--                      Start hineinzurechnen.

alter table timing_start_sequence
    add column paused_at_millis   bigint,
    add column pause_shift_millis bigint not null default 0;

-- Der Zustand liegt als Textspalte mit Prüfbedingung; PAUSED muss dort ausdrücklich erlaubt
-- werden. Der Name ist der von Postgres vergebene Standardname der Inline-Spaltenbedingung aus
-- V202608180030; „if exists" hält die Migration auch auf einer Datenbank durch, in der sie
-- (etwa nach einem Handeingriff) anders heißt.
alter table timing_start_sequence
    drop constraint if exists timing_start_sequence_state_check;
alter table timing_start_sequence
    add constraint timing_start_sequence_state_check
        check (state in ('ARMED', 'RUNNING', 'PAUSED', 'DONE', 'ABORTED'));

-- Eine pausierte Sequenz belegt ihren Posten weiter - sie soll ja gleich weiterlaufen. Der
-- partielle Eindeutigkeitsindex aus V202608180815 muss PAUSED deshalb mitzählen, sonst ließe
-- sich während der Pause eine zweite Sequenz auf demselben Startposten scharfstellen, und beide
-- feuerten anschließend konkurrierende Startmarken auf dieselbe Startlinie.
drop index if exists uq_timing_sequence_active_station;
create unique index if not exists uq_timing_sequence_active_station
    on timing_start_sequence (station)
    where state in ('ARMED', 'RUNNING', 'PAUSED');
