# Zeitnahmeprofil-Baum — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rennen (RaceClocker) und Zeitnahmetyp (interne Zeitnahme) werden zu einem Begriff — dem
**Zeitnahmeprofil** — mit einer Vererbungskette Event → Wettkampf → Runde → Partie und einer
einzigen Bedienoberfläche; das Zeitnahme-System hängt nur noch an der Veranstaltung.

**Architecture:** Eine neue Tabelle `timing_profile_assignment` ersetzt `timing_mode_assignment`
und die Spalte `competition.raceclocker_race`. Jede Zeile trägt ihren vollen Pfad (Event,
Wettkampf, Runde, Partie); `TimingProfileResolveLogic` löst „speziellste Ebene gewinnt" als reine
Logik ohne DB-Bezug auf, genau wie das heutige `TimingModeResolveLogic` mit zwei Ebenen. Drei
Endpunkte (Baum lesen, Ebene setzen, darunter bereinigen) bedienen eine Baum-Komponente, die an
zwei Stellen eingehängt wird.

**Tech Stack:** Kotlin/Ktor, KIO-Monade, jOOQ (generiert), Flyway, Postgres 17, JUnit 5 +
Testcontainers; React/TypeScript, MUI, react-i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-zeitnahmeprofil-design.md`

## Global Constraints

- **Build-Datenbank:** Jeder Maven-Aufruf braucht
  `-Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build`. Der Container heißt
  `r2r-zeitprofil-builddb` und läuft bereits. Die geteilte DB auf 7652 trägt die Migrationen
  fremder Worktrees und darf nicht benutzt werden.
- **JAVA_HOME:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
  vor jedem Maven-Aufruf. Ohne das meldet `./mvnw` „Unable to locate a Java Runtime".
- **`mvnw` liegt in `backend/`**, nicht im Wurzelverzeichnis.
- **Nach jeder Schema-Änderung `clean`**: `./mvnw clean test -Ddatabase.url=…`. Ohne `clean`
  stehen Testklassen gegen den alten jOOQ-Codegen und werfen `NoSuchMethodError` in Tests, die
  mit der Änderung nichts zu tun haben.
- **Migrationsnummern:** `V202608242100` und `V202608242110`. Im Nachbar-Worktree
  `sequence-visualization-controls` ist `V202608242020` belegt — nicht darunter nummerieren.
- **Views gehören in `afterMigrate.sql`**, nie in eine reguläre Migration. (Hier wird keine View
  angefasst; die Regel gilt trotzdem, falls doch eine nötig wird.)
- **OpenAPI ist handgepflegt:** `backend/src/main/resources/openapi/documentation.yaml` wird von
  Hand ergänzt, danach `cd frontend && npm run generate`. Nichts im Frontend darf eigene
  Interfaces statt der generierten Typen benutzen.
- **Kein `any`, kein `as any`** im Frontend. Fehlende i18n-Schlüssel werden angelegt, nicht
  weggecastet.
- **Deutsche Umlaute** in allen deutschen Texten (ä, ö, ü, ß), niemals ae/oe/ue/ss — in Code,
  Kommentaren, Testnamen, i18n-Texten und Commit-Nachrichten gleichermaßen. Findet sich in
  einem Codeblock deines Briefs doch eine Ersatzschreibung, schreib sie richtig; die Regel
  steht über dem wörtlichen Brief-Text.
- **Kommentare erklären das Warum**, im Ton der umliegenden Dateien (deutsche Fließtext-KDoc).
- **Commits erwähnen weder Claude noch Anthropic.**
- **Rechte:** Lesen `Privilege.ReadEventGlobal`, Schreiben `Privilege.UpdateEventGlobal`. Kein
  neues Privileg.

---

## Dateiübersicht

**Neu (Backend):**

| Datei | Verantwortung |
|---|---|
| `db/migration/V202608242100__timing_profile_assignment.sql` | Tabelle anlegen, Altbestand übernehmen, `timing_mode_assignment` löschen |
| `db/migration/V202608242110__competition_timing_override_weg.sql` | Die vier Wettkampf-Spalten löschen |
| `app/timingProfile/entity/TimingProfileKind.kt` | `RACE` \| `MODE` |
| `app/timingProfile/entity/TimingProfileScope.kt` | Ebenen-Wert + Pfad-Prüfung (reine Logik) |
| `app/timingProfile/entity/TimingProfileAssignmentRequest.kt` | Upsert-Körper |
| `app/timingProfile/entity/TimingProfileTreeDto.kt` | Baum-Antwort samt Unter-DTOs |
| `app/timingProfile/entity/TimingProfileError.kt` | Fehler der Domäne |
| `app/timingProfile/boundary/TimingProfileResolveLogic.kt` | Auflösung über vier Ebenen |
| `app/timingProfile/boundary/TimingProfileService.kt` | Baum lesen, setzen, bereinigen |
| `app/timingProfile/boundary/timingProfile.kt` | Routen |
| `app/timingProfile/control/TimingProfileRepo.kt` | Zuordnungen + Baumstruktur |

**Neu (Frontend):**

| Datei | Verantwortung |
|---|---|
| `components/event/timing/timingProfileTree.ts` | Reine Logik: Zeilen abflachen, Zähler, Beschriftung |
| `components/event/timing/timingProfileTree.test.ts` | deren Tests |
| `components/event/timing/TimingProfileTree.tsx` | Die Baum-Oberfläche, beide Einstiege |

**Gelöscht:** siehe Task 6 (Backend) und Task 5 (Frontend).

---

## Task 1: Migration, Tabelle, Altbestand

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608242100__timing_profile_assignment.sql`
- Create: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileMigrationTest.kt`

**Interfaces:**
- Consumes: nichts.
- Produces: Tabelle `ready2race.timing_profile_assignment` mit den Spalten `id, event,
  competition, competition_setup_round, competition_setup_match, raceclocker_race, timing_mode,
  created_at, created_by, updated_at, updated_by`. jOOQ erzeugt daraus
  `TIMING_PROFILE_ASSIGNMENT` und `TimingProfileAssignmentRecord`. `timing_mode_assignment`
  bleibt vorerst stehen (Löschung erst in Task 6) — der Build muss nach jedem Task grün
  sein, und bis Task 6 benutzen neun Dateien den generierten Typ noch.

- [ ] **Schritt 1: Migration schreiben**

`backend/src/main/resources/db/migration/V202608242100__timing_profile_assignment.sql`:

```sql
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

create index on timing_profile_assignment (event);
create index on timing_profile_assignment (competition);

-- Altbestand 1: die Zeitnahmetyp-Zuordnungen. Wettkampf- und Runden-Zeilen wandern unverändert
-- herüber; die Veranstaltung kommt aus dem Wettkampf, eine Partie-Ebene gab es dort noch nicht.
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
         join competition c on c.id = tma.competition;

-- Altbestand 2: das je Wettkampf angewählte RaceClocker-Rennen wird eine Wettkampf-Zeile.
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
       c.updated_by,
       now(),
       c.updated_by
from competition c
where c.raceclocker_race is not null;

-- Die alte Tabelle bleibt vorerst stehen und wird in V202608242110 gelöscht: Bis dahin benutzen
-- neun Dateien den generierten Typ TIMING_MODE_ASSIGNMENT noch, und ein Zwischenstand, in dem das
-- Modul nicht übersetzt, wäre in jeder Zwischenprüfung ein Blindflug.
```

- [ ] **Schritt 2: Migrationstest schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileMigrationTest.kt`.
Vorbild ist `app/raceclocker/RaceClockerSingleRaceMigrationTest` — eigener Container, bis zur
Vorgänger-Version migrieren, Altdaten einspielen, dann fertig migrieren:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile

import org.flywaydb.core.Flyway
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Migration V202608242100 gegen echte Altdaten: Typ-Zuordnungen und das je Wettkampf
 * angewählte Rennen müssen als Zeilen der neuen Zuordnungstabelle ankommen. Ein Fehler darin
 * verlöre bei einer laufenden Regatta still die Zuordnung — und einen Rollback ohne Dump gibt es
 * nicht.
 *
 * Eigener Container wie bei [RaceClockerSingleRaceMigrationTest]: Der übliche Testcontainer
 * migriert immer bis zum Ende, und über einer leeren Datenbank gäbe es nichts zu übernehmen.
 */
class TimingProfileMigrationTest {

    private val eventId = UUID.randomUUID()
    private val raceCompetitionId = UUID.randomUUID()
    private val modeCompetitionId = UUID.randomUUID()
    private val raceId = UUID.randomUUID()
    private val modeId = UUID.randomUUID()
    private val roundId = UUID.randomUUID()
    private val competitionPropertiesId = UUID.randomUUID()

    @Test
    fun `übernimmt Typ-Zuordnungen und das angewählte Rennen`() {
        val postgres = PostgreSQLContainer("postgres:17")
        postgres.start()
        try {
            // Der letzte Stand vor der neuen Migration.
            flyway(postgres).target("202608242020").skipDefaultCallbacks(true).load().migrate()
            connect(postgres).use { seedLegacyState(it) }
            flyway(postgres).load().migrate()

            connect(postgres).use { conn ->
                // Das Rennen des Wettkampfs ist eine Wettkampf-Zeile geworden.
                assertEquals(
                    raceId,
                    queryUuid(
                        conn,
                        "select raceclocker_race from ready2race.timing_profile_assignment " +
                            "where competition = ? and competition_setup_round is null " +
                            "and competition_setup_match is null",
                        raceCompetitionId,
                    ),
                )
                // Die Runden-Zuordnung des Zeitnahmetyps ebenso, mit ihrer Veranstaltung.
                assertEquals(
                    modeId,
                    queryUuid(
                        conn,
                        "select timing_mode from ready2race.timing_profile_assignment " +
                            "where competition_setup_round = ?",
                        roundId,
                    ),
                )
                assertEquals(
                    eventId,
                    queryUuid(
                        conn,
                        "select event from ready2race.timing_profile_assignment where competition_setup_round = ?",
                        roundId,
                    ),
                )
                assertEquals(2, count(conn, "select count(*) from ready2race.timing_profile_assignment"))
            }
        } finally {
            postgres.stop()
        }
    }

