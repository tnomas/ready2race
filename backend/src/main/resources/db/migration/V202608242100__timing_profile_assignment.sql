set search_path to ready2race, pg_catalog, public;

-- Ein Zeitnahmeprofil ist das, WOMIT eine Partie gestoppt wird: bei RaceClocker das Rennen, bei
-- der internen Zeitnahme der Zeitnahmetyp. Beide spielten bisher dieselbe Rolle in zwei
-- getrennten Mechaniken -- das Rennen als Spalte am Wettkampf ohne jede Vererbung, der Typ als
-- Zuordnungstabelle mit zwei Ebenen. Diese Tabelle führt beides zusammen und erweitert die
-- Vererbung auf vier Ebenen: Veranstaltung -> Wettkampf -> Runde -> Partie. Die speziellste
-- gesetzte Ebene gewinnt (TimingProfileResolveLogic).
--
-- Motiv für die Partie-Ebene: ein Wettkampf, dessen Qualifikations-Partie ein Zeitfahren ist und
-- dessen Folge-Partien im Wellenstart laufen.
create table timing_profile_assignment
(
    id                      uuid      primary key,
    -- Immer gesetzt, auch in den tieferen Zeilen: Der Baum wird je Veranstaltung am Stück
    -- gelesen; ohne diese Spalte bräuchte jede Lesung die Join-Kette über
    -- competition_setup_round -> competition_setup -> competition_properties -> competition.
    event                   uuid      not null references event on delete cascade,
    competition             uuid      references competition on delete cascade,
    competition_setup_round uuid      references competition_setup_round on delete cascade,
    competition_setup_match uuid      references competition_setup_match on delete cascade,
    -- Genau eine der beiden Profil-Arten. Zwei Spalten statt einer polymorphen Referenz: so
    -- bleiben die Fremdschlüssel echt, und das restrict behält seine Wirkung -- das Löschen eines
    -- Rennens oder Typs darf zugeordnete Partien nicht stillschweigend abhängen.
    raceclocker_race        uuid      references raceclocker_race on delete restrict,
    timing_mode             uuid      references timing_mode on delete restrict,
    created_at              timestamp not null,
    created_by              uuid      references app_user on delete set null,
    updated_at              timestamp not null,
    updated_by              uuid      references app_user on delete set null,
    constraint chk_timing_profile_genau_eines check (
        num_nonnulls(raceclocker_race, timing_mode) = 1
    ),
    -- Jede Zeile trägt ihren vollen Pfad: eine Runden-Zeile nennt auch ihren Wettkampf, eine
    -- Partie-Zeile auch ihre Runde. Das hält Lesen und Aufräumen ohne Joins möglich.
    constraint chk_timing_profile_pfad check (
        (competition is not null or (competition_setup_round is null and competition_setup_match is null))
        and (competition_setup_round is not null or competition_setup_match is null)
    ),
    -- nulls not distinct (Postgres 17), wie bisher bei timing_mode_assignment: auch die
    -- Event-Zeile (drei nulls) darf nur einmal existieren, sonst müsste die Auflösung raten.
    unique nulls not distinct (event, competition, competition_setup_round, competition_setup_match)
);

-- Kein Einzelindex auf (event): die Spalte steht bereits an erster Stelle im Unique-Index über
-- alle vier Pfad-Spalten und wird von dem mitbedient.
create index on timing_profile_assignment (competition);

-- Altbestand: zwei frühere Wege kannten einander nicht. Ein Wettkampf konnte gleichzeitig eine
-- wettkampfweite Zeitnahmetyp-Zuordnung (Runde null) UND ein gesetztes competition.raceclocker_race
-- tragen -- beide wollen dieselbe Zeile (event, competition, null, null) belegen, was den
-- unique-nulls-not-distinct-Constraint oben verletzen würde. Vorrang nach dem System der
-- Veranstaltung: bei INTERN gewinnt der Zeitnahmetyp, sonst das Rennen -- nach dem Umbau ist
-- ohnehin nur das Profil auflösbar, das zur Art der Veranstaltung passt, die jeweils andere Zeile
-- wäre tote Datenlage. Betroffen ist ausschließlich die Wettkampf-Ebene: Runden-Zeilen tragen
-- immer ihre eigene Runden-Id und können mit der Rennen-Zeile (die nie eine Runde trägt) nie
-- kollidieren -- die on-conflict-Klauseln unten greifen dort schlicht nie.

-- Altbestand 1a: Zeitnahmetyp-Zuordnungen der Veranstaltungen mit INTERN-System. Zuerst
-- eingefügt, damit sie bei einer Kollision den Vorrang gegenüber dem Rennen behalten.
insert into timing_profile_assignment
    (id, event, competition, competition_setup_round, competition_setup_match,
     timing_mode, created_at, created_by, updated_at, updated_by)
select tma.id,
       c.event,
       tma.competition,
       tma.competition_setup_round,
       null,
       tma.timing_mode,
       tma.created_at,
       tma.created_by,
       tma.updated_at,
       tma.updated_by
from timing_mode_assignment tma
         join competition c on c.id = tma.competition
         join event e on e.id = c.event
where e.timing_system = 'INTERN';

-- Altbestand 2: das je Wettkampf angewählte RaceClocker-Rennen wird eine Wettkampf-Zeile.
-- on conflict do nothing, ohne Zielangabe: deckt genau den unique-nulls-not-distinct-Constraint
-- oben ab -- bei einer INTERN-Veranstaltung ist die Zeile durch Altbestand 1a schon belegt und
-- bleibt beim Typ.
insert into timing_profile_assignment
    (id, event, competition, competition_setup_round, competition_setup_match,
     raceclocker_race, created_at, created_by, updated_at, updated_by)
select gen_random_uuid(),
       c.event,
       c.id,
       null,
       null,
       c.raceclocker_race,
       now(),
       c.created_by,
       now(),
       c.updated_by
from competition c
where c.raceclocker_race is not null
on conflict do nothing;

-- Altbestand 1b: die übrigen Zeitnahmetyp-Zuordnungen -- alle Veranstaltungen, deren System nicht
-- INTERN ist (RACECLOCKER, WEBSCORER oder unkonfiguriert). Dort gewinnt das Rennen: bei einer
-- Kollision ist die Wettkampf-Zeile schon durch Altbestand 2 belegt, on conflict do nothing lässt
-- sie stehen.
insert into timing_profile_assignment
    (id, event, competition, competition_setup_round, competition_setup_match,
     timing_mode, created_at, created_by, updated_at, updated_by)
select tma.id,
       c.event,
       tma.competition,
       tma.competition_setup_round,
       null,
       tma.timing_mode,
       tma.created_at,
       tma.created_by,
       tma.updated_at,
       tma.updated_by
from timing_mode_assignment tma
         join competition c on c.id = tma.competition
         join event e on e.id = c.event
where e.timing_system is distinct from 'INTERN'
on conflict do nothing;

-- Die alte Tabelle bleibt vorerst stehen und wird in V202608242110 gelöscht: Bis dahin benutzen
-- neun Dateien den generierten Typ TIMING_MODE_ASSIGNMENT noch, und ein Zwischenstand, in dem das
-- Modul nicht übersetzt, wäre in jeder Zwischenprüfung ein Blindflug.
