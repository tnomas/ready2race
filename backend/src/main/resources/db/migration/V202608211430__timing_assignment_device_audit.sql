-- Klick-Zuordnung am Zielposten: Marken werden künftig direkt am geteilten Gerät (Geräte-Token,
-- keine Sitzung) einem Boot zugeordnet und bei Verklicken umgehängt. Hinter so einer Änderung
-- steht kein app_user -- created_by/updated_by blieben null, und die Revisionsspur wüsste nicht,
-- WER umgehängt hat. Diese Spalten halten fest, WELCHES Gerät es war (Anschluss an die
-- Marken-Audit-Richtung von V202608171800, die updated_at/updated_by an der Marke nachrüstete).
--
-- on delete set null: Tokens werden widerrufen, nicht gelöscht (siehe TimingDeviceTokenService)
-- -- fällt doch einmal eines weg, bleibt die Zuordnung selbst unangetastet.
alter table timing_assignment
    add column created_by_device uuid references timing_device_token on delete set null,
    add column updated_by_device uuid references timing_device_token on delete set null;
