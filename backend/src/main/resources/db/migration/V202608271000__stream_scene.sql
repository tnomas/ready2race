-- Eigene Stream-Domäne für die Livestream-Anbindung (Wirecast): transparente
-- Vollbild-Szenen statt der bisherigen Board-Kachel mit sieben Chroma-Modi. Eine Szene ist
-- eine URL + ein Token, hinter der Wirecast als Web-Display-Quelle eine Grafik-Bühne
-- abgreift; das Kontroll-Panel der Streamer sitzt daneben und sieht über denselben
-- Push-Kanal denselben Stand. Details und Begründungen:
-- docs/superpowers/specs/2026-08-27-livestream-overlay-design.md
create table stream_scene
(
    id                uuid primary key default gen_random_uuid(),
    event             uuid    not null references event (id) on delete cascade,
    name              text    not null,
    background        text    not null default 'TRANSPARENT', -- TRANSPARENT | CHROMA
    chroma_color      text,                                   -- nur bei CHROMA belegt
    safe_area_percent int     not null default 0,
    trial_mode        boolean not null default false,
    created_at        timestamp not null,
    updated_at        timestamp not null
);

-- Je Szene und Grafiktyp genau eine Konfigurationszeile (Platz, Größe, typspezifische
-- Einstellungen als jsonb). Der Automatik-Regelwerk-Resolver liest diese Zeilen, schreibt
-- sie aber nie selbst -- Platzierung ist Sache der Szenen-Verwaltung (Einrichtung), nicht
-- der Regie im Kontroll-Panel.
create table stream_scene_graphic
(
    id        uuid primary key default gen_random_uuid(),
    scene     uuid    not null references stream_scene (id) on delete cascade,
    type      text    not null, -- STARTLIST|CLOCK|LAPS|RESULT|FINISH_TICKER|NEXT_UP|SCHEDULE|COURSE_IMAGE
    enabled   boolean not null default false,
    placement text    not null,
    size      text    not null default 'NORMAL', -- COMPACT | NORMAL
    settings  jsonb   not null default '{}',
    unique (scene, type)
);

-- Regie-Eingriffe aus dem Kontroll-Panel: AUTO ist der Normalfall und hat gar keine Zeile
-- hier, erst FORCED_ON/FORCED_OFF legen eine an. In der DB statt im Speicher, weil ein
-- Server-Neustart am Regattatag keine laufende Regie vergessen darf. expires_at trägt den
-- Auto-Out-Timer der Handschaltung; ist er abgelaufen, fällt die Grafik beim nächsten
-- Resolver-Lauf auf AUTO zurück -- ein eigener Aufräum-Job ist dafür nicht nötig.
create table stream_override
(
    id           uuid primary key default gen_random_uuid(),
    scene        uuid      not null references stream_scene (id) on delete cascade,
    graphic_type text      not null,
    state        text      not null, -- FORCED_ON | FORCED_OFF  (AUTO = Zeile fehlt)
    match        uuid      references competition_match on delete cascade,
    expires_at   timestamp,
    created_at   timestamp not null,
    unique (scene, graphic_type)
);

-- Drittes Ziel der vereinheitlichten Token-Infrastruktur (vgl. V202608250900): Auch eine
-- Szene braucht einen geteilten Link mit Geräte-Token, denn Wirecast kann sich nicht
-- anmelden -- genau wie beim Board davor bekommt sie keine eigene Token-Tabelle, sondern
-- ein drittes mögliches Ziel derselben Zeile. Der Constraint wandert deshalb von
-- "Posten oder Board" zu "Posten oder Board oder Szene", weiterhin genau eines.
alter table timing_device_token
    add column stream_scene uuid references stream_scene (id) on delete cascade;
alter table timing_device_token
    drop constraint timing_device_token_exactly_one_target;
alter table timing_device_token
    add constraint timing_device_token_exactly_one_target
        check (num_nonnulls(station, board, stream_scene) = 1);
create index if not exists idx_timing_device_token_stream_scene
    on timing_device_token (stream_scene);
