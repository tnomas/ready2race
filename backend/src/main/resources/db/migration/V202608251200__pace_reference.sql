set search_path to ready2race, pg_catalog, public;

-- Womit eine Sportart Tempo ausdrückt. Im Rudern die Zeit pro 500 m, im Laufen die Zeit pro
-- Kilometer, im Radsport Kilometer pro Stunde. Veranstaltungsübergreifend gepflegt wie die
-- übrigen Wettkampf-Komponenten (Kategorien, Gebühren, Dateiformate), weil eine Sportart sich
-- nicht je Regatta ändert.
create table pace_reference
(
    id               uuid      primary key,
    -- Der Name ist das, worüber am Wettkampf ausgewählt wird -- doppelt wäre er nicht mehr
    -- unterscheidbar. Gleiche Regel wie bei timing_mode und timing_station.
    name             text      not null unique,
    -- TIME_PER_DISTANCE: "wie lange für n Meter". DISTANCE_PER_TIME: "wie weit in einer Stunde".
    -- Zwei Ausprägungen statt einer freien Formel: Jede Sportart, die uns einfällt, fällt in eine
    -- der beiden, und zwei Fälle lassen sich prüfen -- eine Formel, die niemand liest, nicht.
    mode             text      not null check (mode in ('TIME_PER_DISTANCE', 'DISTANCE_PER_TIME')),
    -- Bezugsstrecke in Metern: bei TIME_PER_DISTANCE die Strecke, auf die gerechnet wird
    -- (500 im Rudern), bei DISTANCE_PER_TIME die Einheit der Ausgabe (1000 = km/h).
    reference_meters int       not null check (reference_meters > 0),
    created_at       timestamp not null,
    created_by       uuid      references app_user on delete set null,
    updated_at       timestamp not null,
    updated_by       uuid      references app_user on delete set null
);
