-- Zeitnahme- und Livestream-Teststand: eine eigene kleine Regatta, an der die INTERNE Zeitnahme
-- (Posten, Zeitnahmeprofile, Ton-Sätze, Startsequenzen, Marken, Zuordnungen, offizielle Zeiten,
-- Zwischenzeiten) und die Stream-Domäne (Szenen, Grafiken, Geräte-Token) ohne Vorarbeit von Hand
-- durchgespielt werden können.
--
-- Konventionen wie in docs/superpowers/seeds/README.md: UUID-Präfix `71ed` für alle Zeilen,
-- Cleanup-Block ganz vorn (nur `71ed%`), `set search_path` + `set time zone 'Europe/Berlin'`.
--
-- ==========================================================================================
-- WAS DER SEED AUFBAUT
-- ==========================================================================================
--
-- Veranstaltung „Zeitnahme- und Streamtest" (published, timing_system = INTERN,
-- timing_auto_apply = an, timing_precision = ZEHNTEL), EIN Renntag: HEUTE.
-- Sechs Vereine, 16 Boote, 32 Personen, drei Wettkämpfe:
--
--   W1  CF 2x    Frauen-Doppelzweier      500 m   Vorlauf -> Finale
--   W2  CM 2x    Männer-Doppelzweier      500 m   Vorlauf -> Finale
--   W3  CMix 2x  Mixed-Doppelzweier      6000 m   Zeitfahren -> Finale
--
-- Alle Zeiten sind RELATIV zum Einspielzeitpunkt gerechnet (Anker `pg_temp.t`/`pg_temp.ms`).
-- Der Seed darf also zu jeder Tageszeit eingespielt werden und ergibt immer dieselbe Lage:
--
--   Lauf              Zustand              Zeitpunkt        wofür
--   ----------------  -------------------  ---------------  ------------------------------------
--   W3 Zeitfahren     BEENDET + KLÄRUNG    vor 100 min      „Vorläufig" auf der Ergebnisgrafik
--   W1 Vorlauf        BEENDET              vor  60 min      jüngstes Ergebnis -> RESULT on air
--   W2 Vorlauf        LÄUFT                seit 110 s       Uhr, Zwischenzeiten, Einlauf-Ticker
--   W1 Finale         IN VORBEREITUNG      seit gerade eben Startliste, scharfe Startsequenz
--   W2 Finale         ANSTEHEND            in  35 min       Tagesprogramm / Nächstes Rennen
--   W3 Finale         ANSTEHEND            in  55 min       Tagesprogramm
--
-- ==========================================================================================
-- ZEITNAHME
-- ==========================================================================================
--
-- Posten (timing_station):
--   Start          START     ONETOUCH
--   Mole           SPLIT     ONETOUCH   -- Sprint bei 250 m, Langstrecke bei 4000 m
--   Boje Nord      SPLIT     ONETOUCH   -- nur Langstrecke, 2000 m
--   Ziel           FINISH    ARMED      -- Scharfschaltung, `armed` steht auf aus
--   Startanzeige   ANZEIGE   (spiegelt „Start")
--
-- Derselbe Posten steht je Wettkampf auf einem anderen Meter -- genau der Fall, für den es
-- `competition_timing_station` gibt (Mole: 250 m im Sprint, 4000 m auf der Langstrecke).
--
-- Ton-Sätze (timing_tone_set): „Standard" (Vorgabesatz, alles eingebaut) und „Sprint (hart)"
-- mit eigenem Startplan (T-10, T-5..T-1, T-0) und eigenen Erfassungs-/Fehlstart-Tönen.
--
-- Zeitnahmetypen (timing_mode):
--   Wellenstart 500 m       WELLE, kein Intervall, 20 s Vorlauf, Fehlstart AN, Ton „Sprint (hart)"
--   Zeitfahren 30 s         EINZEL, 30 s Intervall, 10 s Vorlauf, Fehlstart AUS (Strafzeit statt Rückruf)
--   Massenstart Langstrecke WELLE, kein Intervall, 60 s Vorlauf, Fehlstart AN
--
-- Der Zeitnahmeprofil-Baum ist mit ALLEN VIER Ebenen belegt (speziellste gewinnt):
--   Veranstaltung -> Wellenstart 500 m
--   Wettkampf W3  -> Massenstart Langstrecke
--   Runde W1/Vorlauf -> Zeitfahren 30 s
--   Partie W3/Zeitfahren -> Zeitfahren 30 s   (Zeitfahren-Partie, Wellenstart danach)
--
-- Startsequenzen (timing_start_sequence):
--   ARMED    Start-Posten, MASS, 20 s Vorlauf, 6 Einträge -> W1 Finale.
--            Das ist die Sequenz zum Anfassen: scharf, aber nicht gestartet. Ein Druck auf
--            „Start" lässt Countdown, Töne, Startbildschirm und Stream-Uhr gemeinsam laufen.
--   DONE     W1 Vorlauf (INTERVAL 30 s) und W2 Vorlauf (MASS) -- die Historie hinter den Marken.
--   ABORTED  ein Fehlstart vor dem W2-Vorlauf, damit ein abgebrochener Versuch in der Liste steht.
--   Es ist bewusst nur EINE aktive Sequenz je Posten möglich (uq_timing_sequence_active_station).
--
-- Marken (49) sind bis auf eine alle zugeordnet. Die eine unzugeordnete ZIEL-Marke (vor 5 s)
-- ist Absicht: an ihr wird das Zuordnen am Zielposten geübt.
--
-- Offizielle Zeiten decken die Sonderfälle ab:
--   Strafzeit  W1 Vorlauf, Boot Schleswig: 10 s Strafe mit Grund -- Rang fällt von 3 auf 5.
--   DNF        W1 Vorlauf, Boot Sønderborg: Startmarke und Zwischenzeit da, keine Zielmarke.
--   Abschnitt  alle Rohzeiten tragen Millisekunden, veröffentlicht wird auf ZEHNTEL
--              abgeschnitten (nie gerundet) -- 1:35.437 wird 1:35.4.
--
-- Die `applied_fingerprint`-Spalten sind mitgeschrieben (Hilfsfunktion `pg_temp.fp`, Feldfolge
-- Zeit|Status|Strafsekunden|Strafgrund|Platz|places_calculated wie in TimingApplyLogic). Ohne
-- sie hielte die Übernahme die Ergebnisse für FREMD und fasste sie nie wieder an.
--
-- ==========================================================================================
-- LIVESTREAM
-- ==========================================================================================
--
-- Drei Szenen mit fertigen Geräte-Token. Die Adressen (Origin davor, z. B. http://localhost:5123):
--
--   Bühne:      /event/<eventId>/stream/<sceneId>?token=<token>
--   Kontrolle:  /event/<eventId>/streamPanel
--
--   „Hauptkamera"  transparent, 4 % Schutzrand -- die Vollausstattung. Startliste, Nächstes
--                  Rennen, Runden und Ergebnis teilen sich BOTTOM_CENTER; welche gewinnt,
--                  entscheidet die Platz-Priorität (RESULT > LAPS > STARTLIST > NEXT_UP).
--                  Uhr oben rechts, Einlauf-Ticker rechts. Tagesprogramm und Streckenbild sind
--                  eingerichtet, aber AUS -- beide wären sonst dauerhaft on air und deckten das
--                  Bild zu; sie gehören der Regie (FORCED_ON in der Pause).
--   „Zielkamera"   transparent, schmal: Uhr oben links, Ergebnis als Vollbild, Ticker links.
--   „Probe (Chroma)" trial_mode = true, Chroma #00b140. Läuft ohne jeden echten Lauf in einer
--                  Drei-Minuten-Schleife und legt jede Grafik auf einen EIGENEN Platz -- damit
--                  ist in einem Blick zu sehen, ob alle acht Bausteine zeichnen.
--
-- Regie-Zeilen (stream_override) legt der Seed bewusst KEINE an: AUTO ist der Normalfall, und
-- eine vorbelegte Handschaltung wäre beim Testen genau die Verwirrung, die das Panel aufklären
-- soll. Die Regie wird im Kontroll-Panel geübt.
--
-- Zeitnahme-Posten haben ebenfalls fertige Token, damit Tablet und Zielrichter ohne Anmeldung
-- an die Boards kommen:  /event/<eventId>/timing/<stationId>?token=<token>
-- (die ANZEIGE zusätzlich mit `/anzeige` vor dem Fragezeichen).
--
-- Die Klartext-Token stehen unten im Abschnitt „Geräte-Token" und sind bewusst sprechend statt
-- zufällig: Dies ist ein Teststand, kein Betrieb.
--
-- ==========================================================================================
-- EINSPIELEN
-- ==========================================================================================
--
--   docker exec -i backend-db-1 psql -U developer -d <db> -v ON_ERROR_STOP=1 --single-transaction \
--     < docs/superpowers/seeds/2026-08-30-seed-zeitnahme-livestream.sql
--
-- Danach die Adressen abfragen:
--   select 'Bühne: /event/'||s.event||'/stream/'||s.id||'?token='||t.share_link_token
--   from ready2race.stream_scene s join ready2race.timing_device_token t on t.stream_scene = s.id
--   where s.event = '71ed0000-0000-0000-0000-000000000001';
--
-- Mehrfaches Einspielen ist vorgesehen -- der Cleanup-Block räumt den eigenen Präfix vorher weg.

set search_path to ready2race, pg_catalog, public;
set time zone 'Europe/Berlin';

-- ==========================================================================================
-- Anker und Hilfsfunktionen (leben nur in dieser Sitzung, pg_temp)
-- ==========================================================================================

create temporary table seed_anchor as
select date_trunc('second', now())::timestamp                                 as t0,
       (floor(extract(epoch from date_trunc('second', now()))) * 1000)::bigint as m0;

-- Zeitstempel relativ zum Einspielzeitpunkt, in Sekunden.
create function pg_temp.t(offset_seconds int) returns timestamp
    language sql stable as
$$ select (select t0 from seed_anchor) + make_interval(secs => offset_seconds) $$;

-- Epoch-Millisekunden relativ zum Einspielzeitpunkt (die Zeitnahme rechnet in Millis).
create function pg_temp.ms(offset_millis bigint) returns bigint
    language sql stable as
$$ select (select m0 from seed_anchor) + offset_millis $$;

-- Der Fingerabdruck des zuletzt übernommenen Ergebnisstands, feldgetreu wie
-- TimingApplyLogic.fingerprint: Längenpräfixe `<len>:<wert>`, null als `_`, Feldfolge
-- Zeit | Status | Strafsekunden | Strafgrund | Platz | places_calculated.
--
-- Ohne ihn gilt jedes vom Seed geschriebene Ergebnis der Übernahme als FREMD und wird nie wieder
-- angefasst -- eine Strafkorrektur im Leitstand käme dann am Lauf nicht an.
create function pg_temp.fp(time_millis bigint, status text, penalty_seconds int,
                           penalty_note text, place int, places_calculated boolean) returns text
    language sql immutable as
$$
select array_to_string(array [
    case when $1 is null then '_' else length($1::text) || ':' || $1::text end,
    case when $2 is null then '_' else length($2) || ':' || $2 end,
    case when $3 is null then '_' else length($3::text) || ':' || $3::text end,
    case when $4 is null then '_' else length($4) || ':' || $4 end,
    case when $5 is null then '_' else length($5::text) || ':' || $5::text end,
    length($6::text) || ':' || $6::text
    ], '|')
$$;

-- ==========================================================================================
-- Cleanup: eigene Zeilen entfernen, Kinder vor Eltern.
--
-- Gelöscht wird ausschließlich der eigene Präfix `71ed` bzw. was an der eigenen Veranstaltung
-- hängt. Fremde Seeds (5eed, f0de, fee1, a4f1, c4a1, 7e57) bleiben unangetastet.
-- ==========================================================================================

delete from stream_override
where scene in (select id from stream_scene where event = '71ed0000-0000-0000-0000-000000000001');

delete from stream_scene_graphic
where scene in (select id from stream_scene where event = '71ed0000-0000-0000-0000-000000000001');

-- Vor der Szene UND vor dem Posten: eine Token-Zeile zeigt auf genau eines von beiden.
delete from timing_device_token where event = '71ed0000-0000-0000-0000-000000000001';

delete from stream_scene where event = '71ed0000-0000-0000-0000-000000000001';

delete from timing_start_sequence_entry
where sequence in (select id from timing_start_sequence where event = '71ed0000-0000-0000-0000-000000000001');

delete from timing_start_sequence where event = '71ed0000-0000-0000-0000-000000000001';

delete from timing_assignment
where time_mark in (select id from timing_time_mark where event = '71ed0000-0000-0000-0000-000000000001');

delete from timing_official_time where event = '71ed0000-0000-0000-0000-000000000001';

-- restrict auf timing_station: die Marken müssen vor den Posten weg.
delete from timing_time_mark where event = '71ed0000-0000-0000-0000-000000000001';

delete from timing_profile_assignment where event = '71ed0000-0000-0000-0000-000000000001';

delete from competition_timing_station
where competition in (select id from competition where event = '71ed0000-0000-0000-0000-000000000001');

-- restrict von timing_profile_assignment auf timing_mode -- deshalb erst jetzt.
delete from timing_mode where event = '71ed0000-0000-0000-0000-000000000001';
delete from timing_tone_set where event = '71ed0000-0000-0000-0000-000000000001';
delete from timing_station where event = '71ed0000-0000-0000-0000-000000000001';

delete from competition_match_team_lap
where competition_match_team in (select id from competition_match_team where id::text like '71ed%');

delete from match_team_note
where competition_match_team in (select id from competition_match_team where id::text like '71ed%');

delete from competition_match_team_document
where competition_match_team_id in (select id from competition_match_team where id::text like '71ed%');

delete from competition_match_team where id::text like '71ed%';

delete from timecode where id::text like '71ed%';

delete from competition_match where competition_setup_match::text like '71ed%';

delete from event_schedule_slot where event = '71ed0000-0000-0000-0000-000000000001';

delete from competition_registration_named_participant
where competition_registration::text like '71ed%';

delete from substitution where competition_registration::text like '71ed%';
delete from competition_deregistration where competition_registration::text like '71ed%';
delete from app_user_registration_competition_registration
where competition_id in (select id from competition where event = '71ed0000-0000-0000-0000-000000000001');

delete from competition_registration where id::text like '71ed%';

delete from competition_setup_participant where id::text like '71ed%';
delete from competition_setup_match where id::text like '71ed%';

-- Die Vorwärtsreferenz zuerst lösen, sonst hält die Vorrunde ihr Finale fest.
update competition_setup_round set next_round = null where id::text like '71ed%';
delete from competition_setup_round where id::text like '71ed%';
delete from competition_setup where competition_properties::text like '71ed%';

delete from event_day_has_competition
where competition in (select id from competition where event = '71ed0000-0000-0000-0000-000000000001');

delete from competition_properties where id::text like '71ed%';
delete from competition where event = '71ed0000-0000-0000-0000-000000000001';

-- Alles, was auf die Veranstaltung zeigt OHNE zu kaskadieren.
delete from participant_tracking_change where event = '71ed0000-0000-0000-0000-000000000001';
delete from participant_tracking where event = '71ed0000-0000-0000-0000-000000000001';
delete from participant_requirement_log where event = '71ed0000-0000-0000-0000-000000000001';
delete from event_participant where event = '71ed0000-0000-0000-0000-000000000001';
delete from caterer_transaction where event_id = '71ed0000-0000-0000-0000-000000000001';
delete from event_registration where event = '71ed0000-0000-0000-0000-000000000001';
delete from event_day where event = '71ed0000-0000-0000-0000-000000000001';

delete from participant where id::text like '71ed%';
delete from named_participant where id::text like '71ed%';
delete from club where id::text like '71ed%';
delete from event where id::text like '71ed%';
delete from pace_reference where id::text like '71ed%';

-- ==========================================================================================
-- Bezugsgröße, Veranstaltung, Renntag, Vereine
-- ==========================================================================================

-- Tempo im Rudern: Zeit je 500 m. Veranstaltungsübergreifend gepflegt, deshalb ohne Event-Bezug.
insert into pace_reference (id, name, mode, reference_meters, created_at, created_by, updated_at, updated_by)
values ('71ed0090-0000-0000-0000-000000000001', 'Rudern (500 m)', 'TIME_PER_DISTANCE', 500,
        now(), null, now(), null);

insert into event (id, name, description, location, published,
                   public_results_visibility, chain_progression_mode, auto_create_following_rounds,
                   timing_system, timing_auto_apply, timing_precision,
                   timing_show_manual_capture, timing_start_display,
                   created_at, created_by, updated_at, updated_by)
values ('71ed0000-0000-0000-0000-000000000001',
        'Zeitnahme- und Streamtest',
        'Teststand für die interne Zeitnahme (Posten, Profile, Startsequenzen, Zwischenzeiten) und die Livestream-Szenen',
        'Flensburger Förde',
        true,
        'FINISHED_ONLY', 'DEAKTIVIERT', false,
        -- INTERN schaltet Zeitnahmetypen, Startsequenzen und Zwischenzeiten scharf; ohne diesen
        -- Wert löst der Profilbaum gar nichts auf und die Boards blieben leer.
        'INTERN', true, 'ZEHNTEL',
        -- Für einen Teststand sichtbar: am Startposten liegt neben dem Sequenz-Knopf der manuelle
        -- Stempel. Im Betrieb steht der Schalter aus Verwechslungsgründen auf aus.
        true,
        '{"showPosition": true, "showStartNumber": true, "showTeamName": true, "showClubName": true,
          "showAthleteNames": false, "clockScale": 1.2, "countdownScale": 1.6, "listScale": 1.0,
          "followingCount": 5}'::jsonb,
        now(), null, now(), null);

insert into event_day (id, event, date, name, description, created_at, created_by, updated_at, updated_by)
values ('71ed0001-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
        current_date, 'Testtag', 'Sprint und Langstrecke an einem Tag', now(), null, now(), null);

insert into club (id, name, created_at, created_by, updated_at, updated_by)
values ('71ed0002-0000-0000-0000-000000000001', 'Flensburger Ruderclub', now(), null, now(), null),
       ('71ed0002-0000-0000-0000-000000000002', 'Kieler Ruderverein', now(), null, now(), null),
       ('71ed0002-0000-0000-0000-000000000003', 'Glücksburger Ruder-Gesellschaft', now(), null, now(), null),
       ('71ed0002-0000-0000-0000-000000000004', 'Eckernförder Ruderclub', now(), null, now(), null),
       ('71ed0002-0000-0000-0000-000000000005', 'Schleswiger Ruderverein', now(), null, now(), null),
       ('71ed0002-0000-0000-0000-000000000006', 'Sønderborg Roklub', now(), null, now(), null);

insert into event_registration (id, event, club, message, created_at, created_by, updated_at, updated_by)
select ('71ed0003-0000-0000-0000-00000000000' || n)::uuid,
       '71ed0000-0000-0000-0000-000000000001',
       ('71ed0002-0000-0000-0000-00000000000' || n)::uuid,
       null, now(), null, now(), null
from generate_series(1, 6) as n;

insert into named_participant (id, name, description, created_at, created_by, updated_at, updated_by)
values ('71ed0004-0000-0000-0000-000000000001', 'Crew', 'Ruderin/Ruderer', now(), null, now(), null);

-- ==========================================================================================
-- Personen (32) -- zwei je Boot
-- ==========================================================================================

insert into participant (id, club, firstname, lastname, year, gender, external, created_at, created_by, updated_at, updated_by)
select v.id::uuid, v.club::uuid, v.firstname, v.lastname, v.year, v.gender::gender, false, now(), null, now(), null
from (values
    -- W1 Frauen-Doppelzweier
    ('71ed0005-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000001', 'Merle',   'Petersen',    1994, 'F'),
    ('71ed0005-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000001', 'Lena',    'Matthiesen',  1996, 'F'),
    ('71ed0005-0000-0000-0000-000000000003', '71ed0002-0000-0000-0000-000000000002', 'Svea',    'Ingwersen',   1992, 'F'),
    ('71ed0005-0000-0000-0000-000000000004', '71ed0002-0000-0000-0000-000000000002', 'Frieda',  'Rathjen',     1998, 'F'),
    ('71ed0005-0000-0000-0000-000000000005', '71ed0002-0000-0000-0000-000000000003', 'Annika',  'Boysen',      1995, 'F'),
    ('71ed0005-0000-0000-0000-000000000006', '71ed0002-0000-0000-0000-000000000003', 'Maren',   'Clausen',     1997, 'F'),
    ('71ed0005-0000-0000-0000-000000000007', '71ed0002-0000-0000-0000-000000000004', 'Gesa',    'Thomsen',     1993, 'F'),
    ('71ed0005-0000-0000-0000-000000000008', '71ed0002-0000-0000-0000-000000000004', 'Nele',    'Hansen',      1999, 'F'),
    ('71ed0005-0000-0000-0000-000000000009', '71ed0002-0000-0000-0000-000000000005', 'Wiebke',  'Jessen',      1991, 'F'),
    ('71ed0005-0000-0000-0000-00000000000a', '71ed0002-0000-0000-0000-000000000005', 'Inken',   'Lorenzen',    2000, 'F'),
    ('71ed0005-0000-0000-0000-00000000000b', '71ed0002-0000-0000-0000-000000000006', 'Femke',   'Jørgensen',   1996, 'F'),
    ('71ed0005-0000-0000-0000-00000000000c', '71ed0002-0000-0000-0000-000000000006', 'Astrid',  'Nissen',      1994, 'F'),
    -- W2 Männer-Doppelzweier
    ('71ed0005-0000-0000-0000-00000000000d', '71ed0002-0000-0000-0000-000000000001', 'Ole',     'Petersen',    1993, 'M'),
    ('71ed0005-0000-0000-0000-00000000000e', '71ed0002-0000-0000-0000-000000000001', 'Broder',  'Matthiesen',  1995, 'M'),
    ('71ed0005-0000-0000-0000-00000000000f', '71ed0002-0000-0000-0000-000000000002', 'Sven',    'Ingwersen',   1990, 'M'),
    ('71ed0005-0000-0000-0000-000000000010', '71ed0002-0000-0000-0000-000000000002', 'Hauke',   'Rathjen',     1997, 'M'),
    ('71ed0005-0000-0000-0000-000000000011', '71ed0002-0000-0000-0000-000000000003', 'Tammo',   'Boysen',      1992, 'M'),
    ('71ed0005-0000-0000-0000-000000000012', '71ed0002-0000-0000-0000-000000000003', 'Jasper',  'Clausen',     1998, 'M'),
    ('71ed0005-0000-0000-0000-000000000013', '71ed0002-0000-0000-0000-000000000004', 'Malte',   'Thomsen',     1994, 'M'),
    ('71ed0005-0000-0000-0000-000000000014', '71ed0002-0000-0000-0000-000000000004', 'Timm',    'Hansen',      1996, 'M'),
    ('71ed0005-0000-0000-0000-000000000015', '71ed0002-0000-0000-0000-000000000005', 'Jonte',   'Jessen',      1991, 'M'),
    ('71ed0005-0000-0000-0000-000000000016', '71ed0002-0000-0000-0000-000000000005', 'Erk',     'Lorenzen',    1999, 'M'),
    ('71ed0005-0000-0000-0000-000000000017', '71ed0002-0000-0000-0000-000000000006', 'Mads',    'Jørgensen',   1993, 'M'),
    ('71ed0005-0000-0000-0000-000000000018', '71ed0002-0000-0000-0000-000000000006', 'Anders',  'Nissen',      1995, 'M'),
    -- W3 Mixed-Doppelzweier Langstrecke
    ('71ed0005-0000-0000-0000-000000000019', '71ed0002-0000-0000-0000-000000000001', 'Ida',     'Sörensen',    1992, 'F'),
    ('71ed0005-0000-0000-0000-00000000001a', '71ed0002-0000-0000-0000-000000000001', 'Bendix',  'Sörensen',    1990, 'M'),
    ('71ed0005-0000-0000-0000-00000000001b', '71ed0002-0000-0000-0000-000000000002', 'Thea',    'Callsen',     1994, 'F'),
    ('71ed0005-0000-0000-0000-00000000001c', '71ed0002-0000-0000-0000-000000000002', 'Fiete',   'Callsen',     1993, 'M'),
    ('71ed0005-0000-0000-0000-00000000001d', '71ed0002-0000-0000-0000-000000000003', 'Ronja',   'Paulsen',     1996, 'F'),
    ('71ed0005-0000-0000-0000-00000000001e', '71ed0002-0000-0000-0000-000000000003', 'Keno',    'Paulsen',     1995, 'M'),
    ('71ed0005-0000-0000-0000-00000000001f', '71ed0002-0000-0000-0000-000000000004', 'Alva',    'Detlefsen',   1997, 'F'),
    ('71ed0005-0000-0000-0000-000000000020', '71ed0002-0000-0000-0000-000000000004', 'Ruben',   'Detlefsen',   1991, 'M')
) as v(id, club, firstname, lastname, year, gender);

-- ==========================================================================================
-- Wettkämpfe, Runden, Partien
--
-- Runden werden RÜCKWÄRTS angelegt (`next_round` zeigt vorwärts): erst das Finale, dann die
-- Qualifikationsrunde, die darauf zeigt.
-- ==========================================================================================

insert into competition (id, event, auto_create_following_rounds, created_at, created_by, updated_at, updated_by)
values ('71ed0010-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001', false, now(), null, now(), null),
       ('71ed0010-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001', false, now(), null, now(), null),
       ('71ed0010-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001', false, now(), null, now(), null);

insert into event_day_has_competition (event_day, competition, created_at, created_by)
select '71ed0001-0000-0000-0000-000000000001', id, now(), null
from competition where event = '71ed0000-0000-0000-0000-000000000001';

-- Distanz und Bezugsgröße gehören dem Wettkampf; die Zeitnahme braucht nur Start und Ziel.
insert into competition_properties (id, competition, competition_template, identifier, name, short_name,
                                    description, competition_category, distance_meters, pace_reference)
values ('71ed0011-0000-0000-0000-000000000001', '71ed0010-0000-0000-0000-000000000001', null, '1',
        'Frauen-Doppelzweier', 'CF 2x', 'Sprint über 500 m', null, 500, '71ed0090-0000-0000-0000-000000000001'),
       ('71ed0011-0000-0000-0000-000000000002', '71ed0010-0000-0000-0000-000000000002', null, '2',
        'Männer-Doppelzweier', 'CM 2x', 'Sprint über 500 m', null, 500, '71ed0090-0000-0000-0000-000000000001'),
       ('71ed0011-0000-0000-0000-000000000003', '71ed0010-0000-0000-0000-000000000003', null, '3',
        'Mixed-Doppelzweier Langstrecke', 'CMix 2x', 'Zeitfahren über 6 km', null, 6000, '71ed0090-0000-0000-0000-000000000001');

insert into competition_setup (competition_properties, created_at, created_by, updated_at, updated_by)
select id, now(), null, now(), null from competition_properties where id::text like '71ed0011%';

insert into competition_setup_round (id, competition_setup, competition_setup_template, next_round, name,
                                     required, use_default_seeding, places_option, is_qualification, materialized_at)
values
    -- W1
    ('71ed0012-0000-0000-0000-000000000001', '71ed0011-0000-0000-0000-000000000001', null, null,
     'Finale', true, false, 'CUSTOM', false, pg_temp.t(-3000)),
    ('71ed0012-0000-0000-0000-000000000002', '71ed0011-0000-0000-0000-000000000001', null,
     '71ed0012-0000-0000-0000-000000000001', 'Vorlauf', true, true, 'ASCENDING', true, pg_temp.t(-3720)),
    -- W2
    ('71ed0012-0000-0000-0000-000000000003', '71ed0011-0000-0000-0000-000000000002', null, null,
     'Finale', true, false, 'CUSTOM', false, pg_temp.t(-600)),
    ('71ed0012-0000-0000-0000-000000000004', '71ed0011-0000-0000-0000-000000000002', null,
     '71ed0012-0000-0000-0000-000000000003', 'Vorlauf', true, true, 'ASCENDING', true, pg_temp.t(-900)),
    -- W3
    ('71ed0012-0000-0000-0000-000000000005', '71ed0011-0000-0000-0000-000000000003', null, null,
     'Finale', true, false, 'CUSTOM', false, pg_temp.t(-4800)),
    ('71ed0012-0000-0000-0000-000000000006', '71ed0011-0000-0000-0000-000000000003', null,
     '71ed0012-0000-0000-0000-000000000005', 'Zeitfahren', true, true, 'ASCENDING', true, pg_temp.t(-6120));

insert into competition_setup_match (id, competition_setup_round, competition_setup_group, weighting,
                                     teams, name, execution_order, start_time_offset)
values ('71ed0013-0000-0000-0000-000000000001', '71ed0012-0000-0000-0000-000000000002', null, 1, null, 'Vorlauf',    1, null),
       ('71ed0013-0000-0000-0000-000000000002', '71ed0012-0000-0000-0000-000000000001', null, 1, 6,    'Finale',     1, null),
       ('71ed0013-0000-0000-0000-000000000003', '71ed0012-0000-0000-0000-000000000004', null, 1, null, 'Vorlauf',    1, null),
       ('71ed0013-0000-0000-0000-000000000004', '71ed0012-0000-0000-0000-000000000003', null, 1, 6,    'Finale',     1, null),
       ('71ed0013-0000-0000-0000-000000000005', '71ed0012-0000-0000-0000-000000000006', null, 1, null, 'Zeitfahren', 1, null),
       ('71ed0013-0000-0000-0000-000000000006', '71ed0012-0000-0000-0000-000000000005', null, 1, 4,    'Finale',     1, null);

-- Setzung der Finals: Platz n der Vorrunde rückt auf Bahn n.
insert into competition_setup_participant (id, competition_setup_match, competition_setup_group, seed, ranking)
select ('71ed0014-0000-0000-0000-0000000000' || lpad(to_hex(v.offset_n + s.seed), 2, '0'))::uuid,
       v.match::uuid, null, s.seed, s.seed
from (values
    ('71ed0013-0000-0000-0000-000000000002', 6, 0),
    ('71ed0013-0000-0000-0000-000000000004', 6, 6),
    ('71ed0013-0000-0000-0000-000000000006', 4, 12)
) as v(match, teams, offset_n),
     lateral generate_series(1, v.teams) as s(seed);

-- ==========================================================================================
-- Meldungen (Boote) und Besatzungen
-- ==========================================================================================

insert into competition_registration (id, event_registration, competition, club, name, team_number,
                                      is_late, created_at, created_by, updated_at, updated_by)
select v.id::uuid, v.event_registration::uuid, v.competition::uuid, v.club::uuid, v.name, v.team_number,
       false, now(), null, now(), null
from (values
    -- W1 CF 2x
    ('71ed0020-0000-0000-0000-000000000001', '71ed0003-0000-0000-0000-000000000001', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000001', 'Flensburg CF 2x',   1),
    ('71ed0020-0000-0000-0000-000000000002', '71ed0003-0000-0000-0000-000000000002', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000002', 'Kiel CF 2x',        1),
    ('71ed0020-0000-0000-0000-000000000003', '71ed0003-0000-0000-0000-000000000003', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000003', 'Glücksburg CF 2x',  1),
    ('71ed0020-0000-0000-0000-000000000004', '71ed0003-0000-0000-0000-000000000004', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000004', 'Eckernförde CF 2x', 1),
    ('71ed0020-0000-0000-0000-000000000005', '71ed0003-0000-0000-0000-000000000005', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000005', 'Schleswig CF 2x',   1),
    ('71ed0020-0000-0000-0000-000000000006', '71ed0003-0000-0000-0000-000000000006', '71ed0010-0000-0000-0000-000000000001', '71ed0002-0000-0000-0000-000000000006', 'Sønderborg CF 2x',  1),
    -- W2 CM 2x
    ('71ed0020-0000-0000-0000-000000000007', '71ed0003-0000-0000-0000-000000000001', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000001', 'Flensburg CM 2x',   1),
    ('71ed0020-0000-0000-0000-000000000008', '71ed0003-0000-0000-0000-000000000002', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000002', 'Kiel CM 2x',        1),
    ('71ed0020-0000-0000-0000-000000000009', '71ed0003-0000-0000-0000-000000000003', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000003', 'Glücksburg CM 2x',  1),
    ('71ed0020-0000-0000-0000-00000000000a', '71ed0003-0000-0000-0000-000000000004', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000004', 'Eckernförde CM 2x', 1),
    ('71ed0020-0000-0000-0000-00000000000b', '71ed0003-0000-0000-0000-000000000005', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000005', 'Schleswig CM 2x',   1),
    ('71ed0020-0000-0000-0000-00000000000c', '71ed0003-0000-0000-0000-000000000006', '71ed0010-0000-0000-0000-000000000002', '71ed0002-0000-0000-0000-000000000006', 'Sønderborg CM 2x',  1),
    -- W3 CMix 2x
    ('71ed0020-0000-0000-0000-00000000000d', '71ed0003-0000-0000-0000-000000000001', '71ed0010-0000-0000-0000-000000000003', '71ed0002-0000-0000-0000-000000000001', 'Flensburg CMix 2x',   1),
    ('71ed0020-0000-0000-0000-00000000000e', '71ed0003-0000-0000-0000-000000000002', '71ed0010-0000-0000-0000-000000000003', '71ed0002-0000-0000-0000-000000000002', 'Kiel CMix 2x',        1),
    ('71ed0020-0000-0000-0000-00000000000f', '71ed0003-0000-0000-0000-000000000003', '71ed0010-0000-0000-0000-000000000003', '71ed0002-0000-0000-0000-000000000003', 'Glücksburg CMix 2x',  1),
    ('71ed0020-0000-0000-0000-000000000010', '71ed0003-0000-0000-0000-000000000004', '71ed0010-0000-0000-0000-000000000003', '71ed0002-0000-0000-0000-000000000004', 'Eckernförde CMix 2x', 1)
) as v(id, event_registration, competition, club, name, team_number);

-- Besatzung: Person 2k-1 und 2k gehören zu Boot k (die Reihenfolge der beiden Listen oben).
insert into competition_registration_named_participant (competition_registration, named_participant, participant)
select ('71ed0020-0000-0000-0000-0000000000' || lpad(to_hex(boat), 2, '0'))::uuid,
       '71ed0004-0000-0000-0000-000000000001',
       ('71ed0005-0000-0000-0000-0000000000' || lpad(to_hex(person), 2, '0'))::uuid
from generate_series(1, 16) as boat,
     lateral (select boat * 2 - 1 as person union all select boat * 2) as p(person);

-- ==========================================================================================
-- Zeitnahme: Posten
--
-- „Startanzeige" ist ein eigener Posten vom Typ ANZEIGE mit eigenem Link -- sie spiegelt den
-- Startposten (`linked_station`) und lässt sich einzeln widerrufen, ohne den Erfassungs-Link
-- des Starts mitzureißen.
-- ==========================================================================================

insert into timing_station (id, event, name, type, sorting, linked_station, capture_mode, armed,
                            created_at, created_by, updated_at, updated_by)
values ('71ed0050-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
        'Start', 'START', 1, null, 'ONETOUCH', false, now(), null, now(), null),
       ('71ed0050-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
        'Boje Nord', 'SPLIT', 2, null, 'ONETOUCH', false, now(), null, now(), null),
       ('71ed0050-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001',
        'Mole', 'SPLIT', 3, null, 'ONETOUCH', false, now(), null, now(), null),
       -- Der Zielposten läuft im scharfgeschalteten Betrieb: erst scharf stellen, dann erfassen.
       -- `armed = false` heißt, er ist gerade ENTSCHÄRFT -- genau der Ausgangspunkt zum Üben.
       ('71ed0050-0000-0000-0000-000000000004', '71ed0000-0000-0000-0000-000000000001',
        'Ziel', 'FINISH', 4, null, 'ARMED', false, now(), null, now(), null),
       ('71ed0050-0000-0000-0000-000000000005', '71ed0000-0000-0000-0000-000000000001',
        'Startanzeige', 'ANZEIGE', 5, '71ed0050-0000-0000-0000-000000000001', 'ONETOUCH', false,
        now(), null, now(), null);

-- Welcher Posten steht bei diesem Wettkampf auf welchem Meter. Die Mole ist im Sprint der
-- 250-m-Posten und auf der Langstrecke der 4000-m-Posten -- derselbe Mensch, zwei Distanzen.
-- Die Reihenfolge der Zwischenzeiten kommt aus DIESEM Wert, nicht aus der Leitstand-Sortierung.
insert into competition_timing_station (id, competition, timing_station, distance_meters,
                                        created_at, created_by, updated_at, updated_by)
select v.id::uuid, v.competition::uuid, v.station::uuid, v.meters, now(), null, now(), null
from (values
    -- W1 Sprint 500 m
    ('71ed0054-0000-0000-0000-000000000001', '71ed0010-0000-0000-0000-000000000001', '71ed0050-0000-0000-0000-000000000001',    0),
    ('71ed0054-0000-0000-0000-000000000002', '71ed0010-0000-0000-0000-000000000001', '71ed0050-0000-0000-0000-000000000003',  250),
    ('71ed0054-0000-0000-0000-000000000003', '71ed0010-0000-0000-0000-000000000001', '71ed0050-0000-0000-0000-000000000004',  500),
    -- W2 Sprint 500 m
    ('71ed0054-0000-0000-0000-000000000004', '71ed0010-0000-0000-0000-000000000002', '71ed0050-0000-0000-0000-000000000001',    0),
    ('71ed0054-0000-0000-0000-000000000005', '71ed0010-0000-0000-0000-000000000002', '71ed0050-0000-0000-0000-000000000003',  250),
    ('71ed0054-0000-0000-0000-000000000006', '71ed0010-0000-0000-0000-000000000002', '71ed0050-0000-0000-0000-000000000004',  500),
    -- W3 Langstrecke 6000 m
    ('71ed0054-0000-0000-0000-000000000007', '71ed0010-0000-0000-0000-000000000003', '71ed0050-0000-0000-0000-000000000001',    0),
    ('71ed0054-0000-0000-0000-000000000008', '71ed0010-0000-0000-0000-000000000003', '71ed0050-0000-0000-0000-000000000002', 2000),
    ('71ed0054-0000-0000-0000-000000000009', '71ed0010-0000-0000-0000-000000000003', '71ed0050-0000-0000-0000-000000000003', 4000),
    ('71ed0054-0000-0000-0000-00000000000a', '71ed0010-0000-0000-0000-000000000003', '71ed0050-0000-0000-0000-000000000004', 6000)
) as v(id, competition, station, meters);

-- ==========================================================================================
-- Zeitnahme: Ton-Sätze
--
-- Vier Töne je Satz. `null` heißt jeweils „eingebauter Standard" -- der Vorgabesatz bleibt
-- deshalb bewusst leer und klingt genau wie eine unangefasste Veranstaltung.
-- ==========================================================================================

insert into timing_tone_set (id, event, name, is_default, sequence_tone_plan, split_tone,
                             false_start_tone, finish_tone, tone_per_boat,
                             created_at, created_by, updated_at, updated_by)
values ('71ed0051-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
        'Standard', true, null, null, null, null, true, now(), null, now(), null),
       ('71ed0051-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
        'Sprint (hart)', false,
        -- offsetMillis negativ = vor dem Start, 0 = der Start selbst. Positive Werte sind nicht
        -- erlaubt: nach dem Start wandert das Countdown-Ziel sofort zum nächsten Boot.
        '[{"offsetMillis": -10000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":  -5000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":  -4000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":  -3000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":  -2000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":  -1000, "frequencyHz": 700, "durationMillis": 120},
          {"offsetMillis":      0, "frequencyHz": 1100, "durationMillis": 600}]'::jsonb,
        '{"frequencyHz": 1200, "durationMillis": 120}'::jsonb,
        '{"frequencyHz": 220, "durationMillis": 900}'::jsonb,
        '{"frequencyHz": 880, "durationMillis": 180}'::jsonb,
        true, now(), null, now(), null);

-- ==========================================================================================
-- Zeitnahme: Zeitnahmetypen
--
-- Der Typ beschreibt nur noch, WIE gestartet wird. WIE gemessen wird, sagen die Posten am
-- Wettkampf (competition_timing_station oben).
-- ==========================================================================================

insert into timing_mode (id, event, name, start_grouping, interval_seconds, lead_in_seconds,
                         false_start_enabled, tone_set, start_sequence_enabled,
                         boat_keys_primary, boat_keys_secondary,
                         created_at, created_by, updated_at, updated_by)
values ('71ed0052-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
        'Wellenstart 500 m', 'WELLE', null, 20, true,
        '71ed0051-0000-0000-0000-000000000002', true, '123456', 'ABCDEF', now(), null, now(), null),
       -- Fehlstart AUS: Im Zeitfahren wird ein Frühstart mit Strafzeit belegt, nicht mit einem
       -- Rückruf ins laufende Feld hinein. Die 10 s vergibt der Schiedsrichter von Hand.
       ('71ed0052-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
        'Zeitfahren 30 s', 'EINZEL', 30, 10, false,
        null, true, '123456', 'ABCDEF', now(), null, now(), null),
       ('71ed0052-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001',
        'Massenstart Langstrecke', 'WELLE', null, 60, true,
        null, true, '123456', 'ABCDEF', now(), null, now(), null);

-- ==========================================================================================
-- Zeitnahme: Profilbaum -- alle vier Ebenen belegt, die speziellste gewinnt.
-- ==========================================================================================

insert into timing_profile_assignment (id, event, competition, competition_setup_round,
                                       competition_setup_match, raceclocker_race, timing_mode,
                                       created_at, created_by, updated_at, updated_by)
values
    -- 1) Veranstaltung: alles, was nichts Eigenes sagt, startet als Welle.
    ('71ed0053-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
     null, null, null, null, '71ed0052-0000-0000-0000-000000000001', now(), null, now(), null),
    -- 2) Wettkampf W3: die Langstrecke startet grundsätzlich als Massenstart.
    ('71ed0053-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
     '71ed0010-0000-0000-0000-000000000003', null, null, null,
     '71ed0052-0000-0000-0000-000000000003', now(), null, now(), null),
    -- 3) Runde W1/Vorlauf: der Vorlauf ist ein Zeitfahren, das Finale erbt den Wellenstart.
    ('71ed0053-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001',
     '71ed0010-0000-0000-0000-000000000001', '71ed0012-0000-0000-0000-000000000002', null, null,
     '71ed0052-0000-0000-0000-000000000002', now(), null, now(), null),
    -- 4) Partie W3/Zeitfahren: EIN Lauf des Wettkampfs weicht ab -- genau der Fall, für den es
    --    die Partie-Ebene gibt (Qualifikation im Zeitfahren, danach Massenstart).
    ('71ed0053-0000-0000-0000-000000000004', '71ed0000-0000-0000-0000-000000000001',
     '71ed0010-0000-0000-0000-000000000003', '71ed0012-0000-0000-0000-000000000006',
     '71ed0013-0000-0000-0000-000000000005', null,
     '71ed0052-0000-0000-0000-000000000002', now(), null, now(), null);

-- ==========================================================================================
-- Läufe (materialisierte Partien)
--
-- Der Zustand eines Laufs ergibt sich aus drei Spalten (LiveDashboardLogic):
--   clarification_since gesetzt und nicht beendet -> KLÄRUNG
--   activated_at gesetzt, started_at leer         -> IN VORBEREITUNG
--   activated_at gesetzt, started_at gesetzt      -> LÄUFT
--   finished_at gesetzt (activated_at geräumt)    -> BEENDET
--
-- `updated_at` des BEENDETEN Laufs ist der Anker des Einblendfensters der Ergebnisgrafik. Der
-- W1-Vorlauf trägt hier zehn Sekunden VOR dem Einspielzeitpunkt: damit läuft auf der Szene
-- „Hauptkamera" direkt nach dem Einspielen die ganze Ablösekette einmal von selbst durch --
-- Ergebnis (noch 15 s), dann Startliste (bis 20 s nach dem Ruf an den Start), dann Nächstes
-- Rennen. Alle drei teilen sich denselben Platz; die Reihenfolge macht die Priorität.
-- ==========================================================================================

insert into competition_match (competition_setup_match, start_time, activated_at, started_at, finished_at,
                               clarification_since, clarification_reason, bye_must_race, bye_name,
                               created_at, created_by, updated_at, updated_by)
values
    -- W3 Zeitfahren: beendet, aber in Klärung -- die Ergebnisgrafik kennzeichnet es als vorläufig.
    ('71ed0013-0000-0000-0000-000000000005', pg_temp.t(-6000), null, pg_temp.t(-5880), pg_temp.t(-4800),
     pg_temp.t(-4500), 'Zwei Proteste zur Wendemarke -- Wertung vorläufig', false, null,
     pg_temp.t(-6600), null, pg_temp.t(-4800), null),
    -- W1 Vorlauf: beendet, vollständig gewertet -- das jüngste Ergebnis der Veranstaltung.
    ('71ed0013-0000-0000-0000-000000000001', pg_temp.t(-3600), null, pg_temp.t(-3480), pg_temp.t(-3000),
     null, null, false, null,
     pg_temp.t(-6600), null, pg_temp.t(-10), null),
    -- W2 Vorlauf: läuft seit 110 s, drei Boote sind im Ziel.
    ('71ed0013-0000-0000-0000-000000000003', pg_temp.t(-180), pg_temp.t(-470), pg_temp.t(-110), null,
     null, null, false, null,
     pg_temp.t(-6600), null, pg_temp.t(-110), null),
    -- W1 Finale: gerade an den Start gerufen. Startliste on air, Startsequenz steht scharf.
    ('71ed0013-0000-0000-0000-000000000002', pg_temp.t(900), pg_temp.t(0), null, null,
     null, null, false, null,
     pg_temp.t(-3000), null, pg_temp.t(0), null),
    -- W2 Finale und W3 Finale: anstehend -- Tagesprogramm und „Nächstes Rennen".
    ('71ed0013-0000-0000-0000-000000000004', pg_temp.t(2100), null, null, null,
     null, null, false, null,
     pg_temp.t(-600), null, pg_temp.t(-600), null),
    ('71ed0013-0000-0000-0000-000000000006', pg_temp.t(3300), null, null, null,
     null, null, false, null,
     pg_temp.t(-4800), null, pg_temp.t(-4800), null);

-- ==========================================================================================
-- Zeiten der gewerteten Boote (timecode)
--
-- `time` trägt die VERÖFFENTLICHTE Zeit, also die auf ZEHNTEL ABGESCHNITTENE Summe aus
-- gemessener Zeit und Strafe. Die Rohmillisekunden bleiben an der offiziellen Zeit stehen.
-- `base_unit`/`millisecond_precision` sind genau das, was `officialTimecode` erzeugt hätte.
-- ==========================================================================================

insert into timecode (id, time, base_unit, millisecond_precision)
select v.id::uuid, v.millis, 'MINUTES', 'ONE'
from (values
    -- W1 Vorlauf
    ('71ed0040-0000-0000-0000-000000000001',   95400),
    ('71ed0040-0000-0000-0000-000000000002',   94800),
    ('71ed0040-0000-0000-0000-000000000003',   97200),
    ('71ed0040-0000-0000-0000-000000000004',   96100),
    ('71ed0040-0000-0000-0000-000000000005',  109900),   -- 99.988 s + 10 s Strafe, abgeschnitten
    -- W2 Vorlauf, die drei bereits eingelaufenen Boote
    ('71ed0040-0000-0000-0000-00000000000d',   93600),
    ('71ed0040-0000-0000-0000-00000000000e',   94100),
    ('71ed0040-0000-0000-0000-00000000000f',   95400),
    -- W3 Zeitfahren
    ('71ed0040-0000-0000-0000-000000000019', 1582300),
    ('71ed0040-0000-0000-0000-00000000001a', 1559800),
    ('71ed0040-0000-0000-0000-00000000001b', 1611200),
    ('71ed0040-0000-0000-0000-00000000001c', 1594000)
) as v(id, millis);

-- ==========================================================================================
-- Boote in den Läufen
--
-- start_number ist die Bahn/Startnummer. Die Finals sind nach dem Ergebnis der Vorrunde
-- gesetzt (Platz n -> Bahn n).
-- ==========================================================================================

insert into competition_match_team (id, competition_match, competition_registration, start_number,
                                    place, places_calculated, timecode, out, failed, failed_reason,
                                    penalty_seconds, penalty_note, started_at,
                                    created_at, created_by, updated_at, updated_by)
select v.id::uuid, v.match::uuid, v.registration::uuid, v.start_number,
       v.place, v.places_calculated, v.timecode::uuid, false, v.failed, v.failed_reason,
       v.penalty_seconds, v.penalty_note, v.started_at,
       pg_temp.t(-6600), null, v.updated_at, null
from (values
    -- ---- W1 Vorlauf (beendet) --------------------------------------------------------------
    ('71ed0030-0000-0000-0000-000000000001', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000001', 1,    2, true,  '71ed0040-0000-0000-0000-000000000001', false, null,  null, null,                pg_temp.t(-3480), pg_temp.t(-3000)),
    ('71ed0030-0000-0000-0000-000000000002', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000002', 2,    1, true,  '71ed0040-0000-0000-0000-000000000002', false, null,  null, null,                pg_temp.t(-3450), pg_temp.t(-3000)),
    ('71ed0030-0000-0000-0000-000000000003', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000003', 3,    4, true,  '71ed0040-0000-0000-0000-000000000003', false, null,  null, null,                pg_temp.t(-3420), pg_temp.t(-3000)),
    ('71ed0030-0000-0000-0000-000000000004', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000004', 4,    3, true,  '71ed0040-0000-0000-0000-000000000004', false, null,  null, null,                pg_temp.t(-3390), pg_temp.t(-3000)),
    -- Strafzeit: 10 s auf die gemessene Zeit -- kostet drei Plätze.
    ('71ed0030-0000-0000-0000-000000000005', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000005', 5,    5, true,  '71ed0040-0000-0000-0000-000000000005', false, null,    10, 'Frühstart (10 s)', pg_temp.t(-3360), pg_temp.t(-3000)),
    -- DNF: Startmarke und Zwischenzeit sind da, die Zielmarke fehlt.
    ('71ed0030-0000-0000-0000-000000000006', '71ed0013-0000-0000-0000-000000000001', '71ed0020-0000-0000-0000-000000000006', 6, null, true,  null,                                   true,  'DNF', null, null,                pg_temp.t(-3330), pg_temp.t(-3000)),
    -- ---- W1 Finale (in Vorbereitung, gesetzt nach Vorlauf-Platz) -----------------------------
    ('71ed0030-0000-0000-0000-000000000007', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000002', 1, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    ('71ed0030-0000-0000-0000-000000000008', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000001', 2, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    ('71ed0030-0000-0000-0000-000000000009', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000004', 3, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    ('71ed0030-0000-0000-0000-00000000000a', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000003', 4, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    ('71ed0030-0000-0000-0000-00000000000b', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000005', 5, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    ('71ed0030-0000-0000-0000-00000000000c', '71ed0013-0000-0000-0000-000000000002', '71ed0020-0000-0000-0000-000000000006', 6, null, false, null,                                   false, null,  null, null, null, pg_temp.t(0)),
    -- ---- W2 Vorlauf (läuft: drei im Ziel, drei unterwegs) ------------------------------------
    ('71ed0030-0000-0000-0000-00000000000d', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-000000000007', 1,    1, true,  '71ed0040-0000-0000-0000-00000000000d', false, null,  null, null, pg_temp.t(-110), pg_temp.t(-16)),
    ('71ed0030-0000-0000-0000-00000000000e', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-000000000008', 2,    2, true,  '71ed0040-0000-0000-0000-00000000000e', false, null,  null, null, pg_temp.t(-110), pg_temp.t(-15)),
    ('71ed0030-0000-0000-0000-00000000000f', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-000000000009', 3,    3, true,  '71ed0040-0000-0000-0000-00000000000f', false, null,  null, null, pg_temp.t(-110), pg_temp.t(-14)),
    ('71ed0030-0000-0000-0000-000000000010', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-00000000000a', 4, null, false, null,                                   false, null,  null, null, pg_temp.t(-110), pg_temp.t(-110)),
    ('71ed0030-0000-0000-0000-000000000011', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-00000000000b', 5, null, false, null,                                   false, null,  null, null, pg_temp.t(-110), pg_temp.t(-110)),
    ('71ed0030-0000-0000-0000-000000000012', '71ed0013-0000-0000-0000-000000000003', '71ed0020-0000-0000-0000-00000000000c', 6, null, false, null,                                   false, null,  null, null, pg_temp.t(-110), pg_temp.t(-110)),
    -- ---- W2 Finale (anstehend) ---------------------------------------------------------------
    ('71ed0030-0000-0000-0000-000000000013', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-000000000007', 1, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    ('71ed0030-0000-0000-0000-000000000014', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-000000000008', 2, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    ('71ed0030-0000-0000-0000-000000000015', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-000000000009', 3, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    ('71ed0030-0000-0000-0000-000000000016', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-00000000000a', 4, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    ('71ed0030-0000-0000-0000-000000000017', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-00000000000b', 5, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    ('71ed0030-0000-0000-0000-000000000018', '71ed0013-0000-0000-0000-000000000004', '71ed0020-0000-0000-0000-00000000000c', 6, null, false, null, false, null, null, null, null, pg_temp.t(-600)),
    -- ---- W3 Zeitfahren (beendet, in Klärung) --------------------------------------------------
    ('71ed0030-0000-0000-0000-000000000019', '71ed0013-0000-0000-0000-000000000005', '71ed0020-0000-0000-0000-00000000000d', 1,    2, true,  '71ed0040-0000-0000-0000-000000000019', false, null, null, null, pg_temp.t(-5880), pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-00000000001a', '71ed0013-0000-0000-0000-000000000005', '71ed0020-0000-0000-0000-00000000000e', 2,    1, true,  '71ed0040-0000-0000-0000-00000000001a', false, null, null, null, pg_temp.t(-5850), pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-00000000001b', '71ed0013-0000-0000-0000-000000000005', '71ed0020-0000-0000-0000-00000000000f', 3,    4, true,  '71ed0040-0000-0000-0000-00000000001b', false, null, null, null, pg_temp.t(-5820), pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-00000000001c', '71ed0013-0000-0000-0000-000000000005', '71ed0020-0000-0000-0000-000000000010', 4,    3, true,  '71ed0040-0000-0000-0000-00000000001c', false, null, null, null, pg_temp.t(-5790), pg_temp.t(-4800)),
    -- ---- W3 Finale (anstehend, gesetzt nach Zeitfahren-Platz) ---------------------------------
    ('71ed0030-0000-0000-0000-00000000001d', '71ed0013-0000-0000-0000-000000000006', '71ed0020-0000-0000-0000-00000000000e', 1, null, false, null, false, null, null, null, null, pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-00000000001e', '71ed0013-0000-0000-0000-000000000006', '71ed0020-0000-0000-0000-00000000000d', 2, null, false, null, false, null, null, null, null, pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-00000000001f', '71ed0013-0000-0000-0000-000000000006', '71ed0020-0000-0000-0000-000000000010', 3, null, false, null, false, null, null, null, null, pg_temp.t(-4800)),
    ('71ed0030-0000-0000-0000-000000000020', '71ed0013-0000-0000-0000-000000000006', '71ed0020-0000-0000-0000-00000000000f', 4, null, false, null, false, null, null, null, null, pg_temp.t(-4800))
) as v(id, match, registration, start_number, place, places_calculated, timecode, failed, failed_reason,
       penalty_seconds, penalty_note, started_at, updated_at);

-- ==========================================================================================
-- Zeitmarken (49)
--
-- Alle Marken sind ACTIVE und stammen von APP_USER (Tastendruck am Board). Bis auf EINE sind
-- sie zugeordnet -- die letzte Zielmarke des laufenden W2-Vorlaufs liegt bewusst unzugeordnet
-- am Zielposten und ist der Übungsfall für die Klick-Zuordnung.
-- ==========================================================================================

insert into timing_time_mark (id, event, station, timestamp_millis, source, status,
                              created_at, created_by, updated_at, updated_by)
select v.id::uuid, '71ed0000-0000-0000-0000-000000000001', v.station::uuid, pg_temp.ms(v.off_ms),
       'APP_USER', 'ACTIVE', pg_temp.t((v.off_ms / 1000)::int), null, pg_temp.t((v.off_ms / 1000)::int), null
from (values
    -- W1 Vorlauf: Start (Intervall 30 s)
    ('71ed0055-0000-0000-0000-000000000001', '71ed0050-0000-0000-0000-000000000001', -3480000::bigint),
    ('71ed0055-0000-0000-0000-000000000002', '71ed0050-0000-0000-0000-000000000001', -3450000),
    ('71ed0055-0000-0000-0000-000000000003', '71ed0050-0000-0000-0000-000000000001', -3420000),
    ('71ed0055-0000-0000-0000-000000000004', '71ed0050-0000-0000-0000-000000000001', -3390000),
    ('71ed0055-0000-0000-0000-000000000005', '71ed0050-0000-0000-0000-000000000001', -3360000),
    ('71ed0055-0000-0000-0000-000000000006', '71ed0050-0000-0000-0000-000000000001', -3330000),
    -- W1 Vorlauf: Mole (250 m)
    ('71ed0055-0000-0000-0000-000000000007', '71ed0050-0000-0000-0000-000000000003', -3434880),
    ('71ed0055-0000-0000-0000-000000000008', '71ed0050-0000-0000-0000-000000000003', -3405140),
    ('71ed0055-0000-0000-0000-000000000009', '71ed0050-0000-0000-0000-000000000003', -3373970),
    ('71ed0055-0000-0000-0000-00000000000a', '71ed0050-0000-0000-0000-000000000003', -3344490),
    ('71ed0055-0000-0000-0000-00000000000b', '71ed0050-0000-0000-0000-000000000003', -3312760),
    ('71ed0055-0000-0000-0000-00000000000c', '71ed0050-0000-0000-0000-000000000003', -3281100),
    -- W1 Vorlauf: Ziel -- fünf Boote, Sønderborg (Bahn 6) kommt nicht an
    ('71ed0055-0000-0000-0000-00000000000d', '71ed0050-0000-0000-0000-000000000004', -3384563),
    ('71ed0055-0000-0000-0000-00000000000e', '71ed0050-0000-0000-0000-000000000004', -3355188),
    ('71ed0055-0000-0000-0000-00000000000f', '71ed0050-0000-0000-0000-000000000004', -3322740),
    ('71ed0055-0000-0000-0000-000000000010', '71ed0050-0000-0000-0000-000000000004', -3293899),
    ('71ed0055-0000-0000-0000-000000000011', '71ed0050-0000-0000-0000-000000000004', -3260012),
    -- W2 Vorlauf: Start (Welle -- alle sechs auf denselben Millisekundenwert)
    ('71ed0055-0000-0000-0000-000000000012', '71ed0050-0000-0000-0000-000000000001',  -110000),
    ('71ed0055-0000-0000-0000-000000000013', '71ed0050-0000-0000-0000-000000000001',  -110000),
    ('71ed0055-0000-0000-0000-000000000014', '71ed0050-0000-0000-0000-000000000001',  -110000),
    ('71ed0055-0000-0000-0000-000000000015', '71ed0050-0000-0000-0000-000000000001',  -110000),
    ('71ed0055-0000-0000-0000-000000000016', '71ed0050-0000-0000-0000-000000000001',  -110000),
    ('71ed0055-0000-0000-0000-000000000017', '71ed0050-0000-0000-0000-000000000001',  -110000),
    -- W2 Vorlauf: Mole (250 m)
    ('71ed0055-0000-0000-0000-000000000018', '71ed0050-0000-0000-0000-000000000003',   -64680),
    ('71ed0055-0000-0000-0000-000000000019', '71ed0050-0000-0000-0000-000000000003',   -65020),
    ('71ed0055-0000-0000-0000-00000000001a', '71ed0050-0000-0000-0000-000000000003',   -63890),
    ('71ed0055-0000-0000-0000-00000000001b', '71ed0050-0000-0000-0000-000000000003',   -64290),
    ('71ed0055-0000-0000-0000-00000000001c', '71ed0050-0000-0000-0000-000000000003',   -63160),
    ('71ed0055-0000-0000-0000-00000000001d', '71ed0050-0000-0000-0000-000000000003',   -62680),
    -- W2 Vorlauf: Ziel -- drei Boote sind durch
    ('71ed0055-0000-0000-0000-00000000001e', '71ed0050-0000-0000-0000-000000000004',   -16350),
    ('71ed0055-0000-0000-0000-00000000001f', '71ed0050-0000-0000-0000-000000000004',   -15820),
    ('71ed0055-0000-0000-0000-000000000020', '71ed0050-0000-0000-0000-000000000004',   -14598),
    -- ... und eine Marke ohne Zuordnung: gerade eben ist noch jemand eingelaufen.
    ('71ed0055-0000-0000-0000-000000000021', '71ed0050-0000-0000-0000-000000000004',    -5000),
    -- W3 Zeitfahren: Start (Intervall 30 s)
    ('71ed0055-0000-0000-0000-000000000022', '71ed0050-0000-0000-0000-000000000001', -5880000),
    ('71ed0055-0000-0000-0000-000000000023', '71ed0050-0000-0000-0000-000000000001', -5850000),
    ('71ed0055-0000-0000-0000-000000000024', '71ed0050-0000-0000-0000-000000000001', -5820000),
    ('71ed0055-0000-0000-0000-000000000025', '71ed0050-0000-0000-0000-000000000001', -5790000),
    -- W3 Zeitfahren: Boje Nord (2000 m)
    ('71ed0055-0000-0000-0000-000000000026', '71ed0050-0000-0000-0000-000000000002', -5358600),
    ('71ed0055-0000-0000-0000-000000000027', '71ed0050-0000-0000-0000-000000000002', -5335800),
    ('71ed0055-0000-0000-0000-000000000028', '71ed0050-0000-0000-0000-000000000002', -5288400),
    ('71ed0055-0000-0000-0000-000000000029', '71ed0050-0000-0000-0000-000000000002', -5264100),
    -- W3 Zeitfahren: Mole (4000 m)
    ('71ed0055-0000-0000-0000-00000000002a', '71ed0050-0000-0000-0000-000000000003', -4831100),
    ('71ed0055-0000-0000-0000-00000000002b', '71ed0050-0000-0000-0000-000000000003', -4815400),
    ('71ed0055-0000-0000-0000-00000000002c', '71ed0050-0000-0000-0000-000000000003', -4751700),
    ('71ed0055-0000-0000-0000-00000000002d', '71ed0050-0000-0000-0000-000000000003', -4732800),
    -- W3 Zeitfahren: Ziel
    ('71ed0055-0000-0000-0000-00000000002e', '71ed0050-0000-0000-0000-000000000004', -4297660),
    ('71ed0055-0000-0000-0000-00000000002f', '71ed0050-0000-0000-0000-000000000004', -4290130),
    ('71ed0055-0000-0000-0000-000000000030', '71ed0050-0000-0000-0000-000000000004', -4208795),
    ('71ed0055-0000-0000-0000-000000000031', '71ed0050-0000-0000-0000-000000000004', -4195994)
) as v(id, station, off_ms);

-- Zuordnung Marke -> Boot (48 von 49; `…0021` bleibt frei).
insert into timing_assignment (id, time_mark, competition_match_team, created_at, created_by,
                               updated_at, updated_by, created_by_device, updated_by_device)
select ('71ed0056-0000-0000-0000-0000000000' || substr(v.mark, 35, 2))::uuid,
       v.mark::uuid,
       ('71ed0030-0000-0000-0000-0000000000' || v.team)::uuid,
       now(), null, now(), null, null, null
from (values
    -- W1 Vorlauf: Start, Mole, Ziel -- je Bahn dasselbe Boot
    ('71ed0055-0000-0000-0000-000000000001', '01'), ('71ed0055-0000-0000-0000-000000000002', '02'),
    ('71ed0055-0000-0000-0000-000000000003', '03'), ('71ed0055-0000-0000-0000-000000000004', '04'),
    ('71ed0055-0000-0000-0000-000000000005', '05'), ('71ed0055-0000-0000-0000-000000000006', '06'),
    ('71ed0055-0000-0000-0000-000000000007', '01'), ('71ed0055-0000-0000-0000-000000000008', '02'),
    ('71ed0055-0000-0000-0000-000000000009', '03'), ('71ed0055-0000-0000-0000-00000000000a', '04'),
    ('71ed0055-0000-0000-0000-00000000000b', '05'), ('71ed0055-0000-0000-0000-00000000000c', '06'),
    ('71ed0055-0000-0000-0000-00000000000d', '01'), ('71ed0055-0000-0000-0000-00000000000e', '02'),
    ('71ed0055-0000-0000-0000-00000000000f', '03'), ('71ed0055-0000-0000-0000-000000000010', '04'),
    ('71ed0055-0000-0000-0000-000000000011', '05'),
    -- W2 Vorlauf
    ('71ed0055-0000-0000-0000-000000000012', '0d'), ('71ed0055-0000-0000-0000-000000000013', '0e'),
    ('71ed0055-0000-0000-0000-000000000014', '0f'), ('71ed0055-0000-0000-0000-000000000015', '10'),
    ('71ed0055-0000-0000-0000-000000000016', '11'), ('71ed0055-0000-0000-0000-000000000017', '12'),
    ('71ed0055-0000-0000-0000-000000000018', '0d'), ('71ed0055-0000-0000-0000-000000000019', '0e'),
    ('71ed0055-0000-0000-0000-00000000001a', '0f'), ('71ed0055-0000-0000-0000-00000000001b', '10'),
    ('71ed0055-0000-0000-0000-00000000001c', '11'), ('71ed0055-0000-0000-0000-00000000001d', '12'),
    ('71ed0055-0000-0000-0000-00000000001e', '0d'), ('71ed0055-0000-0000-0000-00000000001f', '0e'),
    ('71ed0055-0000-0000-0000-000000000020', '0f'),
    -- W3 Zeitfahren
    ('71ed0055-0000-0000-0000-000000000022', '19'), ('71ed0055-0000-0000-0000-000000000023', '1a'),
    ('71ed0055-0000-0000-0000-000000000024', '1b'), ('71ed0055-0000-0000-0000-000000000025', '1c'),
    ('71ed0055-0000-0000-0000-000000000026', '19'), ('71ed0055-0000-0000-0000-000000000027', '1a'),
    ('71ed0055-0000-0000-0000-000000000028', '1b'), ('71ed0055-0000-0000-0000-000000000029', '1c'),
    ('71ed0055-0000-0000-0000-00000000002a', '19'), ('71ed0055-0000-0000-0000-00000000002b', '1a'),
    ('71ed0055-0000-0000-0000-00000000002c', '1b'), ('71ed0055-0000-0000-0000-00000000002d', '1c'),
    ('71ed0055-0000-0000-0000-00000000002e', '19'), ('71ed0055-0000-0000-0000-00000000002f', '1a'),
    ('71ed0055-0000-0000-0000-000000000030', '1b'), ('71ed0055-0000-0000-0000-000000000031', '1c')
) as v(mark, team);

-- ==========================================================================================
-- Offizielle Zeiten
--
-- `computed_millis` ist die aus den Marken gerechnete Rohzeit (Ziel minus Start).
-- `penalty_millis` kommt oben drauf, DANN wird auf ZEHNTEL abgeschnitten -- so bleiben
-- Gleichstände auf der veröffentlichten Stufe ehrlich.
--
-- `applied_fingerprint` ist der Stand, der zuletzt an den Lauf geschrieben wurde. Er ist der
-- Beleg „dieses Ergebnis stammt von uns": stimmt er mit dem Lauf überein, darf die Übernahme es
-- weiter pflegen; weicht er ab, hat jemand von Hand eingegriffen und der Stand bleibt stehen.
-- ==========================================================================================

insert into timing_official_time (id, competition_match_team, event, computed_millis, override_millis,
                                  penalty_millis, penalty_note, result_status, dirty, pushed_at,
                                  applied_fingerprint, created_at, created_by, updated_at, updated_by)
select ('71ed0057-0000-0000-0000-0000000000' || v.team)::uuid,
       ('71ed0030-0000-0000-0000-0000000000' || v.team)::uuid,
       '71ed0000-0000-0000-0000-000000000001',
       v.computed, null, v.penalty, v.note, v.status, false, v.pushed_at,
       case when v.pushed_at is null then null
            else pg_temp.fp(v.published, nullif(v.status, 'NONE'),
                            case when v.penalty > 0 then (v.penalty / 1000)::int end,
                            v.note, v.place, true)
       end,
       pg_temp.t(-6000), null, coalesce(v.pushed_at, pg_temp.t(-110)), null
from (values
    -- W1 Vorlauf
    ('01',   95437::bigint,     0::bigint, null,               'NONE',   95400::bigint,    2, pg_temp.t(-3000)),
    ('02',   94812,             0,         null,               'NONE',   94800,            1, pg_temp.t(-3000)),
    ('03',   97260,             0,         null,               'NONE',   97200,            4, pg_temp.t(-3000)),
    ('04',   96101,             0,         null,               'NONE',   96100,            3, pg_temp.t(-3000)),
    ('05',   99988,         10000,         'Frühstart (10 s)', 'NONE',  109900,            5, pg_temp.t(-3000)),
    ('06',   null,              0,         null,               'DNF',   null,           null, pg_temp.t(-3000)),
    -- W2 Vorlauf: drei Zeiten stehen, drei Boote sind noch unterwegs (Zeile ohne Zeit)
    ('0d',   93650,             0,         null,               'NONE',   93600,            1, pg_temp.t(-16)),
    ('0e',   94180,             0,         null,               'NONE',   94100,            2, pg_temp.t(-15)),
    ('0f',   95402,             0,         null,               'NONE',   95400,            3, pg_temp.t(-14)),
    ('10',   null,              0,         null,               'NONE',   null,          null, null),
    ('11',   null,              0,         null,               'NONE',   null,          null, null),
    ('12',   null,              0,         null,               'NONE',   null,          null, null),
    -- W3 Zeitfahren
    ('19', 1582340,             0,         null,               'NONE', 1582300,            2, pg_temp.t(-4800)),
    ('1a', 1559870,             0,         null,               'NONE', 1559800,            1, pg_temp.t(-4800)),
    ('1b', 1611205,             0,         null,               'NONE', 1611200,            4, pg_temp.t(-4800)),
    ('1c', 1594006,             0,         null,               'NONE', 1594000,            3, pg_temp.t(-4800))
) as v(team, computed, penalty, note, status, published, place, pushed_at);

-- ==========================================================================================
-- Zwischenzeiten
--
-- Genau das, was TimingSplitLogic aus den Marken rechnen würde: Fahrzeit seit der Startmarke,
-- Beschriftung vom Posten, Position fortlaufend nach der Distanz auf der Strecke. FINISH zählt
-- nicht mit -- die Zielzeit ist die offizielle Zeit und keine Zwischenzeit.
-- ==========================================================================================

insert into competition_match_team_lap (id, competition_match_team, position, name, lap_millis,
                                        distance_meters, created_at, created_by)
select ('71ed0080-0000-0000-0000-0000' || v.team || '00000' || v.position::text)::uuid,
       ('71ed0030-0000-0000-0000-0000000000' || v.team)::uuid,
       v.position, v.name, v.lap_millis, v.meters, now(), null
from (values
    -- W1 Vorlauf: Mole bei 250 m
    ('01', 1, 'Mole',       45120::bigint,  250),
    ('02', 1, 'Mole',       44860,          250),
    ('03', 1, 'Mole',       46030,          250),
    ('04', 1, 'Mole',       45510,          250),
    ('05', 1, 'Mole',       47240,          250),
    ('06', 1, 'Mole',       48900,          250),
    -- W2 Vorlauf: Mole bei 250 m -- auch die drei Boote, die noch fahren, haben schon eine
    ('0d', 1, 'Mole',       45320,          250),
    ('0e', 1, 'Mole',       44980,          250),
    ('0f', 1, 'Mole',       46110,          250),
    ('10', 1, 'Mole',       45710,          250),
    ('11', 1, 'Mole',       46840,          250),
    ('12', 1, 'Mole',       47320,          250),
    -- W3 Zeitfahren: Boje Nord bei 2000 m, Mole bei 4000 m
    ('19', 1, 'Boje Nord',  521400,        2000),
    ('19', 2, 'Mole',      1048900,        4000),
    ('1a', 1, 'Boje Nord',  514200,        2000),
    ('1a', 2, 'Mole',      1034600,        4000),
    ('1b', 1, 'Boje Nord',  531600,        2000),
    ('1b', 2, 'Mole',      1068300,        4000),
    ('1c', 1, 'Boje Nord',  525900,        2000),
    ('1c', 2, 'Mole',      1057200,        4000)
) as v(team, position, name, lap_millis, meters);

-- ==========================================================================================
-- Startsequenzen
--
-- Je Startposten darf immer nur EINE Sequenz aktiv sein (ARMED/RUNNING/PAUSED, partieller
-- Eindeutigkeitsindex). Deshalb steht hier genau eine scharfe Sequenz -- die des W1-Finales.
-- Die übrigen drei sind Historie: zwei abgearbeitet, eine abgebrochen (Fehlstart).
--
-- `started_at_millis` ist der Zeitpunkt des SEQUENZSTARTS. Der Startschuss fällt erst
-- `lead_in_millis` später -- gegen genau diesen Punkt zählt der Vor-Start-Countdown herunter.
-- ==========================================================================================

insert into timing_start_sequence (id, event, station, mode, interval_millis, state,
                                   started_at_millis, lead_in_millis, paused_at_millis,
                                   pause_shift_millis, created_at, created_by, updated_at, updated_by)
values
    -- W1 Vorlauf: Zeitfahren, alle 30 s ein Boot. Abgearbeitet.
    ('71ed0058-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
     '71ed0050-0000-0000-0000-000000000001', 'INTERVAL', 30000, 'DONE',
     pg_temp.ms(-3490000), 10000, null, 0, pg_temp.t(-3600), null, pg_temp.t(-3180), null),
    -- W2 Vorlauf: erster Versuch -- abgebrochen. Genau die Geste „Fehlstart".
    ('71ed0058-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
     '71ed0050-0000-0000-0000-000000000001', 'MASS', null, 'ABORTED',
     pg_temp.ms(-300000), 20000, null, 0, pg_temp.t(-330), null, pg_temp.t(-285), null),
    -- W2 Vorlauf: zweiter Versuch -- gestartet und abgearbeitet.
    ('71ed0058-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001',
     '71ed0050-0000-0000-0000-000000000001', 'MASS', null, 'DONE',
     pg_temp.ms(-130000), 20000, null, 0, pg_temp.t(-160), null, pg_temp.t(-110), null),
    -- W1 Finale: SCHARF, aber nicht gestartet. Der eine Knopf, auf den alles wartet.
    ('71ed0058-0000-0000-0000-000000000004', '71ed0000-0000-0000-0000-000000000001',
     '71ed0050-0000-0000-0000-000000000001', 'MASS', null, 'ARMED',
     null, 20000, null, 0, pg_temp.t(0), null, pg_temp.t(0), null);

insert into timing_start_sequence_entry (id, sequence, competition_match_team, position, status, time_mark)
select ('71ed0059-0000-0000-0000-0000000000' || lpad(to_hex(v.n), 2, '0'))::uuid,
       v.sequence::uuid,
       ('71ed0030-0000-0000-0000-0000000000' || v.team)::uuid,
       v.position, v.status,
       case when v.mark is null then null else ('71ed0055-0000-0000-0000-0000000000' || v.mark)::uuid end
from (values
    -- W1 Vorlauf: gestartet, jeder Eintrag zeigt auf seine Startmarke
    ( 1, '71ed0058-0000-0000-0000-000000000001', '01', 1, 'STARTED', '01'),
    ( 2, '71ed0058-0000-0000-0000-000000000001', '02', 2, 'STARTED', '02'),
    ( 3, '71ed0058-0000-0000-0000-000000000001', '03', 3, 'STARTED', '03'),
    ( 4, '71ed0058-0000-0000-0000-000000000001', '04', 4, 'STARTED', '04'),
    ( 5, '71ed0058-0000-0000-0000-000000000001', '05', 5, 'STARTED', '05'),
    ( 6, '71ed0058-0000-0000-0000-000000000001', '06', 6, 'STARTED', '06'),
    -- W2 Vorlauf, abgebrochener Versuch: nichts ist gefallen
    ( 7, '71ed0058-0000-0000-0000-000000000002', '0d', 1, 'PENDING', null),
    ( 8, '71ed0058-0000-0000-0000-000000000002', '0e', 2, 'PENDING', null),
    ( 9, '71ed0058-0000-0000-0000-000000000002', '0f', 3, 'PENDING', null),
    (10, '71ed0058-0000-0000-0000-000000000002', '10', 4, 'PENDING', null),
    (11, '71ed0058-0000-0000-0000-000000000002', '11', 5, 'PENDING', null),
    (12, '71ed0058-0000-0000-0000-000000000002', '12', 6, 'PENDING', null),
    -- W2 Vorlauf, zweiter Versuch: Welle, alle sechs gleichzeitig
    (13, '71ed0058-0000-0000-0000-000000000003', '0d', 1, 'STARTED', '12'),
    (14, '71ed0058-0000-0000-0000-000000000003', '0e', 2, 'STARTED', '13'),
    (15, '71ed0058-0000-0000-0000-000000000003', '0f', 3, 'STARTED', '14'),
    (16, '71ed0058-0000-0000-0000-000000000003', '10', 4, 'STARTED', '15'),
    (17, '71ed0058-0000-0000-0000-000000000003', '11', 5, 'STARTED', '16'),
    (18, '71ed0058-0000-0000-0000-000000000003', '12', 6, 'STARTED', '17'),
    -- W1 Finale: scharf gestellt, wartet auf den Start
    (19, '71ed0058-0000-0000-0000-000000000004', '07', 1, 'PENDING', null),
    (20, '71ed0058-0000-0000-0000-000000000004', '08', 2, 'PENDING', null),
    (21, '71ed0058-0000-0000-0000-000000000004', '09', 3, 'PENDING', null),
    (22, '71ed0058-0000-0000-0000-000000000004', '0a', 4, 'PENDING', null),
    (23, '71ed0058-0000-0000-0000-000000000004', '0b', 5, 'PENDING', null),
    (24, '71ed0058-0000-0000-0000-000000000004', '0c', 6, 'PENDING', null)
) as v(n, sequence, team, position, status, mark);

-- ==========================================================================================
-- Zeitstrahl
-- ==========================================================================================

insert into event_schedule_slot (id, event, start_time, competition_setup_match, name,
                                 duration_minutes, created_at, created_by, updated_at, updated_by)
select ('71ed0070-0000-0000-0000-00000000000' || v.n)::uuid,
       '71ed0000-0000-0000-0000-000000000001', v.start_time, v.match::uuid, v.name, v.minutes,
       now(), null, now(), null
from (values
    (1, pg_temp.t(-6600), null,                                   'Obleutebesprechung', 30),
    (2, pg_temp.t(-6000), '71ed0013-0000-0000-0000-000000000005', null,                 45),
    (3, pg_temp.t(-3600), '71ed0013-0000-0000-0000-000000000001', null,                 15),
    (4, pg_temp.t( -180), '71ed0013-0000-0000-0000-000000000003', null,                 15),
    (5, pg_temp.t(  900), '71ed0013-0000-0000-0000-000000000002', null,                 15),
    (6, pg_temp.t( 2100), '71ed0013-0000-0000-0000-000000000004', null,                 15),
    (7, pg_temp.t( 3300), '71ed0013-0000-0000-0000-000000000006', null,                 45),
    (8, pg_temp.t( 4500), null,                                   'Siegerehrung',       30)
) as v(n, start_time, match, name, minutes);

-- ==========================================================================================
-- Livestream: Szenen
--
-- Eine Szene ist eine Adresse plus ein Token, hinter der Wirecast/OBS als Web-Quelle eine
-- transparente 1920x1080-Bühne abgreift. Was on air geht, entscheidet der Server; das
-- Kontroll-Panel sitzt daneben und sieht über denselben Kanal denselben Stand.
-- ==========================================================================================

insert into stream_scene (id, event, name, background, chroma_color, safe_area_percent, trial_mode,
                          created_at, updated_at)
values ('71ed0060-0000-0000-0000-000000000001', '71ed0000-0000-0000-0000-000000000001',
        'Hauptkamera', 'TRANSPARENT', null, 4, false, now(), now()),
       ('71ed0060-0000-0000-0000-000000000002', '71ed0000-0000-0000-0000-000000000001',
        'Zielkamera', 'TRANSPARENT', null, 4, false, now(), now()),
       -- Probemodus: schaltet ALLE echten Quellen ab und läuft in einer Drei-Minuten-Schleife.
       -- Chroma als Rückfall für Mischer ohne Alpha; #00b140 ist das übliche Studio-Grün.
       ('71ed0060-0000-0000-0000-000000000003', '71ed0000-0000-0000-0000-000000000001',
        'Probe (Chroma)', 'CHROMA', '#00b140', 5, true, now(), now());

-- Je Szene und Grafiktyp genau eine Zeile. `enabled = false` heißt „eingerichtet, aber nicht
-- im Spiel" -- die Grafik belegt dann auch keinen Platz.
--
-- Platz-Priorität bei Gedränge auf demselben Anker: RESULT > LAPS > STARTLIST > NEXT_UP.
-- Genau darauf ist „Hauptkamera" gebaut: vier Grafiken teilen sich BOTTOM_CENTER und lösen
-- einander in der Reihenfolge des Rennens ab, ohne sich zu überlagern.
insert into stream_scene_graphic (id, scene, type, enabled, placement, size, settings)
select ('71ed0061-0000-0000-0000-0000000000' || lpad(to_hex(v.n), 2, '0'))::uuid,
       v.scene::uuid, v.type, v.enabled, v.placement, v.size, v.settings::jsonb
from (values
    -- ---- Hauptkamera: die Vollausstattung ----------------------------------------------------
    ( 1, '71ed0060-0000-0000-0000-000000000001', 'STARTLIST',     true,  'BOTTOM_CENTER', 'NORMAL',  '{"displaySeconds": 20}'),
    ( 2, '71ed0060-0000-0000-0000-000000000001', 'NEXT_UP',       true,  'BOTTOM_CENTER', 'COMPACT', '{}'),
    ( 3, '71ed0060-0000-0000-0000-000000000001', 'LAPS',          true,  'BOTTOM_CENTER', 'COMPACT', '{"displaySeconds": 10}'),
    ( 4, '71ed0060-0000-0000-0000-000000000001', 'RESULT',        true,  'BOTTOM_CENTER', 'NORMAL',  '{"displaySeconds": 25}'),
    ( 5, '71ed0060-0000-0000-0000-000000000001', 'CLOCK',         true,  'TOP_RIGHT',     'NORMAL',  '{}'),
    ( 6, '71ed0060-0000-0000-0000-000000000001', 'FINISH_TICKER', true,  'SIDE_RIGHT',    'NORMAL',  '{}'),
    -- Aus, und das mit Absicht: Tagesprogramm und Streckenbild kennen kein Zeitfenster und
    -- lägen sonst dauerhaft als Vollbild über der Kamera. Sie gehören der Regie -- im Panel
    -- für die Pause auf „An" schalten, mit Auto-Aus nach ein paar Sekunden.
    ( 7, '71ed0060-0000-0000-0000-000000000001', 'SCHEDULE',      false, 'FULL_CENTER',   'NORMAL',  '{"listLength": 10}'),
    ( 8, '71ed0060-0000-0000-0000-000000000001', 'COURSE_IMAGE',  false, 'FULL_CENTER',   'NORMAL',  '{}'),
    -- ---- Zielkamera: schmal, aufs Ziel geschnitten -------------------------------------------
    ( 9, '71ed0060-0000-0000-0000-000000000002', 'CLOCK',         true,  'TOP_LEFT',      'COMPACT', '{}'),
    (10, '71ed0060-0000-0000-0000-000000000002', 'RESULT',        true,  'FULL_CENTER',   'NORMAL',  '{"displaySeconds": 30}'),
    (11, '71ed0060-0000-0000-0000-000000000002', 'FINISH_TICKER', true,  'SIDE_LEFT',     'NORMAL',  '{}'),
    (12, '71ed0060-0000-0000-0000-000000000002', 'STARTLIST',     false, 'BOTTOM_CENTER', 'COMPACT', '{"displaySeconds": 12}'),
    -- ---- Probe: jede Grafik auf einem EIGENEN Platz, damit alle gleichzeitig sichtbar sind ----
    (13, '71ed0060-0000-0000-0000-000000000003', 'STARTLIST',     true,  'BOTTOM_CENTER', 'NORMAL',  '{"displaySeconds": 20}'),
    (14, '71ed0060-0000-0000-0000-000000000003', 'NEXT_UP',       true,  'BOTTOM_LEFT',   'COMPACT', '{}'),
    (15, '71ed0060-0000-0000-0000-000000000003', 'LAPS',          true,  'BOTTOM_RIGHT',  'COMPACT', '{"displaySeconds": 10}'),
    (16, '71ed0060-0000-0000-0000-000000000003', 'RESULT',        true,  'FULL_CENTER',   'NORMAL',  '{"displaySeconds": 20}'),
    (17, '71ed0060-0000-0000-0000-000000000003', 'CLOCK',         true,  'TOP_RIGHT',     'NORMAL',  '{}'),
    (18, '71ed0060-0000-0000-0000-000000000003', 'FINISH_TICKER', true,  'SIDE_RIGHT',    'NORMAL',  '{}'),
    (19, '71ed0060-0000-0000-0000-000000000003', 'SCHEDULE',      false, 'FULL_CENTER',   'NORMAL',  '{"listLength": 8}'),
    (20, '71ed0060-0000-0000-0000-000000000003', 'COURSE_IMAGE',  false, 'FULL_CENTER',   'NORMAL',  '{}')
) as v(n, scene, type, enabled, placement, size, settings);

-- ==========================================================================================
-- Geräte-Token
--
-- EINE Token-Infrastruktur für drei Ziele: Zeitnahme-Posten, Anzeige-Board, Stream-Szene --
-- je Zeile genau eines davon. `share_link_token` trägt den Klartext (der Link IST das
-- Credential), `token_hash` ist SHA-256 hex und der einzige Weg, über den geprüft wird.
--
-- Die Klartexte sind hier bewusst sprechend statt zufällig: Teststand, kein Betrieb. Auf einer
-- echten Veranstaltung stellt die Oberfläche sie aus.
--
--   Posten:  /event/71ed0000-0000-0000-0000-000000000001/timing/<stationId>?token=<token>
--   Anzeige: dieselbe Adresse mit `/anzeige` vor dem Fragezeichen
--   Bühne:   /event/71ed0000-0000-0000-0000-000000000001/stream/<sceneId>?token=<token>
-- ==========================================================================================

insert into timing_device_token (id, event, station, board, stream_scene, name, token_hash, revoked,
                                 share_link_token, created_at, created_by)
select ('71ed005a-0000-0000-0000-00000000000' || v.n)::uuid,
       '71ed0000-0000-0000-0000-000000000001',
       v.station::uuid, null, v.scene::uuid, v.name,
       encode(sha256(v.token::bytea), 'hex'), false, v.token, now(), null
from (values
    (1, '71ed0050-0000-0000-0000-000000000001', null,                                   'Start (Link)',          rpad('71edPostenStart',        48, 'a')),
    (2, '71ed0050-0000-0000-0000-000000000002', null,                                   'Boje Nord (Link)',      rpad('71edPostenBojeNord',     48, 'b')),
    (3, '71ed0050-0000-0000-0000-000000000003', null,                                   'Mole (Link)',           rpad('71edPostenMole',         48, 'c')),
    (4, '71ed0050-0000-0000-0000-000000000004', null,                                   'Ziel (Link)',           rpad('71edPostenZiel',         48, 'd')),
    (5, '71ed0050-0000-0000-0000-000000000005', null,                                   'Startanzeige (Link)',   rpad('71edPostenStartanzeige', 48, 'e')),
    (6, null,                                   '71ed0060-0000-0000-0000-000000000001', 'Hauptkamera (Link)',    rpad('71edStreamHauptkamera',  48, 'x')),
    (7, null,                                   '71ed0060-0000-0000-0000-000000000002', 'Zielkamera (Link)',     rpad('71edStreamZielkamera',   48, 'y')),
    (8, null,                                   '71ed0060-0000-0000-0000-000000000003', 'Probe Chroma (Link)',   rpad('71edStreamProbe',        48, 'z'))
) as v(n, station, scene, name, token);

-- ==========================================================================================
-- Zum Schluss: die Adressen ausgeben, damit sie nicht erst zusammengesucht werden müssen.
-- ==========================================================================================

do $$
    declare
        row record;
    begin
        raise notice '--- Zeitnahme- und Streamtest, Veranstaltung 71ed0000-0000-0000-0000-000000000001 ---';
        raise notice 'Leitstand:      /event/71ed0000-0000-0000-0000-000000000001/timing';
        raise notice 'Stream-Regie:   /event/71ed0000-0000-0000-0000-000000000001/streamPanel';
        for row in
            select t.name, '/event/' || t.event || '/stream/' || t.stream_scene ||
                            '?token=' || t.share_link_token as path
            from timing_device_token t
            where t.event = '71ed0000-0000-0000-0000-000000000001' and t.stream_scene is not null
            order by t.name
            loop
                raise notice 'Bühne %: %', rpad(row.name, 22), row.path;
            end loop;
        for row in
            select t.name,
                   '/event/' || t.event || '/timing/' || t.station ||
                   case when s.type = 'ANZEIGE' then '/anzeige' else '' end ||
                   '?token=' || t.share_link_token as path
            from timing_device_token t
                     join timing_station s on s.id = t.station
            where t.event = '71ed0000-0000-0000-0000-000000000001'
            order by s.sorting
            loop
                raise notice 'Posten %: %', rpad(row.name, 21), row.path;
            end loop;
    end
$$;
