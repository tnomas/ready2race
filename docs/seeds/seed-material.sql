-- Testdaten fuer die Materialvermietung (Spec docs/superpowers/specs/2026-09-07-materialvermietung-design.md,
-- Testkatalog docs/testkatalog-materialvermietung.md Bloecke A-F).
-- Haengt sich an die bestehende Veranstaltung "DM Coastal Rowing 2026"
-- (docs/seeds/seed-dm-coastal-2026.sql, Event 5eed0001-...) und deren Wettkaempfe 1 (CF 2x),
-- 2 (CM 4x+) und 3 (CF 1x). seed-dm-coastal-2026.sql muss also vorher eingespielt sein, und das
-- Backend muss einmal gestartet sein (die Rolle Materialanbieter …0040 saet der JobSeeder).
--
-- Inhalt:
-- - Anbieter "Bootshaus Nord" mit acht Booten (C1x/C2x/C4x+), einem weiteren C4x+ mit Nummer 2
--   ("Vierer 2") und vier Skull-Paaren, eingeladen, mit Angeboten je Materialart und Bedarf an den
--   Wettkaempfen 1-3. Vier Anfragen (REQUESTED/CONFIRMED/WAITLISTED/DECLINED) des DM-Vereins 1 bzw.
--   2, eine Grundzuteilung (Boot 7) und ein Totalschaden mit offenem Ausfallfenster (Boot 6).
-- - Zweiter Anbieter "Ruderwerft Sued" (Abgrenzung OWN, Testkatalog F1) mit zwei C4x+, eigenem
--   Konto, eingeladen, eigenem Angebot und einer offenen Anfrage.
-- - Ein eigener Wettkampf "M1 Materialtest" (CM 4x+ MT) in der DM-Veranstaltung mit Vorlauf (zwei
--   Laeufe) und Finale, alle Laeufe angelegt, Zeiten relativ zum Einspielzeitpunkt:
--     Vorlauf 1 laeuft seit zwei Minuten, Vorlauf 2 startet in 20 Minuten, Finale in 90 Minuten.
--   Vier Boote (DM-Verein 1-4). Was die Anzeigen zeigen:
--     MT 1 (Verein 1): bestaetigt, Grundzuteilung Boot 7 - Abweichung (#1 bzw. #1 im Finale).
--     MT 2 (Verein 2): bestaetigt, Grundzuteilung "Vierer 2" - Nummer = Startnummer 2, keine
--       Abweichung.
--     MT 3 (Verein 3): bestaetigt, Grundzuteilung Boot 6 (Totalschaden) und Ersatz Boot 8 als
--       Ausnahme fuer Vorlauf 2 - dort "#1 · Boot 8", im Finale "#3 · Boot 6".
--     MT 4 (Verein 4): eigenes Boot; offene Anfrage beim zweiten Anbieter (fuer F1).
--   Ein Board (zwei Listen, Material immer zeigen), eine Stream-Szene (Startliste/Naechstes Rennen
--   mit Material) und ein QR-Code "MATERIAL-MEINEVENT-1" fuer Mein Event (Person in MT 1).
-- - Ein Wettkampf "M2 Anmeldetest" (CF 2x AT, Bedarf C2x und Skull-Paar) ohne Laeufe, mit zwei
--   Booten des DM-Vereins 1 (#1 bestaetigt, #2 angefragt) - das ist der Wettkampf fuer Block A:
--   die DM-Wettkaempfe 1-3 haben keine Teilnehmer-Plaetze und erscheinen nicht im Meldeformular.
-- - Ein Vereinsvertreter-Konto des DM-Vereins 1; die Meldefrist der DM-Veranstaltung wird dafuer
--   offen gestellt (gestern bis in 14 Tagen) - Anfrage/Rueckzug im Meldeformular (Block A).
--   ACHTUNG: das veraendert eine Zeile des DM-Seeds (event.registration_available_*); der Cleanup
--   setzt sie nicht zurueck.
--
-- Konten (Passwort bei allen dreien "material123"):
--   material@test.de       Bootshaus Nord   USER + Materialanbieter
--   material2@test.de      Ruderwerft Sued  USER + Materialanbieter
--   verein@material.test   DM-Verein 1      USER + Vereinsvertreter
-- Niemand bekommt Superadmin oder Admin. Sitzungen fuer Handtests legt dieser Seed bewusst NICHT an.
-- Der Passwort-Hash ist Argon2id (password4j, wie PasswordUtilities.hash), erzeugt mit Pepper
-- "pepper" - das ist der Pepper aus backend/src/test/kotlin/.../testing.kt, NICHT der der echten
-- .env. Login klappt nur, wenn SECURITY_PEPPER=pepper in der lokalen .env steht; sonst Passwort
-- ueber "Passwort vergessen" zuruecksetzen.
--
-- Praefix 5eed0009-. Cleanup vorn (Kinder vor Eltern), mehrfach ausfuehrbar. Einspielen:
--   docker exec -i backend-db-1 psql -U developer -d <db> -v ON_ERROR_STOP=1 --single-transaction < docs/seeds/seed-material.sql

set search_path to ready2race, pg_catalog, public;
set time zone 'Europe/Berlin';

-- =========================================================================================
-- Cleanup (Kinder vor Eltern). Anbieter, Konten, Wettkampf und Anzeigen tragen den Praefix;
-- competition_match haengt am Setup-Match (Praefix ueber dessen ID).
-- =========================================================================================

delete from timing_device_token where stream_scene::text like '5eed0009%' or board::text like '5eed0009%';
delete from stream_scene_graphic where scene::text like '5eed0009%';
delete from stream_scene where id::text like '5eed0009%';
delete from board where id::text like '5eed0009%';
delete from qr_codes where id::text like '5eed0009%' or participant::text like '5eed0009%';
delete from event_participant where participant::text like '5eed0009%';

delete from material_assignment
where material_item in (select id from material_item where material_provider::text like '5eed0009-0001%')
   or id::text like '5eed0009%';

delete from material_damage_photo
where material_damage in (select md.id from material_damage md join material_item mi on mi.id = md.material_item
                          where mi.material_provider::text like '5eed0009-0001%');

delete from material_damage
where material_item in (select id from material_item where material_provider::text like '5eed0009-0001%');

delete from material_request
where material_offer in (select id from material_offer where material_provider::text like '5eed0009-0001%')
   or competition_registration::text like '5eed0009%';

delete from competition_properties_has_material_type
where material_type in (select id from material_type where id::text like '5eed0009-0003%');

delete from material_offer where material_provider::text like '5eed0009-0001%';

delete from event_has_material_provider where material_provider::text like '5eed0009-0001%';

delete from material_item where material_provider::text like '5eed0009-0001%';

-- Materialarten sind globales Stammdatum - nur loeschen, wenn niemand (auch kein anderer
-- Anbieter) mehr darauf verweist.
delete from material_type mt
where mt.id::text like '5eed0009-0003%'
  and not exists (select 1 from material_item mi where mi.material_type = mt.id)
  and not exists (select 1 from material_offer mo where mo.material_type = mt.id)
  and not exists (select 1 from competition_properties_has_material_type cpm where cpm.material_type = mt.id);

-- Wettkampf "M1 Materialtest": Laeufe, Boote, Personen, Setup, Wettkampf.
delete from event_schedule_slot where id::text like '5eed0009%';
delete from competition_match_team where id::text like '5eed0009%' or competition_registration::text like '5eed0009%';
delete from competition_match where competition_setup_match::text like '5eed0009%';
delete from competition_registration_named_participant where competition_registration::text like '5eed0009%';
delete from competition_registration where id::text like '5eed0009%';
delete from participant where id::text like '5eed0009%';
update competition_setup_round set next_round = null where id::text like '5eed0009%';
delete from competition_properties where id::text like '5eed0009%';
delete from competition where id::text like '5eed0009%';
delete from named_participant where id::text like '5eed0009%';

delete from app_user_session where app_user::text like '5eed0009-0002%';
delete from app_user_has_role where app_user::text like '5eed0009-0002%';
delete from app_user where id::text like '5eed0009-0002%';

delete from material_provider where id::text like '5eed0009-0001%';

-- =========================================================================================
-- Anbieter, Nutzer, Materialarten
-- =========================================================================================


insert into material_provider (id, name, contact_name, contact_email, contact_phone, note,
                                created_at, created_by, updated_at, updated_by)
values ('5eed0009-0001-0000-0000-000000000001', 'Bootshaus Nord', 'Kirsten Boysen',
        'kontakt@bootshaus-nord.de', '0461 1234567', null, now(), null, now(), null)
on conflict (id) do nothing;

-- Passwort "material123", Argon2id mit Pepper "pepper" (siehe Kopfkommentar).
-- app_user traegt eine INSERT-Regel (Spiegel-Insert nach email_address, V202502030930), die sich
-- mit "on conflict" nicht vertraegt ("INSERT with ON CONFLICT clause cannot be used with table
-- that has INSERT or UPDATE rules") - deshalb hier insert...select...where not exists.
insert into app_user (id, email, password, firstname, lastname, language, material_provider,
                       created_at, created_by, updated_at, updated_by)
select '5eed0009-0002-0000-0000-000000000001', 'material@test.de',
       '$argon2id$v=19$m=15360,t=2,p=1$1Jvoi3oRbs7klQhcr4lVOvTZ49edHoVJ1LgKwy8IUekLrDPYbjRHY+rPyNTrbU1wB20Hqrrp7gY47HXelPJbjQ$y4lUDxE93j2wQfbHcfAZHSJhqYmNo0RpSQuK+EBH27E',
       'Bootshaus', 'Nord', 'de', '5eed0009-0001-0000-0000-000000000001',
       now(), null, now(), null
where not exists (select 1 from app_user where id = '5eed0009-0002-0000-0000-000000000001');

-- Rollen: USER wie jedes Konto, dazu die systemverwaltete Rolle Materialanbieter (…0040, sät
-- der Backend-Start über den JobSeeder - das Backend muss also vor dem Seed einmal gelaufen sein).
-- Früher stand hier …0003; das ist die Superadmin-Rolle und darf hier nie wieder auftauchen.
insert into app_user_has_role (app_user, role)
values ('5eed0009-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
       ('5eed0009-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000040')
on conflict do nothing;

insert into material_type (id, name, category, description, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0003-0000-0000-000000000001', 'C1x', 'BOAT', 'Coastal-Einer', now(), null, now(), null),
       ('5eed0009-0003-0000-0000-000000000002', 'C2x', 'BOAT', 'Coastal-Doppelzweier', now(), null, now(), null),
       ('5eed0009-0003-0000-0000-000000000003', 'C4x+', 'BOAT', 'Coastal-Doppelvierer mit Steuerperson', now(), null, now(), null),
       ('5eed0009-0003-0000-0000-000000000004', 'Skull-Paar', 'OTHER', 'Ersatz-Skullpaar', now(), null, now(), null)
on conflict (id) do nothing;

-- =========================================================================================
-- Flotte: acht Boote (Nummer = Rumpfnummer) plus vier Skull-Paare ohne Nummer
-- =========================================================================================

insert into material_item (id, material_provider, material_type, number, label, note, status,
                            created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0004-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000001', 1, 'Boot 1', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000002', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000001', 2, 'Boot 2', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000003', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000002', 3, 'Boot 3', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000004', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000002', 4, 'Boot 4', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000005', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000002', 5, 'Boot 5', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000006', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', 6, 'Boot 6', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000007', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', 7, 'Boot 7', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000008', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', 8, 'Boot 8', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000011', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000004', null, 'Skullpaar 1', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000012', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000004', null, 'Skullpaar 2', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000013', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000004', null, 'Skullpaar 3', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000014', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000004', null, 'Skullpaar 4', null, 'ACTIVE', now(), null, now(), null)
on conflict (id) do nothing;

-- =========================================================================================
-- Einladung, Angebote, Bedarf an den drei Wettkaempfen 1 (CF 2x/C2x), 2 (CM 4x+/C4x+),
-- 3 (CF 1x/C1x)
-- =========================================================================================

insert into event_has_material_provider (event, material_provider, requests_closed,
                                          created_at, created_by, updated_at, updated_by)
values ('5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', false,
        now(), null, now(), null)
on conflict (event, material_provider) do nothing;

insert into material_offer (id, event, material_provider, material_type, price_text,
                             planned_count, changeover_minutes, created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0005-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000001', '35 € pro Tag', 2, 30, now(), null, now(), null),
    ('5eed0009-0005-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000002', '55 € pro Tag', 5, 30, now(), null, now(), null),
    ('5eed0009-0005-0000-0000-000000000003', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', '95 € pro Tag', 3, 30, now(), null, now(), null),
    ('5eed0009-0005-0000-0000-000000000004', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000004', '15 € pro Tag', 4, 30, now(), null, now(), null)
on conflict (event, material_provider, material_type) do nothing;

insert into competition_properties_has_material_type (competition_properties, material_type, count)
values
    ((select cp.id from competition_properties cp join competition c on c.id = cp.competition
      where c.event = '5eed0001-0000-0000-0000-000000000001' and cp.identifier = '1'),
     '5eed0009-0003-0000-0000-000000000002', 1),
    ((select cp.id from competition_properties cp join competition c on c.id = cp.competition
      where c.event = '5eed0001-0000-0000-0000-000000000001' and cp.identifier = '2'),
     '5eed0009-0003-0000-0000-000000000003', 1),
    ((select cp.id from competition_properties cp join competition c on c.id = cp.competition
      where c.event = '5eed0001-0000-0000-0000-000000000001' and cp.identifier = '3'),
     '5eed0009-0003-0000-0000-000000000001', 1)
on conflict (competition_properties, material_type) do nothing;

-- =========================================================================================
-- Anfragen: REQUESTED (Bremerhaven CF 2x), CONFIRMED (Bremerhaven CM 4x+, spaeter mit
-- Abweichung zugeteilt), WAITLISTED (Bremerhaven CF 1x), DECLINED (ARV Kiel CF 2x)
-- =========================================================================================

insert into material_request (id, competition_registration, material_offer, count, status,
                               decision_note, requested_at, decided_at, created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0006-0000-0000-000000000001', '5eed0001-0020-0000-0000-000000000001', '5eed0009-0005-0000-0000-000000000002', 1, 'REQUESTED',
     null, '2026-07-20 09:00:00', null, now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000002', '5eed0001-0020-0000-0000-000000000007', '5eed0009-0005-0000-0000-000000000003', 1, 'CONFIRMED',
     null, '2026-07-18 08:30:00', '2026-07-19 10:00:00', now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000003', '5eed0001-0020-0000-0000-00000000000d', '5eed0009-0005-0000-0000-000000000001', 1, 'WAITLISTED',
     'Beide C1x schon vergeben, erste Absage rueckt nach.', '2026-07-21 11:15:00', '2026-07-22 09:00:00', now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000004', '5eed0001-0020-0000-0000-000000000002', '5eed0009-0005-0000-0000-000000000002', 1, 'DECLINED',
     'Anfrage kam nach Vergabeschluss fuer diese Klasse.', '2026-07-25 14:00:00', '2026-07-26 09:30:00', now(), null, now(), null)
on conflict (competition_registration, material_offer) do nothing;

-- =========================================================================================
-- Grundzuteilung mit Abweichung: Team #1 (Bremerhaven CM 4x+) bekommt Boot 7
-- =========================================================================================

insert into material_assignment (id, material_request, material_item, competition_match,
                                  created_at, created_by, updated_at, updated_by)
values ('5eed0009-0007-0000-0000-000000000001', '5eed0009-0006-0000-0000-000000000002',
        '5eed0009-0004-0000-0000-000000000007', null, now(), null, now(), null)
on conflict (material_request, material_item, competition_match) do nothing;

-- =========================================================================================
-- Totalschaden an Boot 6 mit offenem Ausfallfenster (bis auf Weiteres), Verursacher als
-- Momentaufnahme (ARV Kiel CM 4x+, Team #2)
-- =========================================================================================

insert into material_damage (id, material_item, reported_at, reported_by, description, severity,
                              status, caused_by_registration, caused_by_team, caused_by_club,
                              caused_by_competition, out_of_service_from, out_of_service_until,
                              repaired_at, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0008-0000-0000-000000000001', '5eed0009-0004-0000-0000-000000000006',
        '2026-08-15 18:30:00', null, 'Leck am Bug nach Kollision im Ziel, Boot nimmt Wasser.',
        'TOTAL', 'REPORTED', '5eed0001-0020-0000-0000-000000000008', 'ARV Kiel CM 4x+', 'ARV Kiel',
        'CM 4x+', '2026-08-15 18:30:00', null, null, now(), null, now(), null)
on conflict (id) do nothing;


-- =========================================================================================
-- Zweiter Anbieter (Abgrenzung OWN, F1), weitere Konten, Meldefrist offen
-- =========================================================================================

insert into material_provider (id, name, contact_name, contact_email, contact_phone, note,
                                created_at, created_by, updated_at, updated_by)
values ('5eed0009-0001-0000-0000-000000000002', 'Ruderwerft Süd', 'Jens Petersen', 'material2@test.de', null, null, now(), null, now(), null)
on conflict (id) do nothing;

-- Die Kontaktadresse von Ruderwerft Süd gehört zum Konto material2@test.de (Sprache en): eine
-- Rückzugs-Mail an diesen Anbieter kommt deshalb auf Englisch (Sprache des Empfänger-Kontos).
insert into app_user (id, email, password, firstname, lastname, language, material_provider, club,
                       created_at, created_by, updated_at, updated_by)
select v.id::uuid, v.email, '$argon2id$v=19$m=15360,t=2,p=1$1Jvoi3oRbs7klQhcr4lVOvTZ49edHoVJ1LgKwy8IUekLrDPYbjRHY+rPyNTrbU1wB20Hqrrp7gY47HXelPJbjQ$y4lUDxE93j2wQfbHcfAZHSJhqYmNo0RpSQuK+EBH27E', v.firstname, v.lastname, v.language, v.provider::uuid, v.club::uuid,
       now(), null, now(), null
from (values ('5eed0009-0002-0000-0000-000000000002', 'material2@test.de', 'Ruderwerft', 'Süd', 'en',
              '5eed0009-0001-0000-0000-000000000002', null),
             ('5eed0009-0002-0000-0000-000000000003', 'verein@material.test', 'Vereins', 'Vertretung', 'de',
              null, '5eed0002-0000-0000-0000-000000000001')) as v(id, email, firstname, lastname, language, provider, club)
where not exists (select 1 from app_user au where au.id = v.id::uuid);

-- USER (…0001) für alle; Materialanbieter (…0040) bzw. Vereinsvertreter (…0002). Nie …0003
-- (Superadmin) oder …0000 (Admin).
insert into app_user_has_role (app_user, role)
values ('5eed0009-0002-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
       ('5eed0009-0002-0000-0000-000000000002', '00000000-0000-0000-0000-000000000040'),
       ('5eed0009-0002-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
       ('5eed0009-0002-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002')
on conflict do nothing;

-- Meldefrist der DM-Veranstaltung offen (Zeile des DM-Seeds, siehe Kopfkommentar).
update event
set registration_available_from = now() - interval '1 day',
    registration_available_to   = now() + interval '14 days',
    updated_at                  = now()
where id = '5eed0001-0000-0000-0000-000000000001';

insert into material_item (id, material_provider, material_type, number, label, note, status,
                            created_at, created_by, updated_at, updated_by)
values
    -- Bootshaus Nord: ein C4x+ mit Nummer 2 - passt zur Startnummer 2 von MT 2 (kein Hinweis).
    ('5eed0009-0004-0000-0000-000000000009', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', 2, 'Vierer 2', null, 'ACTIVE', now(), null, now(), null),
    -- Ruderwerft Süd: zwei eigene C4x+ - darf Bootshaus Nord nie sehen.
    ('5eed0009-0004-0000-0000-000000000021', '5eed0009-0001-0000-0000-000000000002', '5eed0009-0003-0000-0000-000000000003', 21, 'Süd 21', null, 'ACTIVE', now(), null, now(), null),
    ('5eed0009-0004-0000-0000-000000000022', '5eed0009-0001-0000-0000-000000000002', '5eed0009-0003-0000-0000-000000000003', 22, 'Süd 22', null, 'ACTIVE', now(), null, now(), null)
on conflict (id) do nothing;

insert into event_has_material_provider (event, material_provider, requests_closed,
                                          created_at, created_by, updated_at, updated_by)
values ('5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000002', false, now(), null, now(), null)
on conflict (event, material_provider) do nothing;

insert into material_offer (id, event, material_provider, material_type, price_text,
                             planned_count, changeover_minutes, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0005-0000-0000-000000000005', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000002', '5eed0009-0003-0000-0000-000000000003', '80 € pro Tag', 2, 20, now(), null, now(), null)
on conflict (event, material_provider, material_type) do nothing;

-- =========================================================================================
-- Wettkampf "M1 Materialtest" mit Vorlauf (2 Läufe) und Finale, alle Läufe angelegt
-- =========================================================================================

insert into named_participant (id, name, description, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0012-0000-0000-000000000001', 'Ruderer:in (Materialtest)', null, now(), null, now(), null);

insert into competition (id, event, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0010-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', now(), null, now(), null);

insert into event_day_has_competition (event_day, competition, created_at, created_by)
values ('5eed0001-0001-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000001', now(), null);

insert into competition_properties (id, competition, competition_template, identifier, name, short_name,
                                     description, competition_category)
values ('5eed0009-0011-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000001', null,
        'M1', 'Männer-Doppelvierer Materialtest', 'CM 4x+ MT', 'Seed der Materialvermietung', null);

-- Zwei Plätze je Boot reichen für die Anzeigen; die Besetzung ist hier nicht Gegenstand.
insert into competition_properties_has_named_participant (competition_properties, named_participant,
                                                           count_males, count_females, count_non_binary, count_mixed)
values ('5eed0009-0011-0000-0000-000000000001', '5eed0009-0012-0000-0000-000000000001', 0, 0, 0, 2);

insert into competition_properties_has_material_type (competition_properties, material_type, count)
values ('5eed0009-0011-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000003', 1);

insert into competition_setup (competition_properties, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0011-0000-0000-000000000001', now(), null, now(), null);

insert into competition_setup_round (id, competition_setup, competition_setup_template, next_round, name,
                                      required, use_default_seeding, places_option, is_qualification)
values ('5eed0009-0013-0000-0000-000000000002', '5eed0009-0011-0000-0000-000000000001', null,
        null, 'Finale', true, true, 'EQUAL', false);

insert into competition_setup_round (id, competition_setup, competition_setup_template, next_round, name,
                                      required, use_default_seeding, places_option, is_qualification)
values ('5eed0009-0013-0000-0000-000000000001', '5eed0009-0011-0000-0000-000000000001', null,
        '5eed0009-0013-0000-0000-000000000002', 'Vorlauf', true, true, 'ASCENDING', true);

insert into competition_setup_match (id, competition_setup_round, competition_setup_group, weighting,
                                      teams, name, execution_order, start_time_offset)
values ('5eed0009-0014-0000-0000-000000000001', '5eed0009-0013-0000-0000-000000000001', null, 1, 2, 'Vorlauf 1', 1, null),
       ('5eed0009-0014-0000-0000-000000000002', '5eed0009-0013-0000-0000-000000000001', null, 2, 2, 'Vorlauf 2', 2, null),
       ('5eed0009-0014-0000-0000-000000000003', '5eed0009-0013-0000-0000-000000000002', null, 1, 4, 'Finale', 1, null);

insert into competition_registration (id, event_registration, competition, club, name, team_number,
                                       created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0020-0000-0000-000000000001', '5eed000a-0000-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000001',
     '5eed0002-0000-0000-0000-000000000001', 'MT 1', 1, now(), null, now(), null),
    ('5eed0009-0020-0000-0000-000000000002', '5eed000a-0000-0000-0000-000000000002', '5eed0009-0010-0000-0000-000000000001',
     '5eed0002-0000-0000-0000-000000000002', 'MT 2', 2, now(), null, now(), null),
    ('5eed0009-0020-0000-0000-000000000003', '5eed000a-0000-0000-0000-000000000003', '5eed0009-0010-0000-0000-000000000001',
     '5eed0002-0000-0000-0000-000000000003', 'MT 3', 3, now(), null, now(), null),
    ('5eed0009-0020-0000-0000-000000000004', '5eed000a-0000-0000-0000-000000000004', '5eed0009-0010-0000-0000-000000000001',
     '5eed0002-0000-0000-0000-000000000004', 'MT 4', 4, now(), null, now(), null);

insert into participant (id, club, firstname, lastname, year, gender, external, external_club_name,
                          created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0030-0000-0000-000000000001', '5eed0002-0000-0000-0000-000000000001', 'Mats', 'Boysen', 1996, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000002', '5eed0002-0000-0000-0000-000000000001', 'Ole', 'Hansen', 1994, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000003', '5eed0002-0000-0000-0000-000000000002', 'Jan', 'Petersen', 1997, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000004', '5eed0002-0000-0000-0000-000000000002', 'Finn', 'Jessen', 1995, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000005', '5eed0002-0000-0000-0000-000000000003', 'Lars', 'Carstensen', 1993, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000006', '5eed0002-0000-0000-0000-000000000003', 'Timo', 'Nissen', 1998, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000007', '5eed0002-0000-0000-0000-000000000004', 'Malte', 'Thomsen', 1992, 'M', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-000000000008', '5eed0002-0000-0000-0000-000000000004', 'Sven', 'Clausen', 1999, 'M', false, null, now(), null, now(), null);

insert into competition_registration_named_participant (competition_registration, named_participant, participant)
select ('5eed0009-0020-0000-0000-00000000000' || ((n + 1) / 2))::uuid,
       '5eed0009-0012-0000-0000-000000000001',
       ('5eed0009-0030-0000-0000-00000000000' || n)::uuid
from generate_series(1, 8) as n;

-- Vorlauf 1 läuft seit zwei Minuten (aktiviert vor fünf), Vorlauf 2 und Finale stehen an.
insert into competition_match (competition_setup_match, start_time, started_at, activated_at, finished_at,
                                created_at, created_by, updated_at, updated_by)
values ('5eed0009-0014-0000-0000-000000000001', date_trunc('minute', now()) - interval '2 minutes',
        now() - interval '2 minutes', now() - interval '5 minutes', null, now(), null, now(), null),
       ('5eed0009-0014-0000-0000-000000000002', date_trunc('minute', now()) + interval '20 minutes',
        null, null, null, now(), null, now(), null),
       ('5eed0009-0014-0000-0000-000000000003', date_trunc('minute', now()) + interval '90 minutes',
        null, null, null, now(), null, now(), null);

-- Startnummer = Setzposition im Lauf: im Vorlauf 2 startet MT 3 als #1, im Finale als #3.
insert into competition_match_team (id, competition_match, competition_registration, start_number,
                                     place, out, failed, started_at, created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0015-0000-0000-000000000001', '5eed0009-0014-0000-0000-000000000001', '5eed0009-0020-0000-0000-000000000001', 1, null, false, false, now() - interval '2 minutes', now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000002', '5eed0009-0014-0000-0000-000000000001', '5eed0009-0020-0000-0000-000000000002', 2, null, false, false, now() - interval '2 minutes', now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000003', '5eed0009-0014-0000-0000-000000000002', '5eed0009-0020-0000-0000-000000000003', 1, null, false, false, null, now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000004', '5eed0009-0014-0000-0000-000000000002', '5eed0009-0020-0000-0000-000000000004', 2, null, false, false, null, now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000005', '5eed0009-0014-0000-0000-000000000003', '5eed0009-0020-0000-0000-000000000001', 1, null, false, false, null, now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000006', '5eed0009-0014-0000-0000-000000000003', '5eed0009-0020-0000-0000-000000000002', 2, null, false, false, null, now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000007', '5eed0009-0014-0000-0000-000000000003', '5eed0009-0020-0000-0000-000000000003', 3, null, false, false, null, now(), null, now(), null),
    ('5eed0009-0015-0000-0000-000000000008', '5eed0009-0014-0000-0000-000000000003', '5eed0009-0020-0000-0000-000000000004', 4, null, false, false, null, now(), null, now(), null);

insert into event_schedule_slot (id, event, start_time, competition_setup_match, name, duration_minutes,
                                  created_at, created_by, updated_at, updated_by)
select ('5eed0009-0016-0000-0000-00000000000' || right(cm.competition_setup_match::text, 1))::uuid, '5eed0001-0000-0000-0000-000000000001',
       cm.start_time, cm.competition_setup_match, null, 15, now(), null, now(), null
from competition_match cm
where cm.competition_setup_match::text like '5eed0009-0014%';

-- Anfragen und Zuteilungen der Materialtest-Boote.
insert into material_request (id, competition_registration, material_offer, count, status,
                               decision_note, requested_at, decided_at, created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0006-0000-0000-000000000011', '5eed0009-0020-0000-0000-000000000001', '5eed0009-0005-0000-0000-000000000003', 1, 'CONFIRMED',
     null, now() - interval '10 days', now() - interval '9 days', now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000012', '5eed0009-0020-0000-0000-000000000002', '5eed0009-0005-0000-0000-000000000003', 1, 'CONFIRMED',
     null, now() - interval '10 days', now() - interval '9 days', now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000013', '5eed0009-0020-0000-0000-000000000003', '5eed0009-0005-0000-0000-000000000003', 1, 'CONFIRMED',
     null, now() - interval '8 days', now() - interval '7 days', now(), null, now(), null),
    -- MT 4 fragt beim zweiten Anbieter an - Bootshaus Nord darf diese Anfrage nie sehen (F1).
    ('5eed0009-0006-0000-0000-000000000014', '5eed0009-0020-0000-0000-000000000004', '5eed0009-0005-0000-0000-000000000005', 1, 'REQUESTED',
     null, now() - interval '3 days', null, now(), null, now(), null)
on conflict (competition_registration, material_offer) do nothing;

insert into material_assignment (id, material_request, material_item, competition_match,
                                  created_at, created_by, updated_at, updated_by)
values
    -- MT 1: Boot 7 für alle Läufe - Abweichung von der Startnummer 1.
    ('5eed0009-0007-0000-0000-000000000011', '5eed0009-0006-0000-0000-000000000011', '5eed0009-0004-0000-0000-000000000007', null, now(), null, now(), null),
    -- MT 2: "Vierer 2" - Nummer 2 = Startnummer 2 in Vorlauf 1 und Finale.
    ('5eed0009-0007-0000-0000-000000000012', '5eed0009-0006-0000-0000-000000000012', '5eed0009-0004-0000-0000-000000000009', null, now(), null, now(), null),
    -- MT 3: Grundzuteilung Boot 6 (Totalschaden, Ausfall offen) ...
    ('5eed0009-0007-0000-0000-000000000013', '5eed0009-0006-0000-0000-000000000013', '5eed0009-0004-0000-0000-000000000006', null, now(), null, now(), null),
    -- ... und Ersatz Boot 8 als Ausnahme für Vorlauf 2 (Ersatzwahl nach dem Schaden).
    ('5eed0009-0007-0000-0000-000000000014', '5eed0009-0006-0000-0000-000000000013', '5eed0009-0004-0000-0000-000000000008', '5eed0009-0014-0000-0000-000000000002', now(), null, now(), null)
on conflict (material_request, material_item, competition_match) do nothing;

-- =========================================================================================
-- Wettkampf "M2 Anmeldetest" für Block A: offen im Meldeformular des DM-Vereins 1 (die
-- DM-Wettkämpfe haben keine Teilnehmer-Plätze und erscheinen deshalb nicht im Formular).
-- Bedarf C2x (Boot) und Skull-Paar (OTHER). Zwei Boote ohne Lauf, also bearbeitbar:
--   #1: C2x bei Bootshaus Nord BESTÄTIGT (Rückzug im Formular -> Mail an den Anbieter, A6)
--   #2: C2x ANGEFRAGT (A4: erneutes Speichern ändert nichts)
-- =========================================================================================

insert into competition (id, event, created_at, created_by, updated_at, updated_by)
values ('5eed0009-0010-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000001', now(), null, now(), null);

insert into event_day_has_competition (event_day, competition, created_at, created_by)
values ('5eed0001-0001-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000002', now(), null);

insert into competition_properties (id, competition, competition_template, identifier, name, short_name,
                                     description, competition_category)
values ('5eed0009-0011-0000-0000-000000000002', '5eed0009-0010-0000-0000-000000000002', null,
        'M2', 'Frauen-Doppelzweier Anmeldetest', 'CF 2x AT', 'Seed der Materialvermietung (Meldeformular)', null);

insert into competition_properties_has_named_participant (competition_properties, named_participant,
                                                           count_males, count_females, count_non_binary, count_mixed)
values ('5eed0009-0011-0000-0000-000000000002', '5eed0009-0012-0000-0000-000000000001', 0, 0, 0, 2);

insert into competition_properties_has_material_type (competition_properties, material_type, count)
values ('5eed0009-0011-0000-0000-000000000002', '5eed0009-0003-0000-0000-000000000002', 1),
       ('5eed0009-0011-0000-0000-000000000002', '5eed0009-0003-0000-0000-000000000004', 2);

insert into participant (id, club, firstname, lastname, year, gender, external, external_club_name,
                          created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0030-0000-0000-000000000009', '5eed0002-0000-0000-0000-000000000001', 'Ida', 'Lorenzen', 1997, 'F', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-00000000000a', '5eed0002-0000-0000-0000-000000000001', 'Wiebke', 'Paulsen', 1996, 'F', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-00000000000b', '5eed0002-0000-0000-0000-000000000001', 'Frauke', 'Ketelsen', 1999, 'F', false, null, now(), null, now(), null),
    ('5eed0009-0030-0000-0000-00000000000c', '5eed0002-0000-0000-0000-000000000001', 'Svenja', 'Matthiesen', 1995, 'F', false, null, now(), null, now(), null);

insert into competition_registration (id, event_registration, competition, club, name, team_number,
                                       created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0020-0000-0000-000000000005', '5eed000a-0000-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000002',
     '5eed0002-0000-0000-0000-000000000001', '#1', null, now(), null, now(), null),
    ('5eed0009-0020-0000-0000-000000000006', '5eed000a-0000-0000-0000-000000000001', '5eed0009-0010-0000-0000-000000000002',
     '5eed0002-0000-0000-0000-000000000001', '#2', null, now(), null, now(), null);

insert into competition_registration_named_participant (competition_registration, named_participant, participant)
values ('5eed0009-0020-0000-0000-000000000005', '5eed0009-0012-0000-0000-000000000001', '5eed0009-0030-0000-0000-000000000009'),
       ('5eed0009-0020-0000-0000-000000000005', '5eed0009-0012-0000-0000-000000000001', '5eed0009-0030-0000-0000-00000000000a'),
       ('5eed0009-0020-0000-0000-000000000006', '5eed0009-0012-0000-0000-000000000001', '5eed0009-0030-0000-0000-00000000000b'),
       ('5eed0009-0020-0000-0000-000000000006', '5eed0009-0012-0000-0000-000000000001', '5eed0009-0030-0000-0000-00000000000c');

insert into material_request (id, competition_registration, material_offer, count, status,
                               decision_note, requested_at, decided_at, created_at, created_by, updated_at, updated_by)
values
    ('5eed0009-0006-0000-0000-000000000015', '5eed0009-0020-0000-0000-000000000005', '5eed0009-0005-0000-0000-000000000002', 1, 'CONFIRMED',
     null, now() - interval '6 days', now() - interval '5 days', now(), null, now(), null),
    ('5eed0009-0006-0000-0000-000000000016', '5eed0009-0020-0000-0000-000000000006', '5eed0009-0005-0000-0000-000000000002', 1, 'REQUESTED',
     null, now() - interval '2 days', null, now(), null, now(), null)
on conflict (competition_registration, material_offer) do nothing;

-- =========================================================================================
-- Anzeigen: Board, Stream-Szene, Mein-Event-Zugang
-- =========================================================================================

insert into board (id, event_id, name, config, created_at, updated_at)
values ('5eed0009-0040-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 'Materialtest-Board',
        '{"columns": 2, "showHeader": true, "tiles": [
            {"elements": [{"type": "MATCH_LIST", "listMode": "RUNNING", "showMaterial": true, "limit": 4}]},
            {"elements": [{"type": "MATCH_LIST", "listMode": "UPCOMING", "showMaterial": true, "limit": 4}]}
        ]}'::jsonb, now(), now());

insert into stream_scene (id, event, name, background, chroma_color, safe_area_percent, trial_mode,
                          created_at, updated_at)
values ('5eed0009-0041-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', 'Materialtest', 'TRANSPARENT', null, 4, false, now(), now());

insert into stream_scene_graphic (id, scene, type, enabled, placement, size, settings)
values ('5eed0009-0042-0000-0000-000000000001', '5eed0009-0041-0000-0000-000000000001', 'STARTLIST', true,
        'BOTTOM_CENTER', 'NORMAL', '{"displaySeconds": 20, "showMaterial": true}'),
       ('5eed0009-0042-0000-0000-000000000002', '5eed0009-0041-0000-0000-000000000001', 'NEXT_UP', true,
        'BOTTOM_LEFT', 'COMPACT', '{"showMaterial": true}');

-- Mein Event für Mats Boysen (MT 1): Frontend /results/MATERIAL-MEINEVENT-1 (merkt sich den Code und
-- springt auf /results/event/<eventId>?tab=my-event); API /api/event/<eventId>/info/my-event/MATERIAL-MEINEVENT-1
insert into qr_codes (id, qr_code_id, app_user, participant, event, created_at, created_by)
values ('5eed0009-0043-0000-0000-000000000001', 'MATERIAL-MEINEVENT-1', null,
        '5eed0009-0030-0000-0000-000000000001', '5eed0001-0000-0000-0000-000000000001', now(), null);

-- Kontrollausgabe
select mt.name as materialart, count(mi.id) as stuecke
from material_type mt
         left join material_item mi on mi.material_type = mt.id and mi.material_provider = '5eed0009-0001-0000-0000-000000000001'
where mt.id::text like '5eed0009-0003%'
group by mt.name
order by mt.name;

select emf.competition_match_team, cmt.start_number, emf.number, emf.label, emf.deviates_from_start_number
from effective_material_for_match_team emf
         join competition_match_team cmt on cmt.id = emf.competition_match_team
where cmt.id::text like '5eed0009%'
order by cmt.competition_match, cmt.start_number;
