-- Der Fehlstart (Rückruf am Startposten) hinterlässt am Lauf eine Spur.
--
-- Bis hierher war der Rückruf nur eine WebSocket-Nachricht an die Zeitnahme-Boards: wer den
-- Kanal nicht hält (das Schiedsrichter-Dashboard liest den gecachten Poll-Endpunkt und hängt am
-- Veranstaltungs-Push), erfuhr davon nichts - der Lauf sprang bloß von „läuft" zurück auf „in
-- Vorbereitung", ohne zu sagen, warum. Der Zeitstempel macht den Rückruf zu einem Stand, den
-- jede Anzeige über den gewöhnlichen Datenweg mitbekommt.
--
-- Gesetzt vom Rückruf (TimingService.falseStart), geleert vom nächsten Ist-Start des Laufs
-- (Zeitnahme-Stempel oder „Läuft"-Klick) und von einer gewöhnlichen Versuchs-Rücknahme - ein
-- zurückgenommener Versuch ist kein Fehlstart, und ein neuer Start erledigt den alten Rückruf.
alter table competition_match
    add column false_start_at timestamp;