    private fun flyway(postgres: PostgreSQLContainer<*>) = Flyway.configure()
        .dataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        .defaultSchema("ready2race")

    private fun connect(postgres: PostgreSQLContainer<*>): Connection =
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)

    private fun seedLegacyState(conn: Connection) {
        exec(conn, "insert into ready2race.event (id, name, created_at, updated_at) values (?, 'Testregatta', now(), now())", eventId)
        exec(
            conn,
            "insert into ready2race.raceclocker_race (id, event, name, results_url, captures_laps, position, created_at, updated_at) " +
                "values (?, ?, 'Kurzstrecke', 'https://raceclocker.com/kurz', false, 1, now(), now())",
            raceId, eventId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode (id, event, name, with_laps, start_grouping, lead_in_seconds, created_at, updated_at) " +
                "values (?, ?, 'Timetrial 30s', false, 'EINZEL', 10, now(), now())",
            modeId, eventId,
        )
        exec(conn, "insert into ready2race.competition (id, event, created_at, updated_at, raceclocker_race) values (?, ?, now(), now(), ?)", raceCompetitionId, eventId, raceId)
        exec(conn, "insert into ready2race.competition (id, event, created_at, updated_at) values (?, ?, now(), now())", modeCompetitionId, eventId)
        exec(
            conn,
            "insert into ready2race.competition_properties (id, competition, identifier, name) values (?, ?, 'T1', 'Testwettkampf')",
            competitionPropertiesId, modeCompetitionId,
        )
        exec(
            conn,
            "insert into ready2race.competition_setup (competition_properties, created_at, updated_at) values (?, now(), now())",
            competitionPropertiesId,
        )
        exec(
            conn,
            "insert into ready2race.competition_setup_round (id, competition_setup, name, required, use_default_seeding, places_option) " +
                "values (?, ?, 'Vorlauf', true, true, 'ASCENDING')",
            roundId, competitionPropertiesId,
        )
        exec(
            conn,
            "insert into ready2race.timing_mode_assignment (id, competition, competition_setup_round, timing_mode, created_at, updated_at) " +
                "values (?, ?, ?, ?, now(), now())",
            UUID.randomUUID(), modeCompetitionId, roundId, modeId,
        )
    }

    private fun exec(conn: Connection, sql: String, vararg args: Any?) =
        conn.prepareStatement(sql).use { stmt ->
            args.forEachIndexed { index, value -> stmt.setObject(index + 1, value) }
            stmt.executeUpdate()
        }

    private fun queryUuid(conn: Connection, sql: String, id: UUID): UUID? =
        conn.prepareStatement(sql).use { stmt ->
            stmt.setObject(1, id)
            stmt.executeQuery().use { rs ->
                if (!rs.next()) null else rs.getObject(1, UUID::class.java)
            }
        }

    private fun count(conn: Connection, sql: String): Int =
        conn.prepareStatement(sql).use { stmt ->
            stmt.executeQuery().use { rs ->
                rs.next()
                rs.getInt(1)
            }
        }
}
```

**Wichtig:** Das `target(...)` im Test muss die Version **unmittelbar vor** `202608242100` sein.
Vor dem Schreiben nachsehen: `ls backend/src/main/resources/db/migration | sort | tail -3`. Steht
dort `V202608211480` als letzte, lautet das Ziel `"202608211480"` — nicht die Zahl aus dem
Beispiel oben blind übernehmen. Falls der Test-Seed an einem `not null` scheitert, das hier fehlt:
die betroffene Spalte in der jeweiligen `create table`-Migration nachschlagen und ergänzen, nicht
die Migration ändern.

- [ ] **Schritt 3: Test laufen lassen — er muss scheitern**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Dtest=TimingProfileMigrationTest -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Ohne die Migration aus Schritt 1 (falls sie noch nicht liegt) scheitert er an der fehlenden
Tabelle. Liegt sie schon, ist das der Beweis, dass sie greift — dann weiter zu Schritt 4.

- [ ] **Schritt 4: Test läuft grün**

Derselbe Befehl. Erwartet: `Tests run: 1, Failures: 0`.

- [ ] **Schritt 5: Gesamtlauf, damit der Codegen die neue Tabelle kennt**

```bash
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: alles grün. `TIMING_PROFILE_ASSIGNMENT` existiert danach in
`target/generated-sources/jooq`. Prüfen:
`ls backend/target/generated-sources/jooq/de/lambda9/ready2race/backend/database/generated/tables/ | grep -i TimingProfile`

