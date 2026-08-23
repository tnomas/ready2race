-- Neuer Postentyp ANZEIGE: ein rein lesender Bildschirm-Posten (Startschiedsrichter- oder
-- Athleten-Anzeige) wird ein eigener Posten mit eigenem Link und eigenem Geräte-Token, statt den
-- Anzeige-Link an einen START-Posten anzuhängen. So kann eine Anzeige einzeln widerrufen werden,
-- ohne den Erfassungs-Link des Startpostens mitzureißen.
--
-- Einen Check-Constraint erweitern heißt in Postgres: alten droppen, neu anlegen -- der Wertevorrat
-- steht im Constraint selbst, ALTER kann ihn nicht ergänzen. Der Name ist der von Postgres
-- automatisch vergebene (Spalte "type" der Tabelle aus V202608171400).
alter table timing_station
    drop constraint timing_station_type_check;

alter table timing_station
    add constraint timing_station_type_check
        check (type in ('START', 'SPLIT', 'FINISH', 'ANZEIGE'));

-- Welche START-Station die Anzeige spiegelt; null = alle Startsequenzen der Veranstaltung.
-- on delete set null: fällt der Startposten weg, fällt die Anzeige auf "alle" zurück, statt zu
-- verschwinden -- ein Bildschirm hängt physisch weiter da und soll weiter etwas zeigen.
alter table timing_station
    add column linked_station uuid references timing_station on delete set null;

-- Nur eine ANZEIGE kann einen Posten spiegeln. Dass die verknüpfte Station zur selben
-- Veranstaltung gehört und vom Typ START ist, prüft der Service (dasselbe Muster wie
-- TimingConfigService.ensureRaceBelongsToEvent: ein zusammengesetzter Fremdschlüssel über
-- (event, id) wäre den übrigen Tabellen dieses Projekts fremd).
alter table timing_station
    add constraint timing_station_linked_only_for_anzeige
        check (linked_station is null or type = 'ANZEIGE');
