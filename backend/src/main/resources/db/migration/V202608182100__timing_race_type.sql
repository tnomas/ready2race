-- Renntypen: wiederverwendbare Lauf-Vorlagen je Veranstaltung ("Zeitfahren", "Finale Massenstart",
-- "Show-Lauf"). Eine Runde des Wettkampf-Setups bekommt einen Renntyp zugewiesen; die Bretter lesen
-- daraus ab, welcher Modus fuer den naechsten Lauf gilt, statt ihn jedes Mal von Hand zu setzen.
create table if not exists timing_race_type
(
    id              uuid primary key,
    event           uuid      not null references event on delete cascade,
    name            text      not null,
    -- Ein untimed Renntyp ("Show-Lauf") wird gefahren, aber nicht gemessen.
    timed           boolean   not null default true,
    start_mode      text      not null check (start_mode in ('MASS', 'INTERVAL')),
    -- Nur fuer INTERVAL sinnvoll; null heisst "die Sequenz fragt wie bisher nach".
    interval_millis bigint,
    lead_in_millis  bigint,
    sorting         int       not null default 0,
    created_at      timestamp not null,
    created_by      uuid references app_user on delete set null,
    updated_at      timestamp not null,
    updated_by      uuid references app_user on delete set null,
    unique (event, name)
);

create index if not exists idx_timing_race_type_event on timing_race_type (event);

-- Die Zuweisung sitzt auf der Runde, nicht auf dem einzelnen Match: alle Laeufe einer Runde werden
-- gleich gestartet. `on delete set null`, weil das Loeschen eines Renntyps das Setup nicht
-- beschaedigen darf - die Runde verliert nur ihre Vorbelegung.
alter table competition_setup_round
    add column if not exists timing_race_type uuid references timing_race_type on delete set null;