- [ ] **Schritt 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V202608242100__timing_profile_assignment.sql backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileMigrationTest.kt
git commit -m "Zeitnahmeprofil: gemeinsame Zuordnungstabelle mit vier Ebenen"
```

---

## Task 2: Auflösung über vier Ebenen

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timingProfile/boundary/TimingProfileResolveLogic.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timingProfile/entity/TimingProfileKind.kt`
- Create: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileResolveLogicTest.kt`

**Interfaces:**
- Consumes: nichts (reine Logik).
- Produces:
  - `enum class TimingProfileKind { RACE, MODE }`
  - `TimingProfileResolveLogic.Assignment(competition: UUID?, round: UUID?, match: UUID?, profile: UUID)`
  - `TimingProfileResolveLogic.resolve(assignments: Collection<Assignment>, competition: UUID?, round: UUID?, match: UUID?): UUID?`

- [ ] **Schritt 1: Den Test schreiben**

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile

import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic.Assignment
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TimingProfileResolveLogicTest {

    private val competition = UUID.randomUUID()
    private val otherCompetition = UUID.randomUUID()
    private val round = UUID.randomUUID()
    private val otherRound = UUID.randomUUID()
    private val match = UUID.randomUUID()

    private val eventProfile = UUID.randomUUID()
    private val competitionProfile = UUID.randomUUID()
    private val roundProfile = UUID.randomUUID()
    private val matchProfile = UUID.randomUUID()

    private val all = listOf(
        Assignment(null, null, null, eventProfile),
        Assignment(competition, null, null, competitionProfile),
        Assignment(competition, round, null, roundProfile),
        Assignment(competition, round, match, matchProfile),
    )

    @Test
    fun `die Partie schlägt alles darüber`() {
        assertEquals(matchProfile, TimingProfileResolveLogic.resolve(all, competition, round, match))
    }

    @Test
    fun `ohne Partie-Eintrag gilt die Runde`() {
        val assignments = all.filterNot { it.match != null }
        assertEquals(roundProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne Runden-Eintrag gilt der Wettkampf`() {
        val assignments = all.filter { it.round == null }
        assertEquals(competitionProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne Wettkampf-Eintrag gilt die Veranstaltung`() {
        val assignments = all.filter { it.competition == null }
        assertEquals(eventProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne jeden Eintrag gilt nichts`() {
        assertNull(TimingProfileResolveLogic.resolve(emptyList(), competition, round, match))
    }

    // Eine Runden-Zeile deckt ausschließlich ihre Runde ab.
    @Test
    fun `die Nachbarrunde erbt nicht vom Runden-Eintrag`() {
        assertEquals(
            competitionProfile,
            TimingProfileResolveLogic.resolve(all, competition, otherRound, UUID.randomUUID()),
        )
    }

    @Test
    fun `fremde Wettkämpfe stören nicht`() {
        val assignments = all + Assignment(otherCompetition, null, null, UUID.randomUUID())
        assertEquals(matchProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    // Dieselbe Funktion beantwortet "was gilt auf DIESER Ebene, wenn sie erbt?" - die Oberfläche
    // braucht das für die Beschriftung "Erbt (...)".
    @Test
    fun `fragt man eine höhere Ebene ab, bleiben die tieferen Einträge außen vor`() {
        assertEquals(competitionProfile, TimingProfileResolveLogic.resolve(all, competition, null, null))
        assertEquals(eventProfile, TimingProfileResolveLogic.resolve(all, null, null, null))
    }
}
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw test -Dtest=TimingProfileResolveLogicTest -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: Übersetzungsfehler „unresolved reference: TimingProfileResolveLogic".

- [ ] **Schritt 3: Die Logik schreiben**

`app/timingProfile/entity/TimingProfileKind.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.entity

/**
 * Welche Art von Zeitnahmeprofil eine Veranstaltung benutzt. Nicht frei wählbar: [RACE] gilt bei
 * `event.timing_system = RACECLOCKER`, [MODE] bei `INTERN`. Bei `WEBSCORER` und ohne gesetztes
 * System gibt es kein Profil — dann ist die Art `null` und der Baum bleibt leer.
 */
enum class TimingProfileKind { RACE, MODE }
```

`app/timingProfile/boundary/TimingProfileResolveLogic.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.boundary

import java.util.UUID

/**
 * Reine Logik der Frage "welches Zeitnahmeprofil gilt für diese Partie?" — bewusst ohne
 * Datenbank- und Ktor-Bezug, nach dem Muster von `RequirementScopeLogic`.
 *
 * Die Zuordnungen (`timing_profile_assignment`) kennen vier Ebenen: Veranstaltung, Wettkampf,
 * Runde, Partie. Jede Zeile trägt ihren vollen Pfad, die speziellere Ebene gewinnt — dieselbe
 * Richtung, die früher das `coalesce(competition.timing_system, event.timing_system)` beschrieb,
 * nur einmal statt an drei Stellen formuliert.
 *
 * Ersetzt `TimingModeResolveLogic`, das dasselbe für zwei Ebenen und nur für Zeitnahmetypen tat.
 */
object TimingProfileResolveLogic {

    /** Eine Zuordnungszeile, auf das für die Auflösung Nötige reduziert. */
    data class Assignment(
        val competition: UUID?,
        val round: UUID?,
        val match: UUID?,
        val profile: UUID,
    )

    /**
     * Das Profil für [competition] / [round] / [match].
     *
     * Wer eine höhere Ebene abfragt, lässt die tieferen Argumente null: `resolve(a, null, null,
     * null)` beantwortet "was steht an der Wurzel", `resolve(a, c, null, null)` "was gilt für
     * diesen Wettkampf, wenn seine Runden erben". Genau das braucht die Oberfläche für die
     * Beschriftung "Erbt (…)".
     *
     * Die Eindeutigkeit je Ebene erzwingt die Datenbank (`unique nulls not distinct`), deshalb
     * genügt `firstOrNull`.
     */
    fun resolve(
        assignments: Collection<Assignment>,
        competition: UUID?,
        round: UUID?,
        match: UUID?,
    ): UUID? {
        if (match != null) {
            assignments.firstOrNull { it.match == match }?.let { return it.profile }
        }
        if (round != null) {
            assignments.firstOrNull { it.round == round && it.match == null }?.let { return it.profile }
        }
        if (competition != null) {
            assignments.firstOrNull { it.competition == competition && it.round == null && it.match == null }
                ?.let { return it.profile }
        }
        return assignments.firstOrNull { it.competition == null }?.profile
    }
}
```

- [ ] **Schritt 4: Test läuft grün**

```bash
cd backend && ./mvnw test -Dtest=TimingProfileResolveLogicTest -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: `Tests run: 8, Failures: 0`.

- [ ] **Schritt 5: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timingProfile backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileResolveLogicTest.kt
git commit -m "Zeitnahmeprofil: Auflösung über vier Ebenen"
```

---

## Task 3: Repo, Service, Routen, OpenAPI

**Files:**
- Create: `app/timingProfile/entity/TimingProfileError.kt`
- Create: `app/timingProfile/entity/TimingProfileAssignmentRequest.kt`
- Create: `app/timingProfile/entity/TimingProfileTreeDto.kt`
- Create: `app/timingProfile/control/TimingProfileRepo.kt`
- Create: `app/timingProfile/boundary/TimingProfileService.kt`
- Create: `app/timingProfile/boundary/timingProfile.kt`
- Modify: `app/event/boundary/event.kt` (Route einhängen, neben `eventTimingConfig()`)
- Modify: `calls/responses/ErrorCode.kt` (zwei neue Codes)
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Create: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileServiceTest.kt`

**Interfaces:**
- Consumes: `TimingProfileResolveLogic.Assignment/.resolve`, `TimingProfileKind` (Task 2);
  Testhelfer `createTestEventWithAdmin()` und `createTestMatchFixture(eventId)` aus
  `app/timing/TimingTestFixtures.kt` (liefert `MatchFixture(competitionId,
  competitionPropertiesId, roundId, setupMatchId, teamIds)`).
- Produces:
  - `TimingProfileService.getTree(eventId): App<ServiceError, ApiResponse.Dto<TimingProfileTreeDto>>`
  - `TimingProfileService.upsertAssignment(eventId, userId, request): App<ServiceError, ApiResponse.NoData>`
  - `TimingProfileService.resetAssignments(eventId, competitionId: UUID?): App<ServiceError, ApiResponse.NoData>`
  - `TimingProfileRepo.getAssignments(eventId): JIO<List<TimingProfileRepo.AssignmentRow>>` mit
    `data class AssignmentRow(competition: UUID?, round: UUID?, match: UUID?, race: UUID?, mode: UUID?)`
    und der abgeleiteten Eigenschaft `profile: UUID`
  - Routen `GET /event/{eventId}/timing-profile/tree`,
    `PUT /event/{eventId}/timing-profile/assignment`,
    `DELETE /event/{eventId}/timing-profile/assignments?competition={uuid}`

- [ ] **Schritt 1: Die Entities schreiben**

`app/timingProfile/entity/TimingProfileError.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*

sealed interface TimingProfileError : ServiceError {

    /** Das angewählte Profil gehört zu einer anderen Veranstaltung oder existiert nicht. */
    data object ProfileNotFound : TimingProfileError

    /**
     * Ein Rennen an einer Veranstaltung mit interner Zeitnahme (oder umgekehrt). Die Art des
     * Profils folgt zwingend `event.timing_system` — sonst stünde in der Datenbank eine Zuordnung,
     * die niemand mehr auflösen kann.
     */
    data object KindMismatch : TimingProfileError

    /** Runde gehört nicht zum Wettkampf, Partie nicht zur Runde, oder der Pfad hat eine Lücke. */
    data object ScopeInvalid : TimingProfileError

    override fun respond(): ApiError = when (this) {
        ProfileNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Timing profile not found for this event",
        )

        KindMismatch -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "The timing profile does not match the timing system of this event",
            errorCode = ErrorCode.TIMING_PROFILE_KIND_MISMATCH,
        )

        ScopeInvalid -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "The assignment scope is not a valid competition/round/match path",
            errorCode = ErrorCode.TIMING_PROFILE_SCOPE_INVALID,
        )
    }
}
```

In `calls/responses/ErrorCode.kt` neben den bestehenden Zeitnahme-Codes ergänzen:

```kotlin
    TIMING_PROFILE_KIND_MISMATCH,
    TIMING_PROFILE_SCOPE_INVALID,
```

`app/timingProfile/entity/TimingProfileAssignmentRequest.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Upsert einer Ebene des Zeitnahmeprofil-Baums: für den angegebenen Pfad wird die Zeile angelegt
 * oder ersetzt; [profile] null räumt sie ab und stellt die Ebene damit auf "erben".
 *
 * Ein einziger PUT statt POST/PUT/DELETE, weil der Pfad der natürliche Schlüssel ist
 * (`unique nulls not distinct`) und die Oberfläche genau so denkt: "diese Partie bekommt dieses
 * Profil / erbt wieder". Alle drei Pfad-Felder null zielen auf die Wurzel (die Veranstaltung).
 *
 * Der Pfad wird hier NICHT geprüft: ob die Runde zum Wettkampf und die Partie zur Runde gehört,
 * kann nur der Service beantworten — er kennt die Veranstaltung, dieses Objekt nicht.
 */
data class TimingProfileAssignmentRequest(
    val competition: UUID?,
    val competitionSetupRound: UUID?,
    val competitionSetupMatch: UUID?,
    val profile: UUID?,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example
            get() = TimingProfileAssignmentRequest(
                competition = UUID.randomUUID(),
                competitionSetupRound = null,
                competitionSetupMatch = null,
                profile = UUID.randomUUID(),
            )
    }
}
```

`app/timingProfile/entity/TimingProfileTreeDto.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import java.util.UUID

/**
 * Der Zeitnahmeprofil-Baum einer Veranstaltung: die Wurzel, ihre Wettkämpfe, deren Runden und
 * Partien — jede Ebene mit ihrem EIGENEN Profil ([ownProfile], null heißt erben) und dem, was
 * dort tatsächlich gilt ([effectiveProfile]).
 *
 * Beide Werte kommen vom Server, damit die Auflösungsregel genau einmal existiert
 * (TimingProfileResolveLogic) und die Oberfläche eine reine Anzeige bleibt.
 */
data class TimingProfileTreeDto(
    val timingSystem: TimingSystem?,
    /** RACE bei RaceClocker, MODE bei interner Zeitnahme, sonst null — dann gibt es keine Profile. */
    val kind: TimingProfileKind?,
    val options: List<TimingProfileOptionDto>,
    /** Das Profil der Wurzel; null heißt "nicht gesetzt" (die Wurzel erbt von niemandem). */
    val ownProfile: UUID?,
    val competitions: List<TimingProfileCompetitionDto>,
)

/** Ein wählbares Profil: bei RACE ein Rennen, bei MODE ein Zeitnahmetyp. */
data class TimingProfileOptionDto(
    val id: UUID,
    val name: String,
    /** Zweite Zeile im Auswahlfeld: Ergebnis-Adresse des Rennens bzw. Startart/Intervall des Typs. */
    val detail: String?,
)

data class TimingProfileCompetitionDto(
    val competitionId: UUID,
    val identifier: String,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
    val rounds: List<TimingProfileRoundDto>,
)

data class TimingProfileRoundDto(
    val roundId: UUID,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
    val matches: List<TimingProfileMatchDto>,
)

