set search_path to ready2race, pg_catalog, public;

-- Welche Posten dieser Wettkampf passiert und bei welchem Meter. Der Posten selbst bleibt der
-- Veranstaltung -- er ist eine Person mit einem Tablet, keine Eigenschaft eines Wettkampfs.
-- Getrennt nötig, weil derselbe Posten für zwei Wettkämpfe verschieden weit weg steht: Die Mole
-- liegt für die Langstrecke bei 3000 m und für den Sprint bei 250 m.
--
-- Am Wettkampf und nicht an competition_properties: Ein Posten gehört einer Veranstaltung, eine
-- Wettkampf-Vorlage keiner -- eine Vorlage könnte auf diese Zeilen gar nicht zeigen.
create table competition_timing_station
(
    id              uuid      primary key,
    competition     uuid      not null references competition on delete cascade,
    timing_station  uuid      not null references timing_station on delete cascade,
    -- Der Startposten steht bei 0, der Zielposten bei der Gesamtdistanz, dazwischen die
    -- Zwischenzeit-Posten. Die Reihenfolge der Zwischenzeiten ergibt sich aus DIESEM Wert, nicht
    -- aus timing_station.sorting: Die Sortierung ordnet die Posten im Leitstand, die Distanz
    -- ordnet sie auf der Strecke -- und nur letztere trägt die Rechnung.
    distance_meters int       not null check (distance_meters >= 0),
    created_at      timestamp not null,
    created_by      uuid      references app_user on delete set null,
    updated_at      timestamp not null,
    updated_by      uuid      references app_user on delete set null,
    unique (competition, timing_station)
);

create index on competition_timing_station (competition);
