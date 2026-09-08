-- Geräte-Tokens (Posten-, Board- und Szenen-Links) bekommen ein Ablaufdatum.
--
-- Ein geteilter Link ist Bearer-Material und lag bisher unbegrenzt in der Zeit: ein Foto der
-- Anzeige-URL vom Regattatag öffnete die Anzeige auch ein Jahr später noch. Link-Tokens laufen
-- deshalb ab (Ende des letzten Veranstaltungstags plus ein Tag, sonst 30 Tage nach dem
-- Ausstellen); manuell ausgestellte Hardware-Tokens bleiben ohne Ablauf (null), weil sie in
-- Gerätekonfigurationen liegen, die niemand nach jeder Regatta neu einspielt.
--
-- Bestehende Zeilen behalten null und laufen damit nicht ab - ein rückwirkendes Ablaufdatum
-- risse laufende Anzeigen ab. Der nächste Klick auf „Link teilen" nach einem Widerruf stellt ein
-- Token mit Ablauf aus.
alter table timing_device_token
    add column expires_at timestamp;

-- Die Tabelle wird je Posten (Link-Wiederverwendung) und je Veranstaltung (Geräte-Reiter)
-- gelesen; bisher trugen nur board und stream_scene einen Index.
create index if not exists idx_timing_device_token_station on timing_device_token (station);
create index if not exists idx_timing_device_token_event on timing_device_token (event);