data class TimingProfileMatchDto(
    val matchId: UUID,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
)
```

- [ ] **Schritt 2: Das Repo schreiben**

`app/timingProfile/control/TimingProfileRepo.kt`. Drei Aufgaben: Zuordnungen lesen, Zuordnung
schreiben/löschen, Baumstruktur lesen.

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.control

import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_PROFILE_ASSIGNMENT
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID

object TimingProfileRepo {

    /** Eine Zuordnungszeile, auf das Nötige reduziert. */
    data class AssignmentRow(
        val competition: UUID?,
        val round: UUID?,
        val match: UUID?,
        val race: UUID?,
        val mode: UUID?,
    ) {
        /** Genau eine der beiden Spalten ist gesetzt (Check-Constraint), also ist das eindeutig. */
        val profile: UUID get() = race ?: mode!!
    }

    /** Ein Knoten des Strukturbaums, flach gelesen und im Service zusammengesetzt. */
    data class StructureRow(
        val competitionId: UUID,
        val identifier: String,
        val competitionName: String,
        val roundId: UUID?,
        val roundName: String?,
        val nextRound: UUID?,
        val matchId: UUID?,
        val matchName: String?,
        val executionOrder: Int?,
    )

    fun getAssignments(eventId: UUID) = Jooq.query {
        select(
            TIMING_PROFILE_ASSIGNMENT.COMPETITION,
            TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND,
            TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH,
            TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE,
            TIMING_PROFILE_ASSIGNMENT.TIMING_MODE,
        )
            .from(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .fetch {
                AssignmentRow(
                    competition = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION],
                    round = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND],
                    match = it[TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH],
                    race = it[TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE],
                    mode = it[TIMING_PROFILE_ASSIGNMENT.TIMING_MODE],
                )
            }
    }

    /**
     * Setzt (oder ersetzt) die Zeile für genau diesen Pfad. Erst löschen, dann einfügen: Das ist
     * dieselbe Wirkung wie ein `on conflict do update` über den vierteiligen Schlüssel, aber ohne
     * dass jOOQ den `nulls not distinct`-Index kennen muss.
     */
    fun upsert(
        eventId: UUID,
        competitionId: UUID?,
        roundId: UUID?,
        matchId: UUID?,
        raceId: UUID?,
        modeId: UUID?,
        userId: UUID,
    ) = Jooq.query {
        deleteFrom(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .and(nullSafeEq(TIMING_PROFILE_ASSIGNMENT.COMPETITION, competitionId))
            .and(nullSafeEq(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND, roundId))
            .and(nullSafeEq(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH, matchId))
            .execute()

        if (raceId != null || modeId != null) {
            val now = LocalDateTime.now()
            insertInto(TIMING_PROFILE_ASSIGNMENT)
                .set(TIMING_PROFILE_ASSIGNMENT.ID, UUID.randomUUID())
                .set(TIMING_PROFILE_ASSIGNMENT.EVENT, eventId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION, competitionId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND, roundId)
                .set(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_MATCH, matchId)
                .set(TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE, raceId)
                .set(TIMING_PROFILE_ASSIGNMENT.TIMING_MODE, modeId)
                .set(TIMING_PROFILE_ASSIGNMENT.CREATED_AT, now)
                .set(TIMING_PROFILE_ASSIGNMENT.CREATED_BY, userId)
                .set(TIMING_PROFILE_ASSIGNMENT.UPDATED_AT, now)
                .set(TIMING_PROFILE_ASSIGNMENT.UPDATED_BY, userId)
                .execute()
        }
    }

    /**
     * Räumt alles UNTERHALB der angegebenen Ebene ab: ohne [competitionId] alle Zeilen außer der
     * Wurzel, mit [competitionId] die Runden- und Partie-Zeilen dieses Wettkampfs (seine eigene
     * Zeile bleibt stehen). "Alles darunter erbt wieder" ist genau diese Bedeutung.
     */
    fun deleteBelow(eventId: UUID, competitionId: UUID?) = Jooq.query {
        val condition = if (competitionId == null) {
            TIMING_PROFILE_ASSIGNMENT.COMPETITION.isNotNull
        } else {
            TIMING_PROFILE_ASSIGNMENT.COMPETITION.eq(competitionId)
                .and(TIMING_PROFILE_ASSIGNMENT.COMPETITION_SETUP_ROUND.isNotNull)
        }
        deleteFrom(TIMING_PROFILE_ASSIGNMENT)
            .where(TIMING_PROFILE_ASSIGNMENT.EVENT.eq(eventId))
            .and(condition)
            .execute()
    }

    /**
     * Der Strukturbaum: alle Wettkämpfe der Veranstaltung mit ihren Runden und Partien, flach.
     *
     * `competition_properties` trägt laut Check-Constraint auch die Zeilen der Wettkampf-Vorlagen
     * — deshalb der innere Join auf `competition` statt eines Zugriffs allein über die
     * Eigenschaften. Der Partie-Name ist derselbe wie im Abruf-Kandidaten:
     * `coalesce(competition_match.bye_name, competition_setup_match.name)`; fehlt beides, setzt
     * der Service "Lauf {execution_order}" ein.
     */
    fun getStructure(eventId: UUID) = Jooq.query {
        val matchName = DSL.coalesce(COMPETITION_MATCH.BYE_NAME, COMPETITION_SETUP_MATCH.NAME)
            .`as`("match_name")

        select(
            COMPETITION.ID,
            COMPETITION_PROPERTIES.IDENTIFIER,
            COMPETITION_PROPERTIES.NAME,
            COMPETITION_SETUP_ROUND.ID,
            COMPETITION_SETUP_ROUND.NAME,
            COMPETITION_SETUP_ROUND.NEXT_ROUND,
            COMPETITION_SETUP_MATCH.ID,
            matchName,
            COMPETITION_SETUP_MATCH.EXECUTION_ORDER,
        )
            .from(COMPETITION)
            .join(COMPETITION_PROPERTIES).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .leftJoin(COMPETITION_SETUP).on(COMPETITION_SETUP.COMPETITION_PROPERTIES.eq(COMPETITION_PROPERTIES.ID))
            .leftJoin(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .leftJoin(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .leftJoin(COMPETITION_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .orderBy(COMPETITION_PROPERTIES.IDENTIFIER, COMPETITION_SETUP_MATCH.EXECUTION_ORDER)
            .fetch {
                StructureRow(
                    competitionId = it[COMPETITION.ID]!!,
                    identifier = it[COMPETITION_PROPERTIES.IDENTIFIER]!!,
                    competitionName = it[COMPETITION_PROPERTIES.NAME]!!,
                    roundId = it[COMPETITION_SETUP_ROUND.ID],
                    roundName = it[COMPETITION_SETUP_ROUND.NAME],
                    nextRound = it[COMPETITION_SETUP_ROUND.NEXT_ROUND],
                    matchId = it[COMPETITION_SETUP_MATCH.ID],
                    matchName = it["match_name", String::class.java],
                    executionOrder = it[COMPETITION_SETUP_MATCH.EXECUTION_ORDER],
                )
            }
    }

    /**
     * `field is not distinct from value` — jOOQs `eq` liefert bei null ein `= null` und damit
     * nie ein Treffer. Der Schlüssel dieser Tabelle enthält aber genau diese nulls.
     */
    private fun nullSafeEq(field: org.jooq.Field<UUID?>, value: UUID?) =
        if (value == null) field.isNull else field.eq(value)
}
```

**Achtung beim Umsetzen:** Die Spaltennamen der generierten jOOQ-Klassen prüfen —
`COMPETITION_SETUP.COMPETITION_PROPERTIES` und `COMPETITION_SETUP_ROUND.COMPETITION_SETUP` zeigen
beide auf `competition_properties.id` (siehe `TimingTestFixtures`, dort wird
`CompetitionSetupRoundRecord(competitionSetup = competitionPropertiesId, …)` gesetzt). Ist der
`leftJoin(COMPETITION_SETUP)` dadurch überflüssig, weglassen statt hineinzuraten.

- [ ] **Schritt 3: Den Service schreiben**

`app/timingProfile/boundary/TimingProfileService.kt`. Kernpunkte:

- `getTree(eventId)`: Event lesen (`EventRepo.get`), `kind` aus `event.timingSystem` ableiten
  (`RACECLOCKER → RACE`, `INTERN → MODE`, sonst `null`). Optionen laden: bei `RACE` über
  `RaceClockerRaceRepo.getForEvent(eventId)` (`detail = resultsUrl`), bei `MODE` über
  `TimingModeRepo.getByEvent(eventId)` (`detail` = `"Intervall ${intervalSeconds} s"` wenn
  `intervalSeconds != null`, sonst der Wert von `startGrouping`). Bei `kind == null`:
  leere Optionen, leere Wettkampfliste, `ownProfile = null` — der Baum hat dann nichts zu zeigen.
  Struktur über `TimingProfileRepo.getStructure`, Zuordnungen über `getAssignments`, dann je
  Ebene `ownProfile` (die Zeile genau dieser Ebene) und `effectiveProfile`
  (`TimingProfileResolveLogic.resolve`) setzen. Runden über die `nextRound`-Kette sortieren:
  `TimingStartOrderLogic.roundOrder(rounds.map { TimingStartOrderLogic.RoundRef(it.id, it.nextRound) })`
  liefert eine Map Runde → Index; danach sortieren, Partien nach `executionOrder`.
  Partie-Name: `matchName ?: "Lauf $executionOrder"`.
- `upsertAssignment(eventId, userId, request)`:
  1. Event lesen, `kind` bestimmen. Ist `kind == null` und `request.profile != null` →
     `TimingProfileError.KindMismatch`.
  2. Pfad prüfen: `competitionSetupMatch != null` verlangt `competitionSetupRound != null` und
     `competition != null`; `competitionSetupRound != null` verlangt `competition != null` —
     sonst `ScopeInvalid`. Zusätzlich über das Repo prüfen, dass Wettkampf zur Veranstaltung,
     Runde zum Wettkampf und Partie zur Runde gehört (eine `fetchExists`-Abfrage je gesetzter
     Ebene, im Repo als `belongsToEvent`, `roundBelongsToCompetition`,
     `matchBelongsToRound`) — sonst `ScopeInvalid`.
  3. Profil prüfen, wenn gesetzt: bei `RACE` muss `RaceClockerRaceRepo.belongsToEvent(profile,
     eventId)` gelten, bei `MODE` das Gegenstück über `TimingModeRepo` — sonst `ProfileNotFound`.
  4. `TimingProfileRepo.upsert(...)` mit `raceId`/`modeId` je nach `kind`.
