set search_path to ready2race, pg_catalog, public;

-- Probemodus mit schaltbaren Phasen statt der 3-Minuten-Schleife (Entwurf 2026-09-02,
-- docs/superpowers/specs/2026-09-02-livestream-regie-board-design.md): Die Regie klickt
-- eine Phase des Demo-Laufs an, der Server merkt sich Phase und Zeitpunkt, die Bühne rechnet
-- die Einblendfenster (Startliste, Zwischenzeiten, Ergebnis) ab diesem Zeitpunkt.
alter table stream_scene
    add column trial_phase       text      not null default 'PREPARING'
        check (trial_phase in ('PREPARING', 'COUNTDOWN', 'RUNNING', 'SPLIT', 'FINISH', 'FINISHED',
                               'RESULT', 'IDLE')),
    add column trial_phase_since timestamp;
