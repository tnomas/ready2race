set search_path to ready2race, pg_catalog, public;

-- Der Schalter "Werden Rundenzeiten erwartet?" hat nie etwas verzweigt -- er erzeugte zwei
-- Beschriftungen und sonst nichts. Ob es Zwischenzeiten gibt, sagt seit V202608251220 die einzige
-- Stelle, die es wirklich weiß: ob der Wettkampf SPLIT-Posten auf der Strecke hat.
--
-- Damit beschreibt der Zeitnahmetyp nur noch, WIE gestartet wird (Startart, Intervall, Vorlauf,
-- Tonplan). WIE gemessen wird, sagen die Posten am Wettkampf.
alter table timing_mode
    drop column with_laps;