- `resetAssignments(eventId, competitionId)`: Event prüfen (`EventError.NotFound`), dann
  `TimingProfileRepo.deleteBelow`.

Alle drei geben `ApiResponse.Dto` bzw. `ApiResponse.NoData` zurück und folgen dem
`KIO.comprehension`-Stil von `TimingConfigService`.

- [ ] **Schritt 4: Routen schreiben und einhängen**

`app/timingProfile/boundary/timingProfile.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timingProfile.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.calls.requests.authenticate
import de.lambda9.ready2race.backend.calls.requests.optionalQueryParam
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import io.ktor.server.routing.*

/** Der Zeitnahmeprofil-Baum einer Veranstaltung — unterhalb der Event-Route zu mounten. */
fun Route.timingProfile() {
    route("/timing-profile") {
        get("/tree") {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                TimingProfileService.getTree(eventId)
            }
        }
        put("/assignment") {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                val body = !receiveKIO(TimingProfileAssignmentRequest.example)
                TimingProfileService.upsertAssignment(eventId, user.id!!, body)
            }
        }
        // Gesamtbereinigung: alles UNTERHALB der Ebene erbt wieder. Ohne competition ist das die
        // ganze Veranstaltung, mit competition nur dessen Runden und Partien.
        delete("/assignments") {
            call.respondComprehension {
                !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val competitionId = !optionalQueryParam("competition", uuid)

                TimingProfileService.resetAssignments(eventId, competitionId)
            }
        }
    }
}
```

In `app/event/boundary/event.kt` unter `route("/{eventId}")` neben `eventTimingConfig()`
`timingProfile()` ergänzen, samt Import.

- [ ] **Schritt 5: OpenAPI ergänzen**

In `backend/src/main/resources/openapi/documentation.yaml`:

- Pfade `/event/{eventId}/timing-profile/tree` (`get`, `operationId: getTimingProfileTree`,
  Antwort `TimingProfileTreeDto`), `/event/{eventId}/timing-profile/assignment` (`put`,
  `operationId: upsertTimingProfileAssignment`, Körper `TimingProfileAssignmentRequest`,
  Antwort 204), `/event/{eventId}/timing-profile/assignments` (`delete`,
  `operationId: resetTimingProfileAssignments`, optionaler Query-Parameter `competition` vom Typ
  `string`/`format: uuid`, Antwort 204).
- Schemata `TimingProfileTreeDto`, `TimingProfileOptionDto`, `TimingProfileCompetitionDto`,
  `TimingProfileRoundDto`, `TimingProfileMatchDto`, `TimingProfileAssignmentRequest`,
  `TimingProfileKind` (enum `RACE`, `MODE`).
- Die beiden neuen Werte in das `ErrorCode`-Enum-Schema aufnehmen (dort, wo
  `RACECLOCKER_RACE_STILL_ASSIGNED` steht).

Bestehende Einträge als Vorlage nehmen (`TimingModeAssignmentDto` ab Zeile ~21145). Pflichtfelder
sorgfältig setzen: Was im Kotlin-DTO nicht nullable ist, gehört in `required`.

- [ ] **Schritt 6: Service-Test schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileServiceTest.kt`,
mit `testComprehension` gegen echtes Postgres (Vorbild: `app/timing/TimingMatchServiceTest`).
Fälle:

1. `setzt und raeumt eine Wettkampf-Zuordnung ab` — Event auf `INTERN`, Typ anlegen
   (`TimingModeService.addMode`), Zuordnung setzen, `getTree` zeigt sie als `ownProfile` und
   `effectiveProfile`; danach mit `profile = null` abräumen, `ownProfile` ist null.
2. `die Partie schlägt den Wettkampf im Baum` — zwei Typen, einer am Wettkampf, einer an der
   Partie; `effectiveProfile` der Partie ist der zweite, der der Runde der erste.
3. `die Wurzel vererbt an Wettkämpfe ohne eigenen Wert` — Zuordnung mit allen Pfad-Feldern null,
   `competitions.first().ownProfile` ist null, `effectiveProfile` das Wurzel-Profil.
4. `ein Rennen an einer intern gezeiteten Veranstaltung wird abgelehnt` — erwartet
   `TimingProfileError.KindMismatch`.
5. `ein Profil einer fremden Veranstaltung wird abgelehnt` — erwartet
   `TimingProfileError.ProfileNotFound`.
6. `eine Partie ohne Runde im Pfad wird abgelehnt` — erwartet `TimingProfileError.ScopeInvalid`.
7. `bereinigen raeumt genau die Ebenen darunter ab` — Wurzel, Wettkampf, Runde und Partie
   gesetzt; `resetAssignments(eventId, null)` lässt genau die Wurzel stehen;
   in einem zweiten Durchgang lässt `resetAssignments(eventId, competitionId)` Wurzel **und**
   Wettkampf stehen.

Für die Fehlerfälle das Muster der bestehenden Tests benutzen: den Aufruf mit `.fold` oder
`assertFailsWith` prüfen — nachsehen, wie `ExecutionErrorTest` das im Projekt macht, und es
genauso tun.

- [ ] **Schritt 7: Tests laufen lassen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Dtest='TimingProfile*' -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: alle grün.

- [ ] **Schritt 8: Frontend-Client erzeugen und übersetzen lassen**

```bash
cd frontend && npm run generate && npm run build
```

Erwartet: `getTimingProfileTree`, `upsertTimingProfileAssignment` und
`resetTimingProfileAssignments` stehen in `frontend/src/api/sdk.gen.ts`; der Build läuft durch
(es benutzt sie noch niemand).

- [ ] **Schritt 9: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timingProfile backend/src/main/kotlin/de/lambda9/ready2race/backend/app/event/boundary/event.kt backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/responses/ErrorCode.kt backend/src/main/resources/openapi/documentation.yaml backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile frontend/src/api
git commit -m "Zeitnahmeprofil: Baum lesen, Ebene setzen, darunter bereinigen"
```

---

## Task 4: Die Verbraucher auf die neue Auflösung umstellen

Ab hier gilt das Zeitnahme-System nur noch an der Veranstaltung, und das RaceClocker-Rennen kommt
aus der Zuordnungstabelle. Die Spalten am Wettkampf existieren noch (sie fallen in Task 6), werden
aber nicht mehr gelesen.

**Files:**
- Modify: `app/raceclocker/control/RaceClockerPollRepo.kt` (`getCandidates`, `isAutoPullConfigured`)
- Modify: `app/raceclocker/boundary/RaceClockerPollService.kt` (Auflösung des Rennens)
- Modify: `app/raceclocker/control/RaceClockerRaceRepo.kt` (`countAssignedCompetitions`, `getCompetitionAssignments` entfällt in Task 6)
- Modify: `app/timing/control/TimingMatchRepo.kt` (`internSystem`)
- Modify: `app/timing/boundary/TimingMatchService.kt` (Zeitnahmetyp über die neue Logik, inkl. Partie-Ebene)
- Modify: `app/competitionExecution/control/CompetitionMatchRepo.kt` (`getStartListConfigTarget`)
- Modify: `app/competitionExecution/boundary/CompetitionExecutionService.kt` (Ergebnis-Import-Format)
- Modify: die betroffenen Tests

**Interfaces:**
- Consumes: `TimingProfileRepo.getAssignments`, `TimingProfileResolveLogic.resolve` (Tasks 2, 3).
- Produces: `RaceClockerPollRepo.getCandidates` liefert Kandidaten **ohne** Rennen, dafür mit
  `roundId` und `matchId`; `RaceClockerPollService` setzt das Rennen ein.

- [ ] **Schritt 1: Den Poll-Test zuerst anpassen (er beschreibt das neue Verhalten)**

In `backend/src/test/kotlin/.../raceclocker/RaceClockerPollRepoTest.kt` bzw.
`RaceClockerFetchPlanTest.kt` die Fälle so umschreiben, dass

- das System nur noch von der Veranstaltung kommt (ein Wettkampf mit eigenem `timing_system`
  ändert nichts mehr),
- ein Lauf ohne aufgelöstes Profil **nicht** abgerufen wird,
- eine Partie-Zuordnung die Wettkampf-Zuordnung schlägt (der Abruf geht dann gegen das Rennen der
  Partie).

Zuerst laufen lassen — die neuen Erwartungen müssen scheitern.

- [ ] **Schritt 2: `getCandidates` umbauen**

`RaceClockerPollRepo.getCandidates`:

- `val timingSystem = DSL.coalesce(COMPETITION.TIMING_SYSTEM, EVENT.TIMING_SYSTEM)` ersetzen durch
  `EVENT.TIMING_SYSTEM` (der lange Kommentar über den jOOQ-Alias entfällt damit ersatzlos).
- Den `join(RACECLOCKER_RACE)` samt der drei projizierten Rennen-Spalten entfernen.
- Zusätzlich `COMPETITION_SETUP_ROUND.ID` projizieren (die Tabelle steht schon in der Join-Kette).
- `RaceClockerPollCandidate` bekommt `roundId: UUID` und `matchId` bleibt; `target.race` wird
  `null` gesetzt und im Service gefüllt — oder, sauberer: `getCandidates` liefert eine neue
  Zwischenform ohne `target.race`, und der Service baut `RaceClockerMatchTarget`. Welche Form,
  entscheidet, wie `RaceClockerPollCandidate` sonst benutzt wird — vor dem Umbau
  `grep -rn "RaceClockerPollCandidate" backend/src` und die aufrufende Seite lesen.

Kommentar an der Stelle, an der der innere Join stand:

