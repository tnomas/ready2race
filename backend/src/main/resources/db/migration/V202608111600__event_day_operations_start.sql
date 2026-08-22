set search_path to ready2race, pg_catalog, public;

-- Ab wann an diesem Veranstaltungstag vor Ort gearbeitet wird (Zyklus 2026-08-11, "die
-- Veranstaltungsauswahl der Helfer-App eingrenzen").
--
-- Die Helfer-App bot bisher jede jemals angelegte Veranstaltung als gleich aussehenden Knopf an,
-- nur mit dem Namen. Am 11.08.2026 wurde dabei die Regatta von 2025 erwischt; die Bandvergabe
-- landete still in der falschen Veranstaltung. Dieses Feld traegt das Fenster, innerhalb dessen
-- eine Veranstaltung in der App ueberhaupt zur Wahl steht.
--
-- Am TAG und nicht an der Veranstaltung: Die Akkreditierung des ersten Renntages findet oft am
-- Vorabend statt -- dann ist das hier schlicht ein frueherer Zeitstempel als `date`.
--
-- Der Name meidet "Akkreditierung" mit Absicht. In der App haengen auch Bedingungspruefung und
-- Check-in/-out daran; "Betrieb" deckt alles ab, was an dem Tag vor Ort anfaengt.
--
-- Nullbar und ohne Nachtrag: Ist nichts gepflegt, zaehlt der Tag ab 00:00 (der Rueckfall steckt
-- in EventRepo). Ein Pflichtfeld haette am Regattamorgen eine leere Auswahl bedeutet, bis jemand
-- fuer jeden Tag etwas eintraegt.
alter table event_day
    add column operations_start timestamp;
