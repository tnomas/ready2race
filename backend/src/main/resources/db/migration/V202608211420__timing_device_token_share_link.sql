-- Posten-Links ohne Handarbeit: ein Klick auf "Link teilen" stellt automatisch ein Geräte-Token
-- aus, und ein zweiter Klick liefert DENSELBEN Link zurück, statt ein weiteres Token zu erzeugen
-- (Wiederverwendung statt Inflation -- sonst sammelt der Geräte-Reiter mit jedem Klick Leichen).
--
-- Dafür muss der Klartext wiederauffindbar sein. Für von Hand ausgestellte Hardware-Tokens gilt
-- weiter das Nur-Hash-Modell (der Klartext existiert nur in der Ausstell-Antwort); für
-- automatisch ausgestellte Link-Tokens wird der Klartext hier bewusst mitgespeichert:
--  * Der Link IST das Credential -- wer ihn teilt, gibt den Klartext ohnehin aus der Hand.
--  * Die Tokens sind eng gescoped (eine Veranstaltung, ein Posten, Lesen + Erfassen) und
--    jederzeit im Geräte-Reiter widerrufbar.
--  * Wer diese Spalte lesen kann, hat die Datenbank -- und damit längst mehr als diese Tokens.
--
-- Die Spalte ist zugleich das Kennzeichen "automatisch ausgestellt": not null <=> Link-Token.
-- Die Validierung läuft unverändert über token_hash; diese Spalte wird nie zum Prüfen benutzt.
alter table timing_device_token
    add column share_link_token text;