```kotlin
// Das Rennen wird nicht mehr im SQL gejoint: Seit dem Zeitnahmeprofil-Baum hängt es an einer
// von vier Ebenen (Veranstaltung, Wettkampf, Runde, Partie). Eine Ebenen-Auflösung gehört
// nicht in eine where-Klausel -- sie steht in TimingProfileResolveLogic und wird im Service
// angewandt, genau wie TimingMatchService es für den Zeitnahmetyp tut. Die Wirkung des frueheren
// INNEREN Joins bleibt erhalten: Laeufe ohne aufgeloestes Rennen fällt der Service still heraus.
```

- [ ] **Schritt 3: Die Auflösung im Poll-Service ergänzen**

In `RaceClockerPollService` dort, wo die Kandidaten geholt werden:

```kotlin
val assignments = (!TimingProfileRepo.getAssignments(eventId).orDie())
    .filter { it.race != null }
    .map { TimingProfileResolveLogic.Assignment(it.competition, it.round, it.match, it.profile) }
val racesById = (!RaceClockerRaceRepo.getForEvent(eventId).orDie()).associateBy { it.id }
```

und je Kandidat das Rennen einsetzen; Kandidaten ohne Treffer werden verworfen
(`mapNotNull`).

- [ ] **Schritt 4: Die übrigen fünf Stellen umstellen**

- `RaceClockerPollRepo.isAutoPullConfigured`: `DSL.coalesce(COMPETITION.TIMING_SYSTEM,
  EVENT.TIMING_SYSTEM)` → `EVENT.TIMING_SYSTEM`.
- `TimingMatchRepo`: `private val internSystem = DSL.coalesce(COMPETITION.TIMING_SYSTEM,
  EVENT.TIMING_SYSTEM)` → `EVENT.TIMING_SYSTEM`.
- `TimingMatchService.getMatches`: statt `TimingModeAssignmentRepo` jetzt
  `TimingProfileRepo.getAssignments(eventId)` (auf `mode != null` filtern) und
  `TimingProfileResolveLogic.resolve(assignmentRows, match.competitionId, match.roundId,
  match.setupMatchId)` — damit wirkt die Partie-Ebene auch am Posten.
- `CompetitionMatchRepo.getStartListConfigTarget`: `DSL.coalesce(COMPETITION.STARTLIST_CONFIG,
  EVENT.STARTLIST_CONFIG)` → `EVENT.STARTLIST_CONFIG`; den Join auf `COMPETITION` nur entfernen,
  wenn er sonst unbenutzt ist.
- `CompetitionExecutionService`: `competition.resultImportConfig ?: event.resultImportConfig` →
  `event.resultImportConfig`; das `CompetitionRepo.getRecordById` an der Stelle entfällt, wenn es
  sonst nicht gebraucht wird.
- `RaceClockerRaceRepo.countAssignedCompetitions`: statt
  `fetchCount(COMPETITION, COMPETITION.RACECLOCKER_RACE.eq(raceId))` jetzt
  `fetchCount(TIMING_PROFILE_ASSIGNMENT, TIMING_PROFILE_ASSIGNMENT.RACECLOCKER_RACE.eq(raceId))`.
  Die Sperre `RACECLOCKER_RACE_STILL_ASSIGNED` gilt damit für alle vier Ebenen.

- [ ] **Schritt 5: Tests laufen lassen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: alles grün. Rote Tests, die den Wettkampf-Override voraussetzen (etwa
`TimingMatchServiceTest.onlyInternallyTimedCompetitionsAppear` mit
`setCompetitionTimingSystem`), auf die Veranstaltung umschreiben — das ist die beabsichtigte
Verhaltensänderung, nicht ein Fehler. `setCompetitionTimingSystem` fällt dabei weg.

- [ ] **Schritt 6: Commit**

```bash
git add backend/src
git commit -m "Zeitnahme-System nur noch an der Veranstaltung, Rennen über den Profil-Baum"
```

---

## Task 5: Der Baum im Frontend

**Files:**
- Create: `frontend/src/components/event/timing/timingProfileTree.ts`
- Create: `frontend/src/components/event/timing/timingProfileTree.test.ts`
- Create: `frontend/src/components/event/timing/TimingProfileTree.tsx`
- Modify: `frontend/src/components/event/timing/EventTimingConfig.tsx`
- Modify: `frontend/src/components/event/competition/timing/CompetitionTimingConfig.tsx`
- Modify: `frontend/src/components/event/competition/excecution/CompetitionExecution.tsx`
- Modify: `frontend/src/i18n/de/translations.json`, `en/translations.json`, `da/translations.json`
- Delete: `frontend/src/components/event/timing/EventCompetitionTimingSection.tsx`,
  `eventCompetitionTimingRows.ts`, `eventCompetitionTimingRows.test.ts`,
  `RaceClockerRaceAssignments.tsx`,
  `frontend/src/components/event/competition/timing/TimingModeAssignmentSection.tsx`,
  `timingConfigForm.ts`, `timingConfigForm.test.ts`

**Interfaces:**
- Consumes: `getTimingProfileTree`, `upsertTimingProfileAssignment`,
  `resetTimingProfileAssignments` aus `@api/sdk.gen.ts`; die Typen `TimingProfileTreeDto`,
  `TimingProfileOptionDto`, `TimingProfileCompetitionDto`, `TimingProfileRoundDto`,
  `TimingProfileMatchDto` aus `@api/types.gen.ts` (Task 3).
- Produces: `TimingProfileTree` mit den Props `{eventId: string; competitionId?: string}`.

- [ ] **Schritt 1: Die reine Logik testen**

`frontend/src/components/event/timing/timingProfileTree.test.ts` — Vorbild ist
`eventCompetitionTimingRows.test.ts` (Vitest, `describe`/`it`/`expect`):

```ts
import {describe, expect, it} from 'vitest'
import {TimingProfileCompetitionDto, TimingProfileOptionDto} from '@api/types.gen.ts'
import {deviationCount, optionLabel, profileLabel} from './timingProfileTree.ts'

const optionen: TimingProfileOptionDto[] = [
    {id: 'a', name: 'Timetrial 30s', detail: 'Intervall 30 s'},
    {id: 'b', name: 'Wellenstart', detail: 'WELLE'},
]

const wettkampf = (
    overrides: Partial<TimingProfileCompetitionDto> = {},
): TimingProfileCompetitionDto => ({
    competitionId: 'c1',
    identifier: '12',
    name: 'JM4x',
    ownProfile: null,
    effectiveProfile: null,
    rounds: [],
    ...overrides,
})

describe('optionLabel', () => {
    it('hängt das Detail in Klammern an', () => {
        expect(optionLabel(optionen[0])).toBe('Timetrial 30s (Intervall 30 s)')
    })

    it('lässt die Klammer weg, wenn es kein Detail gibt', () => {
        expect(optionLabel({id: 'c', name: 'Kurzstrecke', detail: null})).toBe('Kurzstrecke')
    })
})

describe('profileLabel', () => {
    it('findet den Namen zur id', () => {
        expect(profileLabel(optionen, 'b')).toBe('Wellenstart (WELLE)')
    })

    it('ohne id gibt es nichts zu zeigen', () => {
        expect(profileLabel(optionen, null)).toBeNull()
    })

    // Ein gelöschtes Profil darf die Zeile nicht zum Absturz bringen.
    it('unbekannte id ergibt null', () => {
        expect(profileLabel(optionen, 'weg')).toBeNull()
    })
})

describe('deviationCount', () => {
    it('zaehlt eigene Werte unterhalb des Wettkampfs', () => {
        const c = wettkampf({
            rounds: [
                {
                    roundId: 'r1',
                    name: 'Vorlauf',
                    ownProfile: 'a',
                    effectiveProfile: 'a',
                    matches: [
                        {matchId: 'm1', name: 'Lauf 1', ownProfile: 'b', effectiveProfile: 'b'},
                        {matchId: 'm2', name: 'Lauf 2', ownProfile: null, effectiveProfile: 'a'},
                    ],
                },
            ],
        })
        expect(deviationCount(c)).toBe(2)
    })

    it('erbt alles, zaehlt nichts', () => {
        expect(deviationCount(wettkampf())).toBe(0)
    })

    // Der eigene Wert des Wettkampfs ist keine Abweichung UNTERHALB des Wettkampfs.
    it('der eigene Wert des Wettkampfs zaehlt nicht mit', () => {
        expect(deviationCount(wettkampf({ownProfile: 'a'}))).toBe(0)
    })
})
```

- [ ] **Schritt 2: Test laufen lassen — er muss scheitern**

```bash
cd frontend && npx vitest run src/components/event/timing/timingProfileTree.test.ts
```

Erwartet: „Failed to resolve import ./timingProfileTree.ts".

- [ ] **Schritt 3: Die Logik schreiben**

`frontend/src/components/event/timing/timingProfileTree.ts`:

```ts
import {TimingProfileCompetitionDto, TimingProfileOptionDto} from '@api/types.gen.ts'

/**
 * Reine Logik des Zeitnahmeprofil-Baums: Beschriftungen und Zähler. Ohne Netz und Komponenten
 * testbar — die Oberfläche (TimingProfileTree) rendert nur. Die Auflösung „welches Profil gilt
 * hier" steht bewusst NICHT hier: die rechnet der Server, damit es sie genau einmal gibt.
 */

/** Wie ein Profil im Auswahlfeld steht: Name plus Detail in Klammern (Adresse bzw. Startart). */
export const optionLabel = (option: TimingProfileOptionDto): string =>
    option.detail ? `${option.name} (${option.detail})` : option.name

/**
 * Die Beschriftung zu einer Profil-id, oder null. Null auch bei einer unbekannten id: Ein
 * inzwischen gelöschtes Profil darf die Zeile nicht zerlegen, sie zeigt dann „nicht gesetzt".
 */
export const profileLabel = (
    options: TimingProfileOptionDto[],
    profile: string | null | undefined,
): string | null => {
    if (!profile) return null
    const option = options.find(o => o.id === profile)
    return option ? optionLabel(option) : null
}

/**
 * Wie viele Ebenen UNTERHALB dieses Wettkampfs einen eigenen Wert haben. Der Zähler steht an der
 * eingeklappten Zeile und ist die Einladung, sie zu öffnen — der eigene Wert des Wettkampfs
 * zählt nicht mit, der steht ja sichtbar daneben.
 */
export const deviationCount = (competition: TimingProfileCompetitionDto): number =>
    competition.rounds.reduce(
        (sum, round) =>
            sum +
            (round.ownProfile ? 1 : 0) +
            round.matches.filter(match => match.ownProfile).length,
        0,
    )
```

