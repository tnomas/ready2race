-- Pre-flight vor dem Ausrollen der Zeitnahmeprofil-Migrationen auf einen produktiven Bestand
-- ==========================================================================================
--
-- Betrifft die Migrationen
--   V202608242100__timing_profile_assignment.sql   (Umzug in den Zeitnahmeprofil-Baum)
--   V202608242110__…                               (Löschen der alten Wettkampf-Spalten und
--                                                   der Tabelle timing_mode_assignment)
--
-- Beide Dateien sind ausgerollt und dürfen nicht mehr verändert werden: Flyway prüft die
-- Prüfsumme jeder angewandten Migration, und jede laufende Instanz mit dem alten Inhalt würde
-- beim nächsten Start mit einem Validierungsfehler stehen bleiben. Deshalb steht dieser Hinweis
-- hier und nicht im Kopf der Migrationen selbst.
--
-- Die Migrationen verwerfen bewusst Daten (siehe die Kommentare in den Dateien). Ob der
-- produktive Bestand davon betroffen ist, muss VOR dem Deploy geprüft werden -- danach hilft nur
-- noch ein Dump von vorher, einen Rollback gibt es nicht.
--
-- Ablauf:
--   1. Aktuellen Dump der Produktionsdatenbank ziehen und lokal einspielen
--      (Schema-Stand VOR V202608242100, also höchstens bis V202608211480 migriert).
--   2. Beide Abfragen unten gegen diesen Stand ausführen.
--   3. Liefert jede Abfrage null Zeilen, ist der Bestand sicher: die Migrationen laufen ohne
--      Verlust durch.
--   4. Liefert eine Abfrage Zeilen, die betroffenen Wettkämpfe VOR dem Deploy fachlich klären
--      (Einstellung an die Veranstaltung übertragen bzw. entscheiden, welches Profil gelten
--      soll) oder den Verlust bewusst in Kauf nehmen und dokumentieren.

set search_path to ready2race, pg_catalog, public;

-- ------------------------------------------------------------------------------------------
-- Prüfung 1: Wettkämpfe mit eigener Zeitnahme-Konfiguration (Verlust durch V202608242110)
-- ------------------------------------------------------------------------------------------
-- Die drei Spalten timing_system, startlist_config und result_import_config fallen mit ihrem
-- Inhalt weg; seither zählt allein die Einstellung der Veranstaltung. Jede Zeile hier ist ein
-- Wettkampf, der danach den automatischen Ergebnis-Abruf, die Posten-Startliste der internen
-- Zeitnahme oder sein abweichendes Dateiformat verliert -- ohne dass irgendwo ein Fehler
-- auftaucht.
--
-- Erwartung: keine Zeilen.
select c.id            as competition_id,
       c.event         as event_id,
       cp.identifier,
       cp.name,
       c.timing_system,
       c.startlist_config,
       c.result_import_config
from competition c
         join competition_properties cp on cp.competition = c.id
where c.timing_system is not null
   or c.startlist_config is not null
   or c.result_import_config is not null
order by c.event, cp.identifier;

-- ------------------------------------------------------------------------------------------
-- Prüfung 2: Kollision Zeitnahmetyp-Zuordnung <-> angewähltes RaceClocker-Rennen
--            (Vorrangentscheidung in V202608242100)
-- ------------------------------------------------------------------------------------------
-- Ein Wettkampf konnte gleichzeitig eine wettkampfweite Zeitnahmetyp-Zuordnung (Runde null in
-- timing_mode_assignment) UND ein gesetztes competition.raceclocker_race tragen. Im
-- Zeitnahmeprofil-Baum belegen beide dieselbe Zeile (event, competition, null, null); die
-- Migration entscheidet nach dem System der Veranstaltung: bei INTERN bleibt der Zeitnahmetyp,
-- sonst das Rennen. Die jeweils andere Zuordnung geht verloren. Runden-Zeilen sind nicht
-- betroffen (sie tragen immer ihre Runden-Id und kollidieren nie mit der Rennen-Zeile).
--
-- Die Spalte "gewinnt" zeigt, welche der beiden Zuordnungen die Migration behält.
--
-- Erwartung: keine Zeilen.
select c.id                                            as competition_id,
       c.event                                         as event_id,
       cp.identifier,
       cp.name,
       e.timing_system                                 as event_timing_system,
       tma.timing_mode                                 as timing_mode_id,
       tm.name                                         as timing_mode_name,
       c.raceclocker_race                              as raceclocker_race_id,
       rr.name                                         as raceclocker_race_name,
       case when e.timing_system = 'INTERN'
                then 'Zeitnahmetyp (Rennen geht verloren)'
            else 'Rennen (Zeitnahmetyp geht verloren)'
       end                                             as gewinnt
from competition c
         join competition_properties cp on cp.competition = c.id
         join event e on e.id = c.event
         join timing_mode_assignment tma on tma.competition = c.id
    and tma.competition_setup_round is null
         left join timing_mode tm on tm.id = tma.timing_mode
         left join raceclocker_race rr on rr.id = c.raceclocker_race
where c.raceclocker_race is not null
order by c.event, cp.identifier;

-- ------------------------------------------------------------------------------------------
-- Ergänzende Sichtprüfung (kein Verlust, aber tote Datenlage)
-- ------------------------------------------------------------------------------------------
-- Zeitnahmetyp-Zuordnungen an Veranstaltungen, deren System nicht INTERN ist, werden zwar in den
-- Baum übernommen, sind dort aber nicht auflösbar (die Auflösung kennt nur Profile der Art der
-- Veranstaltung). Sie schaden nicht, verwirren aber beim Lesen des Baums. Zeilen hier sind ein
-- Hinweis, keine Blockade.
select e.id            as event_id,
       e.name          as event_name,
       e.timing_system as event_timing_system,
       count(*)        as typ_zuordnungen
from timing_mode_assignment tma
         join competition c on c.id = tma.competition
         join event e on e.id = c.event
where e.timing_system is distinct from 'INTERN'
group by e.id, e.name, e.timing_system
order by e.name;
