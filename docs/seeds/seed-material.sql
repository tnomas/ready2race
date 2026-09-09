-- Testdaten fuer die Materialvermietung (Spec docs/superpowers/specs/2026-09-07-materialvermietung-design.md).
-- Haengt sich an die bestehende Veranstaltung "Coastal Regatta Flensburg 2026"
-- (docs/seeds/seed-dm-coastal-2026.sql, Event 5eed0001-...) und deren Wettkaempfe 1 (CF 2x),
-- 2 (CM 4x+) und 3 (CF 1x). seed-dm-coastal-2026.sql muss also vorher eingespielt sein.
--
-- Anbieter "Bootshaus Nord" mit acht Booten (C1x/C2x/C4x+) und vier Skull-Paaren, eingeladen
-- zur Veranstaltung, mit Angeboten je Materialart und Bedarf an den drei Wettkaempfen.
-- Vier Anfragen in den Status REQUESTED/CONFIRMED/WAITLISTED/DECLINED, eine Grundzuteilung mit
-- bewusster Abweichung von der Startnummer (Team #1, Boot 7) und ein Totalschaden mit offenem
-- Ausfallfenster (Boot 6, bis auf Weiteres).
--
-- Login-Testnutzer: material@test.de / material123
-- Der Passwort-Hash unten ist Argon2id (password4j, wie PasswordUtilities.hash), erzeugt mit
-- Pepper "pepper" - das ist der Pepper aus backend/src/test/kotlin/.../testing.kt, NICHT der
-- der echten .env. Login klappt nur, wenn SECURITY_PEPPER=pepper in der lokalen .env steht;
-- sonst Passwort ueber "Passwort vergessen" zuruecksetzen oder den Hash mit dem eigenen Pepper
-- neu erzeugen (siehe PasswordUtilities.hash).
--
-- Praefix 5eed0009-. Kinder vor Eltern aufraeumen, dann mehrfach ausfuehrbar per
-- "on conflict do nothing".

set search_path to ready2race, pg_catalog, public;

-- =========================================================================================
-- Cleanup (Kinder vor Eltern)
-- =========================================================================================

delete from material_assignment
where material_item in (select id from material_item where material_provider = '5eed0009-0001-0000-0000-000000000001');

delete from material_damage
where material_item in (select id from material_item where material_provider = '5eed0009-0001-0000-0000-000000000001');

delete from material_request
where material_offer in (select id from material_offer where material_provider = '5eed0009-0001-0000-0000-000000000001');

delete from competition_properties_has_material_type
where material_type in (select id from material_type where id::text like '5eed0009-0003%');

delete from material_offer where material_provider = '5eed0009-0001-0000-0000-000000000001';

delete from event_has_material_provider where material_provider = '5eed0009-0001-0000-0000-000000000001';

delete from material_item where material_provider = '5eed0009-0001-0000-0000-000000000001';

-- Materialarten sind globales Stammdatum - nur loeschen, wenn niemand (auch kein anderer
-- Anbieter) mehr darauf verweist.
delete from material_type mt
where mt.id::text like '5eed0009-0003%'
  and not exists (select 1 from material_item mi where mi.material_type = mt.id)
  and not exists (select 1 from material_offer mo where mo.material_type = mt.id)
  and not exists (select 1 from competition_properties_has_material_type cpm where cpm.material_type = mt.id);

delete from app_user_has_role where app_user = '5eed0009-0002-0000-0000-000000000001';

delete from app_user where id = '5eed0009-0002-0000-0000-000000000001';

delete from material_provider where id = '5eed0009-0001-0000-0000-000000000001';

-- =========================================================================================
-- Anbieter, Nutzer, Materialarten
-- =========================================================================================

begin;

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

insert into app_user_has_role (app_user, role)
values ('5eed0009-0002-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003')
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
    ('5eed0009-0005-0000-0000-000000000002', '5eed0001-0000-0000-0000-000000000001', '5eed0009-0001-0000-0000-000000000001', '5eed0009-0003-0000-0000-000000000002', '55 € pro Tag', 3, 30, now(), null, now(), null),
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

commit;

-- Kontrollausgabe
select mt.name as materialart, count(mi.id) as stuecke
from material_type mt
         left join material_item mi on mi.material_type = mt.id and mi.material_provider = '5eed0009-0001-0000-0000-000000000001'
where mt.id::text like '5eed0009-0003%'
group by mt.name
order by mt.name;