- [ ] **Schritt 4: Test läuft grün**

```bash
cd frontend && npx vitest run src/components/event/timing/timingProfileTree.test.ts
```

Erwartet: 8 Tests grün.

- [ ] **Schritt 5: Die Baum-Komponente schreiben**

`frontend/src/components/event/timing/TimingProfileTree.tsx`. Aufbau:

- Props `{eventId: string; competitionId?: string}`. Mit `competitionId` wird der Baum auf diesen
  Wettkampf gefiltert und die Wurzelzeile weggelassen (dafür oben ein Hinweis, was von der
  Veranstaltung geerbt wird, mit `InlineLink` dorthin).
- `useFetch(signal => getTimingProfileTree({signal, path: {eventId}}), {deps: [eventId, reloaded]})`
  — dasselbe Muster wie in `RaceClockerRaceAssignments`.
- Ist `tree.kind` null: kein Baum, stattdessen ein `Alert severity="info"` mit
  `event.timing.profiles.noSystem`.
- Aufklapp-Zustand als `useState<Set<string>>` über Wettkampf- und Runden-ids; **alles
  eingeklappt** außer der Wurzel. Pfeil-Icon `ExpandMore`/`ChevronRight` aus `@mui/icons-material`.
- Je Zeile ein `Select` (size `small`) mit
  - Wurzel: `MenuItem value=''` → `event.timing.profiles.unset` („nicht gesetzt"),
  - alle anderen: `MenuItem value=''` → `event.timing.profiles.inherit` mit dem geerbten Namen
    als Interpolation; der geerbte Name ist `profileLabel(options, <effectiveProfile der Ebene
    darüber>)`, ersatzweise `event.timing.profiles.inheritsNothing`,
  - danach die Optionen mit `optionLabel`.
- Speichern je Zeile sofort (`upsertTimingProfileAssignment`), währenddessen nur diese Zeile
  gesperrt (`useState<Set<string>>` mit dem Pfad als Schlüssel), danach den Baum neu laden und
  `feedback.success(t('event.timing.profiles.saved'))`.
- Über dem Baum ein `Button` „Alles darunter auf Erben" (`event.timing.profiles.resetAll`), je
  Wettkampfzeile derselbe Knopf als `IconButton` mit `RestartAlt` und Tooltip
  (`event.timing.profiles.resetCompetition`). Beide über `useConfirmation().confirmAction` mit dem
  Text `event.timing.profiles.resetConfirm`, dann `resetTimingProfileAssignments({path:
  {eventId}, query: competitionId ? {competition: competitionId} : {}})` — die genaue Signatur des
  generierten Aufrufs in `sdk.gen.ts` nachsehen.
- Einrückung über `sx={{pl: tiefe * 3}}`; die Struktur bleibt eine `Stack`-Liste, keine `Table` —
  vier Ebenen mit unterschiedlicher Bedeutung passen nicht in eine Tabellenzeile.
- Ein Hinweistext unter der Überschrift (`event.timing.profiles.hint`), der zwei Dinge sagt:
  speziellere Ebene gewinnt, und Partie-Zuordnungen verschwinden, wenn der Wettkampfablauf neu
  gebaut wird.

- [ ] **Schritt 6: Die i18n-Schlüssel anlegen**

In `de/translations.json` unter `event.timing` den Ast `profiles` ergänzen und die Äste
`competitions`, `assignments` und `deviations` löschen. Deutsche Texte:

```json
"profiles": {
  "title": "Zeitnahmeprofile",
  "hint": "Ein Zeitnahmeprofil ist das, womit gestoppt wird: bei RaceClocker das Rennen, bei der internen Zeitnahme der Zeitnahmetyp. Es wird von der Veranstaltung nach unten vererbt — Wettkampf, Runde und Partie können abweichen, und die speziellste gesetzte Ebene gilt. Jede Änderung speichert sofort. Wird ein Wettkampfablauf neu gebaut, verlieren seine Partien ihre eigenen Profile.",
  "noSystem": "Für dieses Zeitnahme-System gibt es keine Profile. Wählen Sie oben „RaceClocker“ oder „Interne Zeitnahme“.",
  "noOptions": "Es ist noch kein Profil angelegt. Legen Sie oben ein Rennen bzw. einen Zeitnahmetyp an.",
  "event": "Ganze Veranstaltung",
  "unset": "nicht gesetzt",
  "inherit": "Erbt ({{profile}})",
  "inheritsNothing": "Erbt (nichts gesetzt)",
  "saved": "Zeitnahmeprofil gespeichert",
  "deviations_one": "{{count}} eigenes Profil darunter",
  "deviations_other": "{{count}} eigene Profile darunter",
  "resetAll": "Alles darunter auf Erben",
  "resetCompetition": "Runden und Partien dieses Wettkampfs auf Erben",
  "resetConfirm": "Alle Zuordnungen unterhalb dieser Ebene werden entfernt. Danach erbt alles wieder von oben. Fortfahren?",
  "reset": "Zuordnungen entfernt"
}
```

In `en/translations.json` und `da/translations.json` dieselbe Struktur mit passenden
Übersetzungen; die drei Dateien müssen denselben Schlüsselbaum haben, sonst bricht die
Typprüfung.

Unter `event.competition.timing` bleibt nur ein Hinweis übrig:

```json
"inheritedHint": {
  "1": "Zeitnahme-System und Dateiformate gelten für die ganze Veranstaltung und werden ",
  "2": "in deren Einstellungen",
  "3": " gepflegt. Hier wird nur zugeordnet, womit dieser Wettkampf gestoppt wird."
}
```

- [ ] **Schritt 7: Die beiden Einstiege umbauen**

`EventTimingConfig.tsx`:
- Importe und Verwendung von `RaceClockerRaceAssignments`, `EventCompetitionTimingSection`,
  `CompetitionTimingDeviationDto` und `describeDeviation` entfernen; ebenso der State `deviations`
  und dessen Befüllung aus `data.deviatingCompetitions`.
- Unterhalb des Speichern-Knopfs (nach dem `Divider`) `<TimingProfileTree eventId={eventId} />`.
- Den Text `event.timing.raceclockerHint` anpassen: Er beschreibt heute das Anhaken am Rennen;
  künftig: Rennen hier anlegen, zugeordnet wird im Profil-Baum darunter.

`CompetitionTimingConfig.tsx`: auf Überschrift, den Hinweis
`event.competition.timing.inheritedHint` (mit `InlineLink` auf
`/event/$eventId` mit `search={{tab: 'settings'}}`) und
`<TimingProfileTree eventId={eventId} competitionId={competitionId} />` zusammenstreichen.
Formular, `override`-Schalter, Warnungen und alle Preset-Felder entfallen.

`CompetitionExecution.tsx`: `getTimingConfig` durch `getEventTimingConfig({signal, path:
{eventId}})` ersetzen; `timingSystem={...}` bekommt `timingConfig?.timingSystem ?? 'NONE'`.
Die aus `timingConfigForm.ts` importierten Helfer (`effectiveTimingSystem`,
`mapDtoToTimingForm`, `timingConfigWarnings`) entfallen — die Startlisten-Warnung rechnet nur noch
auf `timingConfig?.startlistConfig`. `TimingFormSystem` wird in `matchResultOptions.ts` und
`CompetitionExecutionRound.tsx` benutzt: den Typ dorthin verschieben, wo er gebraucht wird, oder
durch den generierten `TimingSystem | 'NONE'` ersetzen — kein `any`.

- [ ] **Schritt 8: Die alten Dateien löschen**

```bash
cd frontend && rm src/components/event/timing/EventCompetitionTimingSection.tsx \
  src/components/event/timing/eventCompetitionTimingRows.ts \
  src/components/event/timing/eventCompetitionTimingRows.test.ts \
  src/components/event/timing/RaceClockerRaceAssignments.tsx \
  src/components/event/competition/timing/TimingModeAssignmentSection.tsx \
  src/components/event/competition/timing/timingConfigForm.ts \
  src/components/event/competition/timing/timingConfigForm.test.ts
```

- [ ] **Schritt 9: Bauen, prüfen, testen**

```bash
cd frontend && npm run build && npm run lint && npx vitest run
```

Erwartet: alles grün, keine `any`-Warnung, keine unbenutzten Importe.

- [ ] **Schritt 10: Commit**

```bash
git add frontend/src
git commit -m "Zeitnahmeprofile: ein Baum statt zweier Zuordnungswelten"
```

---

## Task 6: Den alten Weg entfernen

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608242110__competition_timing_override_weg.sql`
- Modify: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timingProfile/TimingProfileMigrationTest.kt`
  (Gegenprobe: alte Tabelle und die vier Spalten sind weg)
- Delete: `app/timingConfig/entity/TimingConfigDto.kt`, `TimingConfigRequest.kt`,
  `CompetitionTimingDeviationDto.kt`, `app/timingConfig/control/TimingConfigRepo.kt`
- Delete: `app/timing/boundary/TimingModeResolveLogic.kt`,
  `app/timing/control/TimingModeAssignmentRepo.kt`,
  `app/timing/entity/TimingModeAssignmentDto.kt`, `TimingModeAssignmentRequest.kt`
- Delete: `app/raceclocker/entity/RaceClockerRaceAssignments.kt` (falls nur noch für die
  umgedrehte Sicht gebraucht — vorher `grep` prüfen)
- Modify: `app/timingConfig/boundary/TimingConfigService.kt`, `timingConfig.kt`
- Modify: `app/timing/boundary/TimingModeService.kt`, `timing.kt`
- Modify: `app/raceclocker/boundary/RaceClockerRaceService.kt`, `raceClockerRace.kt`
- Modify: `app/competition/boundary/competition.kt` (die Route `timingConfig()` aushängen)
- Modify: `app/timingConfig/entity/EventTimingConfigDto.kt` (`deviatingCompetitions` raus)
- Modify: `backend/src/main/resources/openapi/documentation.yaml`
- Delete: die Tests, die nur die entfernten Endpunkte prüfen
  (`app/timingConfig/EventTimingConfigRequestTest` bleibt, prüfen)

**Interfaces:**
- Consumes: alles aus den Tasks 1–4.
- Produces: nichts Neues; danach existiert genau ein Weg.

- [ ] **Schritt 1: Migration schreiben**

```sql
set search_path to ready2race, pg_catalog, public;

-- Das Zeitnahme-System und die beiden Dateiformate gehören zur Veranstaltung, nicht zum
-- Wettkampf: Zwei Zeitnahme-Softwares in einer Regatta gibt es nicht, und alle Wettkämpfe
-- exportieren und importieren dieselben Spalten. Die Möglichkeit, davon je Wettkampf
-- abzuweichen, erzeugte nur Zustände, die man erklären, anzeigen und beim Ändern der
-- Voreinstellung im Auge behalten musste (die ganze Abweichungsliste existierte dafür).
--
-- Das Rennen zieht in den Zeitnahmeprofil-Baum um (V202608242100) und braucht seine Spalte
-- nicht mehr.
alter table competition
    drop column raceclocker_race,
    drop column timing_system,
    drop column startlist_config,
    drop column result_import_config;

-- Die alte Zuordnungstabelle der Zeitnahmetypen: ihr Inhalt steht seit V202608242100 im
-- Profil-Baum, und ab diesem Task benutzt sie kein Code mehr.
drop table timing_mode_assignment;
```

Den Migrationstest aus Task 1 (`TimingProfileMigrationTest`) um die Gegenprobe erweitern — er
migriert ohnehin bis zum Ende, dort gilt also schon der Stand NACH dieser Migration. Innerhalb
des bestehenden `connect(postgres).use { conn -> … }`-Blocks ergänzen:

```kotlin
                // Die alten Wege sind wirklich weg -- nicht nur unbenutzt.
                assertFalse(tableExists(conn, "timing_mode_assignment"))
                assertFalse(columnExists(conn, "competition", "raceclocker_race"))
                assertFalse(columnExists(conn, "competition", "timing_system"))
                assertFalse(columnExists(conn, "competition", "startlist_config"))
                assertFalse(columnExists(conn, "competition", "result_import_config"))
```

Die beiden Hilfsfunktionen dazu (Vorbild: `RaceClockerSingleRaceMigrationTest`):

```kotlin
    private fun tableExists(conn: Connection, table: String): Boolean =
        conn.prepareStatement(
            "select exists (select 1 from information_schema.tables " +
                "where table_schema = 'ready2race' and table_name = ?)"
        ).use { stmt ->
            stmt.setString(1, table)
            stmt.executeQuery().use { rs ->
                rs.next()
                rs.getBoolean(1)
            }
        }

    private fun columnExists(conn: Connection, table: String, column: String): Boolean =
        conn.prepareStatement(
            "select exists (select 1 from information_schema.columns " +
                "where table_schema = 'ready2race' and table_name = ? and column_name = ?)"
        ).use { stmt ->
            stmt.setString(1, table)
            stmt.setString(2, column)
            stmt.executeQuery().use { rs ->
                rs.next()
                rs.getBoolean(1)
            }
        }
```

**Vor dem Ausrollen auf Produktion** die Abfrage aus dem Design-Dokument laufen lassen — hier
gehen Werte verloren, und das ist beabsichtigt.

- [ ] **Schritt 2: Kotlin aufräumen**

Reihenfolge, die den Compiler als Wegweiser benutzt: erst die Dateien löschen, dann
`./mvnw clean compile` und jede gemeldete Stelle abarbeiten.

- `TimingConfigService`: `getTimingConfig` und `updateTimingConfig` samt
  `ensureRaceBelongsToEvent` entfernen; in `getEventTimingConfig` das Feld
  `deviatingCompetitions` und den `TimingConfigRepo`-Aufruf streichen.
- `timingConfig.kt`: `fun Route.timingConfig()` löschen; in `app/competition/boundary/competition.kt`
  den Aufruf entfernen.
- `TimingModeService`: `getModeAssignments` und `upsertModeAssignment` entfernen; in `timing.kt`
  die Route `/modeAssignments` löschen. `TimingModeService.deleteMode` prüft heute über
  `TimingModeAssignmentRepo.existsByMode`, ob der Typ noch zugeordnet ist — diese Prüfung auf
  `TIMING_PROFILE_ASSIGNMENT.TIMING_MODE` umstellen, nicht ersatzlos streichen.
- `RaceClockerRaceService`: `getCompetitionAssignments` und `setRaceAssignments` entfernen; in
  `raceClockerRace.kt` die beiden Routen `/competition-assignments` und `/{raceId}/assignments`.
- `EventTimingConfigDto`: Feld `deviatingCompetitions` entfernen.

- [ ] **Schritt 3: OpenAPI aufräumen**

Die Pfade `/event/{eventId}/competition/{competitionId}/timing-config`,
`/event/{eventId}/timing/modeAssignments`,
`/event/{eventId}/raceclocker-race/competition-assignments` und
`/event/{eventId}/raceclocker-race/{raceId}/assignments` löschen; die Schemata `TimingConfigDto`,
`TimingConfigRequest`, `CompetitionTimingDeviationDto`, `TimingModeAssignmentDto`,
`TimingModeAssignmentRequest`, `CompetitionRaceAssignmentDto`,
`RaceClockerRaceAssignmentsRequest` entfernen und `deviatingCompetitions` aus
`EventTimingConfigDto` streichen.

- [ ] **Schritt 4: Bauen und testen**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
cd ../frontend && npm run generate && npm run build && npm run lint && npx vitest run
```

Erwartet: beides grün. `npm run generate` entfernt die gelöschten Operationen aus `sdk.gen.ts`;
bricht der Frontend-Build danach, benutzt sie noch jemand — die Stelle gehörte in Task 5.

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "Wettkampf-eigenes Zeitnahme-System und Dateiformate entfernt"
```

---

## Task 7: Gesamtprüfung

**Files:** keine Änderung, außer was die Prüfung zutage fördert.

- [ ] **Schritt 1: Voller Backend-Lauf**

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
cd backend && ./mvnw clean test -Ddatabase.url=jdbc:postgresql://localhost:7728/ready2race-build
```

Erwartet: `BUILD SUCCESS`, keine Fehler, keine übersprungenen Tests. Die Zahl der gelaufenen
Tests notieren.

- [ ] **Schritt 2: Voller Frontend-Lauf**

```bash
cd frontend && npm run build && npm run lint && npx vitest run
```

- [ ] **Schritt 3: Auf tote Verweise prüfen**

```bash
cd /Users/thomas/Developer/privat/ready2race/.claude/worktrees/event-timing-settings-consolidate-029471
grep -rn "TimingModeAssignment\|timingModeAssignment\|modeAssignments\|RaceClockerRaceAssignment\|competition-assignments\|CompetitionTimingDeviation\|deviatingCompetitions" backend/src frontend/src --include='*.kt' --include='*.ts' --include='*.tsx' --include='*.yaml' | grep -v node_modules
```

Erwartet: keine Treffer. Treffer in `frontend/src/api/*.gen.ts` bedeuten, dass
`npm run generate` nach der letzten Yaml-Änderung nicht gelaufen ist.

- [ ] **Schritt 4: Die Wegwerf-Build-DB stehen lassen**

Nicht löschen — sie gehört zu diesem Worktree und wird beim nächsten Lauf gebraucht. Wird der
Worktree aufgelöst: `docker rm -f r2r-zeitprofil-builddb`.

- [ ] **Schritt 5: Übergabe schreiben**

Kurze Zusammenfassung in die Antwort an Thomas: was gebaut wurde, welche Migrationen entstanden
sind (`V202608242100`, `V202608242110`), dass die Wettkampf-Übersteuerungen von System und
Formaten ersatzlos entfallen, und welche Handtests offen sind:

1. Veranstaltung auf „Interne Zeitnahme": Zeitnahmetyp an der Wurzel setzen, ein Wettkampf
   abweichen lassen, eine einzelne Partie abweichen lassen — am Posten-Board prüfen, dass die
   Partie ihre eigene Startsequenz bekommt.
2. Dieselbe Kette mit RaceClocker und zwei Rennen; danach ein zugeordnetes Rennen löschen wollen
   (muss mit „noch zugewiesen" abgelehnt werden).
3. „Alles darunter auf Erben" an der Wurzel und an einem Wettkampf.
4. Zeitnahme-Tab eines Wettkampfs: zeigt denselben Teilbaum und den Hinweis auf die
   Veranstaltung.
5. Startlisten-Export und Ergebnis-Import ziehen ihr Format jetzt immer von der Veranstaltung.
