# Rechtekonzept Schritt 1: Jobs, ROLE, STAFF, Vergaberegeln, Superadmin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rollen entstehen aus im Code definierten Jobs, werden beim Start nachgetragen, und niemand kann sich über die Rollenverwaltung Rechte verschaffen, die er nicht selbst hat.

**Architecture:** Ein `sealed class Job` im Backend definiert Schlüssel, Ebene und Privilegien jedes Jobs; `initializeDatabase` sät und synchronisiert daraus statische Rollen und trägt Kopien nach. Drei neue Ressourcen ROLE (Rollen verwalten), STAFF (Rollen zuweisen) und SYSTEM (Superadmin-Sperre) lösen `UPDATE USER GLOBAL` als heimlichen Admin ab. `RoleService` prüft Teilmenge, Selbstzuweisung und Sperre nach oben. Das Frontend zeigt Privilegien gruppiert und übersetzt, Rollen entstehen als Kopie eines Jobs. Alles bleibt in diesem Schritt GLOBAL; der EVENT-Scope kommt in Schritt 3.

**Tech Stack:** Kotlin/Ktor, jOOQ, Flyway, KIO (`KIO.comprehension`, `!`), Testcontainers-Postgres (`testComprehension`, `testApplicationComprehension`), React/TypeScript, react-hook-form-mui, i18next, `@hey-api/openapi-ts` aus der handgepflegten `documentation.yaml`.

**Spec:** `docs/superpowers/specs/2026-09-07-rechtekonzept-design.md` (Abschnitte 4, 6, 7, 8, 9, 10.2 Schritt 1)

## Global Constraints

- Deutsche Texte mit echten Umlauten (ä, ö, ü, ß). Code-Kommentare auf Deutsch wie im Bestand.
- Keine Herkunftsangaben, keine Erwähnung von KI oder Claude in Commits, Kommentaren oder Doku.
- **Eigene Build-DB für diesen Worktree.** Jeder Maven-Aufruf trägt `-Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build`. Container anlegen (einmalig):
  ```bash
  docker run -d --name r2r-rechte-builddb -e POSTGRES_USER=developer -e POSTGRES_PASSWORD=sql -e POSTGRES_DB=ready2race-build -p 7770:5432 postgres:17
  ```
- Maven immer so aufrufen (aus `backend/`):
  ```bash
  JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=<Klasse> -DfailIfNoSpecifiedTests=false
  ```
  Nach der Migration in Task 1 einmal mit `clean` bauen, damit die jOOQ-Typen die neuen Spalten kennen.
- Migrationsstempel dieses Plans: `V202609081000`. Kein weiterer in Schritt 1.
- `KIO.fail` innerhalb `comprehension` braucht das `!` (sonst No-Op). `KIO.failOn(cond) { Error }` ebenfalls mit `!`.
- Die OpenAPI-Yaml `backend/src/main/resources/openapi/documentation.yaml` ist handgepflegt. Nach jeder Yaml-Änderung `npm run generate` in `frontend/` und die erzeugten Dateien `src/api/*.gen.ts` mit committen.
- Frontend-Prüfung: `npm run build` (tsc) und `npm run test` in `frontend/`.
- Feste Rollen-IDs (Spec 6.1) stehen in `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/static.kt`. Neue: `SUPERADMIN_ROLE = …0003`, operative Jobs ab `…0010`.
- Commit-Nachrichten auf Deutsch, Stil: `Rechte: <was>`.

---

### Task 1: Migration, Views, Konstanten

**Files:**
- Create: `backend/src/main/resources/db/migration/V202609081000__role_job_level.sql`
- Modify: `backend/src/main/resources/db/migration/afterMigrate.sql` (Views `every_role_with_privileges`, `role_with_privileges`, `every_app_user_with_roles`, `app_user_with_roles`, `app_user_with_privileges`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/static.kt`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleSchemaTest.kt`

**Interfaces:**
- Produces: Spalten `role.job text null`, `role.level text not null`; Konstanten `SUPERADMIN_ROLE`, `COMPETITION_MANAGEMENT_ROLE`, `REGISTRATION_OFFICE_ROLE`, `FINANCE_ROLE`, `JUDGE_ROLE`, `TIMEKEEPER_ROLE`, `ANNOUNCER_ROLE`, `STREAM_DIRECTOR_ROLE`, `HELPER_REQUIREMENTS_ROLE`, `HELPER_ACCESS_PASS_ROLE`, `HELPER_CHECK_IN_ROLE`, `HELPER_CATERING_ROLE`; View-Felder `job`, `level` in `EveryRoleWithPrivilegesRecord` und `RoleWithPrivilegesRecord`.

- [ ] **Step 1: Build-DB anlegen** (falls der Container noch nicht läuft)

```bash
docker run -d --name r2r-rechte-builddb -e POSTGRES_USER=developer -e POSTGRES_PASSWORD=sql -e POSTGRES_DB=ready2race-build -p 7770:5432 postgres:17
```

- [ ] **Step 2: Migration schreiben**

`backend/src/main/resources/db/migration/V202609081000__role_job_level.sql`:

```sql
-- Rollen tragen ab jetzt den Job, aus dem sie stammen, und die Ebene, auf der sie
-- zugewiesen werden. Statische Rollen sind genau die Jobs; eigene Rollen sind Kopien.
-- Ebene: SELF, CLUB, EVENT, GLOBAL (ORGANIZER reserviert für den Mandanten-Umbau).
alter table role add column job text;
alter table role add column level text not null default 'GLOBAL';

update role set job = 'ADMIN', level = 'GLOBAL' where id = '00000000-0000-0000-0000-000000000000';
update role set job = 'USER', level = 'SELF' where id = '00000000-0000-0000-0000-000000000001';
update role set job = 'CLUB_REPRESENTATIVE', level = 'CLUB' where id = '00000000-0000-0000-0000-000000000002';

alter table role add constraint role_level_check
    check (level in ('SELF', 'CLUB', 'EVENT', 'ORGANIZER', 'GLOBAL'));
```

- [ ] **Step 3: Views anpassen**

In `afterMigrate.sql`:

`every_role_with_privileges` bekommt `r.job, r.level` hinter `r.static`:

```sql
create view every_role_with_privileges as
select r.id,
       r.name,
       r.description,
       r.static,
       r.job,
       r.level,
       coalesce(array_agg(p) filter ( where p.id is not null ), '{}') as privileges
from role r
         left join role_has_privilege rhp on r.id = rhp.role
         left join privilege p on rhp.privilege = p.id
group by r.id;
```

`role_with_privileges` (Zeilen ~97-104) ebenfalls `r.job, r.level` in die Select-Liste aufnehmen.

`every_app_user_with_roles`: der Join wechselt von `role_with_privileges` auf `every_role_with_privileges`, damit statische Rollen (Admin, Vereinsvertreter, Jobs) am Konto sichtbar sind:

```sql
         left join every_role_with_privileges rwp on auhr.role = rwp.id
```

`app_user_with_roles`: die Ausnahme wechselt von der Admin- auf die Superadmin-Rolle:

```sql
where not exists(select *
                 from app_user_has_role auhr2
                 where auhr2.role = '00000000-0000-0000-0000-000000000003'
                   and auhr2.app_user = au.id)
```

`app_user_with_privileges`: der Admin-Durchgriff fällt weg. Die Zeile

```sql
         left join privilege p on rhp.privilege = p.id or auhr.role = '00000000-0000-0000-0000-000000000000'
```

wird zu

```sql
         left join privilege p on rhp.privilege = p.id
```

Der Kommentar darüber: `-- Rechte kommen nur noch über role_has_privilege; die Jobs werden beim Start synchronisiert.`

- [ ] **Step 4: Konstanten ergänzen**

`static.kt` nach `CLUB_REPRESENTATIVE_ROLE`:

```kotlin
val SUPERADMIN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000003")!!

// Jobs der Ebene Veranstalter (bis zum Mandanten-Umbau GLOBAL)
val COMPETITION_MANAGEMENT_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000010")!!
val REGISTRATION_OFFICE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000011")!!
val FINANCE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000012")!!

// Jobs der Ebene Veranstaltung (Scope EVENT kommt in Schritt 3, bis dahin GLOBAL)
val JUDGE_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000020")!!
val TIMEKEEPER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000021")!!
val ANNOUNCER_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000022")!!
val STREAM_DIRECTOR_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000023")!!
val HELPER_REQUIREMENTS_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000030")!!
val HELPER_ACCESS_PASS_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000031")!!
val HELPER_CHECK_IN_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000032")!!
val HELPER_CATERING_ROLE = UUID.fromString("00000000-0000-0000-0000-000000000033")!!
```

Den Kommentar `// Remember to exclude system roles in deleteExceptSystem()` ersetzen durch `// Rollen, die andere Abläufe verwalten (jedes Konto trägt USER, die Vereinsfreigabe vergibt CLUB_REPRESENTATIVE), siehe AppUserHasRoleRepo.deleteManaged`.

- [ ] **Step 5: Test schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleSchemaTest.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.database.ADMIN_ROLE
import de.lambda9.ready2race.backend.database.CLUB_REPRESENTATIVE_ROLE
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/** Die Migration V202609081000 hängt Job und Ebene an die drei bestehenden statischen Rollen. */
class RoleSchemaTest {

    @Test
    fun theThreeLegacyRolesCarryJobAndLevel() = testComprehension {
        val admin = assertNotNull(!RoleRepo.get(ADMIN_ROLE))
        assertEquals("ADMIN", admin.job)
        assertEquals("GLOBAL", admin.level)

        val user = assertNotNull(!RoleRepo.get(USER_ROLE))
        assertEquals("USER", user.job)
        assertEquals("SELF", user.level)

        val club = assertNotNull(!RoleRepo.get(CLUB_REPRESENTATIVE_ROLE))
        assertEquals("CLUB_REPRESENTATIVE", club.job)
        assertEquals("CLUB", club.level)
    }
}
```

- [ ] **Step 6: Bauen und Test laufen lassen**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q clean test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=RoleSchemaTest -DfailIfNoSpecifiedTests=false
```

Expected: PASS. (Der Testrunner migriert seinen eigenen Testcontainer und ruft `initializeDatabase`; die Migration muss dort durchlaufen.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/resources/db/migration/V202609081000__role_job_level.sql backend/src/main/resources/db/migration/afterMigrate.sql backend/src/main/kotlin/de/lambda9/ready2race/backend/database/static.kt backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleSchemaTest.kt
git commit -m "Rechte: Rollen tragen Job und Ebene, Admin-Durchgriff im View entfällt"
```

---

### Task 2: Ressourcen ROLE, STAFF, SYSTEM

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt`
- Modify: `backend/src/main/resources/openapi/documentation.yaml` (Schema `Resource`, ~Zeile 11898)
- Modify: `frontend/src/authorization/privileges.ts`
- Generate: `frontend/src/api/types.gen.ts`, `frontend/src/api/sdk.gen.ts`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/auth/PrivilegeEntriesTest.kt`

**Interfaces:**
- Produces: `Privilege.CreateRoleGlobal`, `ReadRoleGlobal`, `UpdateRoleGlobal`, `DeleteRoleGlobal`, `ReadStaffGlobal`, `UpdateStaffGlobal`, `UpdateSystemGlobal`; Frontend-Konstanten `createRoleGlobal`, `readRoleGlobal`, `updateRoleGlobal`, `deleteRoleGlobal`, `readStaffGlobal`, `updateStaffGlobal`, `updateSystemGlobal`.

- [ ] **Step 1: Test schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/auth/PrivilegeEntriesTest.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.auth

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PrivilegeEntriesTest {

    /** Zwei data objects mit demselben Tripel wären in der Datenbank ein Unique-Verstoß. */
    @Test
    fun everyTripleIsUnique() {
        val triples = Privilege.entries.map { Triple(it.action, it.resource, it.scope) }
        assertEquals(triples.size, triples.toSet().size)
    }

    @Test
    fun theNewResourcesCarryTheirPrivileges() {
        val entries = Privilege.entries
        assertTrue(entries.contains(Privilege.CreateRoleGlobal))
        assertTrue(entries.contains(Privilege.ReadRoleGlobal))
        assertTrue(entries.contains(Privilege.UpdateRoleGlobal))
        assertTrue(entries.contains(Privilege.DeleteRoleGlobal))
        assertTrue(entries.contains(Privilege.ReadStaffGlobal))
        assertTrue(entries.contains(Privilege.UpdateStaffGlobal))
        assertTrue(entries.contains(Privilege.UpdateSystemGlobal))
    }
}
```

- [ ] **Step 2: Test laufen lassen, muss an Kompilierfehler scheitern**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=PrivilegeEntriesTest -DfailIfNoSpecifiedTests=false
```

Expected: FAIL, `Unresolved reference: CreateRoleGlobal`.

- [ ] **Step 3: Privilegien ergänzen**

In `Privilege.kt`, Enum `Resource` am Ende:

```kotlin
        ROLE,
        STAFF,
        SYSTEM,
```

Nach `ReadAdministrationConfigGlobal`:

```kotlin
    // Rollen verwalten: anlegen (als Kopie eines Jobs), ändern, löschen. Nur GLOBAL.
    data object CreateRoleGlobal : Privilege(Action.CREATE, Resource.ROLE, Scope.GLOBAL)
    data object ReadRoleGlobal : Privilege(Action.READ, Resource.ROLE, Scope.GLOBAL)
    data object UpdateRoleGlobal : Privilege(Action.UPDATE, Resource.ROLE, Scope.GLOBAL)
    data object DeleteRoleGlobal : Privilege(Action.DELETE, Resource.ROLE, Scope.GLOBAL)

    // Rollen zuweisen und entziehen. Bekommt in Schritt 3 den Scope EVENT für Tagesteams.
    data object ReadStaffGlobal : Privilege(Action.READ, Resource.STAFF, Scope.GLOBAL)
    data object UpdateStaffGlobal : Privilege(Action.UPDATE, Resource.STAFF, Scope.GLOBAL)

    // Die Sperre nach oben: nur der Superadmin trägt es. Wer es nicht hat, kann weder die
    // Superadmin-Rolle vergeben (Teilmengenregel) noch Superadmin-Konten sehen.
    data object UpdateSystemGlobal : Privilege(Action.UPDATE, Resource.SYSTEM, Scope.GLOBAL)
```

- [ ] **Step 4: Test laufen lassen**

Gleicher Befehl wie Step 2. Expected: PASS.

- [ ] **Step 5: Yaml und Frontend**

In `documentation.yaml`, Schema `Resource`, Enum um drei Werte ergänzen:

```yaml
        - ROLE
        - STAFF
        - SYSTEM
```

Dann:

```bash
cd frontend && npm run generate
```

In `frontend/src/authorization/privileges.ts` am Ende anhängen:

```ts
// Rollen verwalten (anlegen als Kopie eines Jobs, ändern, löschen).
export const createRoleGlobal: Privilege = {action: 'CREATE', resource: 'ROLE', scope: 'GLOBAL'}
export const readRoleGlobal: Privilege = {action: 'READ', resource: 'ROLE', scope: 'GLOBAL'}
export const updateRoleGlobal: Privilege = {action: 'UPDATE', resource: 'ROLE', scope: 'GLOBAL'}
export const deleteRoleGlobal: Privilege = {action: 'DELETE', resource: 'ROLE', scope: 'GLOBAL'}

// Rollen zuweisen und entziehen.
export const readStaffGlobal: Privilege = {action: 'READ', resource: 'STAFF', scope: 'GLOBAL'}
export const updateStaffGlobal: Privilege = {action: 'UPDATE', resource: 'STAFF', scope: 'GLOBAL'}

// Die Sperre nach oben: nur der Superadmin trägt es.
export const updateSystemGlobal: Privilege = {action: 'UPDATE', resource: 'SYSTEM', scope: 'GLOBAL'}
```

Außerdem den Fehler bei `deleteRegistrationGlobal` und `deleteRegistrationOwn` (Zeilen ~78-88) beheben: `action: 'DELETE'` statt `'UPDATE'`.

```bash
cd frontend && npm run build
```

Expected: tsc ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt backend/src/main/resources/openapi/documentation.yaml backend/src/test/kotlin/de/lambda9/ready2race/backend/app/auth/PrivilegeEntriesTest.kt frontend/src/authorization/privileges.ts frontend/src/api
git commit -m "Rechte: Ressourcen ROLE, STAFF und SYSTEM"
```

---

### Task 3: Jobs im Code und Synchronisation beim Start

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/entity/RoleLevel.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/entity/Job.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/boundary/JobSeeder.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/initializeDatabase.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/control/RoleRepo.kt` (`getByJob`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/control/RoleHasPrivilegeRepo.kt` (`delete(roleId, privilegeIds)`)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/JobSeederTest.kt`

**Interfaces:**
- Consumes: Konstanten aus Task 1, Privilegien aus Task 2.
- Produces: `enum class RoleLevel { SELF, CLUB, EVENT, ORGANIZER, GLOBAL }`; `sealed class Job(key: String, roleId: UUID, level: RoleLevel, defaultName: String, privileges: List<Privilege>)` mit `Job.entries` und `Job.byKey(key: String): Job?`; `JobSeeder.sync(now: LocalDateTime): App<Nothing, Unit>` (idempotent); `RoleRepo.getByJob(job: String): JIO<List<RoleRecord>>`; `RoleHasPrivilegeRepo.delete(roleId: UUID, privilegeIds: Collection<UUID>)`.

- [ ] **Step 1: RoleLevel und Job anlegen**

`RoleLevel.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role.entity

/**
 * Ebene, auf der eine Rolle zugewiesen wird. ORGANIZER ist für den Mandanten-Umbau reserviert
 * und trägt noch keine Rollen.
 */
enum class RoleLevel {
    SELF,
    CLUB,
    EVENT,
    ORGANIZER,
    GLOBAL,
}
```

`Job.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.auth.entity.Privilege.*
import de.lambda9.ready2race.backend.database.*
import java.util.UUID

/**
 * Ein Job ist eine im Code definierte Rolle: Schlüssel, feste Rollen-ID, Ebene und Privilegien.
 * Beim Start werden Jobs als statische Rollen gesät und synchronisiert; eigene Rollen entstehen
 * als Kopie eines Jobs und tragen dessen Schlüssel.
 *
 * Die Privilegien sind der Stand vor dem Ressourcen-Schnitt (Schritt 2 des Rechtekonzepts):
 * Bis dahin tragen operative Jobs die heutigen breiten Rechte, damit sie ab sofort vergeben
 * und nachgetragen werden können. Anzeigename und Beschreibung übersetzt das Frontend über
 * `job.<key>.name` und `job.<key>.description`; `defaultName` ist nur der Datenbankname.
 */
sealed class Job(
    val key: String,
    val roleId: UUID,
    val level: RoleLevel,
    val defaultName: String,
    val privileges: List<Privilege>,
) {

    data object Superadmin : Job(
        "SUPERADMIN", SUPERADMIN_ROLE, RoleLevel.GLOBAL, "Superadmin",
        Privilege.entries,
    )

    data object Admin : Job(
        "ADMIN", ADMIN_ROLE, RoleLevel.GLOBAL, "Admin",
        Privilege.entries - UpdateSystemGlobal,
    )

    data object User : Job(
        "USER", USER_ROLE, RoleLevel.SELF, "User",
        listOf(ReadUserOwn, UpdateUserOwn),
    )

    data object ClubRepresentative : Job(
        "CLUB_REPRESENTATIVE", CLUB_REPRESENTATIVE_ROLE, RoleLevel.CLUB, "Club representative",
        listOf(
            ReadClubOwn, UpdateClubOwn,
            ReadEventOwn,
            ReadRegistrationOwn, CreateRegistrationOwn, UpdateRegistrationOwn,
            ReadInvoiceOwn,
            UpdateResultOwn, ReadResultOwn,
        ),
    )

    data object CompetitionManagement : Job(
        "COMPETITION_MANAGEMENT", COMPETITION_MANAGEMENT_ROLE, RoleLevel.GLOBAL, "Competition management",
        listOf(
            CreateEventGlobal, ReadEventGlobal, UpdateEventGlobal, DeleteEventGlobal,
            ReadRegistrationGlobal, UpdateRegistrationGlobal,
            CreateSubstitutionGlobal, DeleteSubstitutionGlobal,
            ReadInvoiceGlobal,
            ReadClubGlobal,
            ReadResultGlobal, UpdateResultGlobal,
            ReadLiveDashboardGlobal, UpdateLiveDashboardGlobal,
            ReadBoardGlobal, UpdateBoardGlobal,
            ReadStreamGlobal, UpdateStreamGlobal,
            UpdateAppTimingGlobal, UpdateAppEventRequirementGlobal, UpdateAppQrManagementGlobal,
            UpdateAppCompetitionCheckGlobal, UpdateAppCatererGlobal,
            ReadUserGlobal,
            ReadStaffGlobal, UpdateStaffGlobal,
            ReadRoleGlobal,
        ),
    )

    data object RegistrationOffice : Job(
        "REGISTRATION_OFFICE", REGISTRATION_OFFICE_ROLE, RoleLevel.GLOBAL, "Registration office",
        listOf(
            ReadEventGlobal,
            ReadRegistrationGlobal, UpdateRegistrationGlobal,
            CreateSubstitutionGlobal, DeleteSubstitutionGlobal,
            ReadClubGlobal,
        ),
    )

    data object Finance : Job(
        "FINANCE", FINANCE_ROLE, RoleLevel.GLOBAL, "Finance",
        listOf(
            ReadEventGlobal,
            CreateInvoiceGlobal, ReadInvoiceGlobal, UpdateInvoiceGlobal,
            ReadRegistrationGlobal,
            ReadClubGlobal,
        ),
    )

    data object Judge : Job(
        "JUDGE", JUDGE_ROLE, RoleLevel.EVENT, "Judge",
        listOf(ReadEventGlobal, ReadLiveDashboardGlobal, UpdateLiveDashboardGlobal, ReadResultGlobal),
    )

    data object Timekeeper : Job(
        "TIMEKEEPER", TIMEKEEPER_ROLE, RoleLevel.EVENT, "Timekeeper",
        listOf(ReadEventGlobal, UpdateAppTimingGlobal),
    )

    data object Announcer : Job(
        "ANNOUNCER", ANNOUNCER_ROLE, RoleLevel.EVENT, "Announcer",
        listOf(ReadEventGlobal, ReadBoardGlobal, UpdateBoardGlobal, ReadResultGlobal),
    )

    data object StreamDirector : Job(
        "STREAM_DIRECTOR", STREAM_DIRECTOR_ROLE, RoleLevel.EVENT, "Stream director",
        listOf(ReadEventGlobal, ReadStreamGlobal, UpdateStreamGlobal, ReadResultGlobal),
    )

    data object HelperRequirements : Job(
        "HELPER_REQUIREMENTS", HELPER_REQUIREMENTS_ROLE, RoleLevel.EVENT, "Helper: requirements",
        listOf(UpdateAppEventRequirementGlobal),
    )

    data object HelperAccessPass : Job(
        "HELPER_ACCESS_PASS", HELPER_ACCESS_PASS_ROLE, RoleLevel.EVENT, "Helper: access passes",
        listOf(UpdateAppQrManagementGlobal),
    )

    data object HelperCheckIn : Job(
        "HELPER_CHECK_IN", HELPER_CHECK_IN_ROLE, RoleLevel.EVENT, "Helper: check-in",
        listOf(UpdateAppCompetitionCheckGlobal),
    )

    data object HelperCatering : Job(
        "HELPER_CATERING", HELPER_CATERING_ROLE, RoleLevel.EVENT, "Helper: catering",
        listOf(UpdateAppCatererGlobal),
    )

    companion object {
        val entries: List<Job> get() = Job::class.sealedSubclasses.map { it.objectInstance!! }
        fun byKey(key: String): Job? = entries.firstOrNull { it.key == key }
    }
}
```

Hinweis: Jobs der Ebene EVENT tragen in diesem Schritt GLOBAL-Privilegien, weil der EVENT-Scope erst in Schritt 3 existiert. Die Ebene ist trotzdem schon gesetzt, damit die Rollenverwaltung sie anzeigt.

- [ ] **Step 2: Test für den Seeder schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/JobSeederTest.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.role.boundary.JobSeeder
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JobSeederTest {

    private val now = LocalDateTime.of(2026, 9, 7, 10, 0)

    private fun privilegeId(all: List<PrivilegeRecord>, p: Privilege): UUID =
        all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }.id

    /** initializeDatabase läuft im Testrunner; jeder Job muss danach als statische Rolle liegen. */
    @Test
    fun everyJobExistsAsStaticRoleWithExactlyItsPrivileges() = testComprehension {
        val all = !PrivilegeRepo.all()
        Job.entries.forEach { job ->
            val role = assertNotNull(!RoleRepo.get(job.roleId), "Rolle für ${job.key}")
            assertTrue(role.static, job.key)
            assertEquals(job.key, role.job)
            assertEquals(job.level.name, role.level)

            val expected = job.privileges.map { privilegeId(all, it) }.toSet()
            val actual = (!RoleHasPrivilegeRepo.getPrivilegesByRole(job.roleId)).toSet()
            assertEquals(expected, actual, "Privilegien von ${job.key}")
        }
    }

    /** Ein Privileg zu viel an einer statischen Rolle wird beim nächsten Start entfernt. */
    @Test
    fun syncRemovesStrayPrivilegesFromStaticRoles() = testComprehension {
        val all = !PrivilegeRepo.all()
        val stray = privilegeId(all, Privilege.UpdateSystemGlobal)
        !RoleHasPrivilegeRepo.create(listOf(RoleHasPrivilegeRecord(role = Job.Timekeeper.roleId, privilege = stray)))

        !JobSeeder.sync(now)

        val after = !RoleHasPrivilegeRepo.getPrivilegesByRole(Job.Timekeeper.roleId)
        assertTrue(stray !in after)
    }

    /** Eine Kopie bekommt neue Job-Privilegien nachgetragen, behält aber eigene Abweichungen. */
    @Test
    fun syncAddsJobPrivilegesToCopiesButKeepsTheirDeviations() = testComprehension {
        val all = !PrivilegeRepo.all()
        val copyId = UUID.randomUUID()
        !RoleRepo.create(
            RoleRecord(
                id = copyId, name = "Zeitnahme mit Boards", description = null, static = false,
                job = Job.Timekeeper.key, level = Job.Timekeeper.level.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        val deviation = privilegeId(all, Privilege.UpdateBoardGlobal)
        !RoleHasPrivilegeRepo.create(listOf(RoleHasPrivilegeRecord(role = copyId, privilege = deviation)))

        !JobSeeder.sync(now)

        val after = (!RoleHasPrivilegeRepo.getPrivilegesByRole(copyId)).toSet()
        val jobPrivileges = Job.Timekeeper.privileges.map { privilegeId(all, it) }.toSet()
        assertEquals(jobPrivileges + deviation, after)
    }

    @Test
    fun syncIsIdempotent() = testComprehension {
        !JobSeeder.sync(now)
        !JobSeeder.sync(now)
        val count = (!RoleHasPrivilegeRepo.getPrivilegesByRole(Job.Admin.roleId)).size
        assertEquals(Job.Admin.privileges.size, count)
    }
}
```

- [ ] **Step 3: Test laufen lassen, muss scheitern**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=JobSeederTest -DfailIfNoSpecifiedTests=false
```

Expected: FAIL, `Unresolved reference: JobSeeder`.

- [ ] **Step 4: Repos ergänzen**

`RoleRepo.kt`:

```kotlin
    fun getByJob(job: String): JIO<List<RoleRecord>> = Jooq.query {
        with(ROLE) {
            selectFrom(this)
                .where(JOB.eq(job))
                .fetch()
        }
    }
```

`RoleHasPrivilegeRepo.kt`:

```kotlin
    fun delete(roleId: UUID, privilegeIds: Collection<UUID>) = ROLE_HAS_PRIVILEGE.delete {
        ROLE.eq(roleId).and(PRIVILEGE.`in`(privilegeIds))
    }
```

- [ ] **Step 5: JobSeeder schreiben**

`backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/boundary/JobSeeder.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Sät die Jobs als statische Rollen und hält sie synchron:
 *  - statische Rollen tragen exakt die Privilegien ihres Jobs (Fehlendes kommt dazu, Überzähliges geht weg),
 *  - Kopien (static = false, job gesetzt) bekommen neue Job-Privilegien nachgetragen, behalten aber
 *    ihre Abweichungen.
 *
 * Läuft bei jedem Start aus initializeDatabase und ist idempotent.
 */
object JobSeeder {

    fun sync(now: LocalDateTime): App<Nothing, Unit> = KIO.comprehension {
        val all = !PrivilegeRepo.all().orDie()
        val byTriple = all.associateBy { Triple(it.action, it.resource, it.scope) }

        Job.entries.forEach { job ->
            val wanted = job.privileges.map { p ->
                byTriple[Triple(p.action.name, p.resource.name, p.scope.name)]?.id
                    ?: error("Privileg ${p.action} ${p.resource} ${p.scope} fehlt in der Datenbank")
            }.toSet()

            !ensureStaticRole(job, now)
            !syncExact(job.roleId, wanted)

            val copies = !RoleRepo.getByJob(job.key).orDie()
            copies.filter { !it.static }.forEach { copy ->
                !addMissing(copy.id, wanted)
            }
        }

        KIO.unit
    }

    // Parameter heißt bewusst nicht `job`: im Update-Lambda ist `job` das Feld des RoleRecord,
    // und ein gleichnamiger Funktionsparameter würde es verdecken.
    private fun ensureStaticRole(definition: Job, now: LocalDateTime): App<Nothing, Unit> = KIO.comprehension {
        val key = definition.key
        val levelName = definition.level.name
        val existing = !RoleRepo.get(definition.roleId).orDie()
        if (existing == null) {
            !RoleRepo.create(
                RoleRecord(
                    id = definition.roleId,
                    name = definition.defaultName,
                    description = null,
                    static = true,
                    job = key,
                    level = levelName,
                    createdAt = now,
                    createdBy = SYSTEM_USER,
                    updatedAt = now,
                    updatedBy = SYSTEM_USER,
                )
            ).orDie()
        } else if (existing.job != key || existing.level != levelName || !existing.static) {
            !RoleRepo.update(existing) {
                job = key
                level = levelName
                static = true
                updatedAt = now
                updatedBy = SYSTEM_USER
            }.orDie()
        }
        KIO.unit
    }

    private fun syncExact(roleId: UUID, wanted: Set<UUID>): App<Nothing, Unit> = KIO.comprehension {
        val current = (!RoleHasPrivilegeRepo.getPrivilegesByRole(roleId).orDie()).toSet()
        val missing = wanted - current
        val stray = current - wanted
        if (missing.isNotEmpty()) {
            !RoleHasPrivilegeRepo.create(missing.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) }).orDie()
        }
        if (stray.isNotEmpty()) {
            !RoleHasPrivilegeRepo.delete(roleId, stray).orDie()
        }
        KIO.unit
    }

    private fun addMissing(roleId: UUID, wanted: Set<UUID>): App<Nothing, Unit> = KIO.comprehension {
        val current = (!RoleHasPrivilegeRepo.getPrivilegesByRole(roleId).orDie()).toSet()
        val missing = wanted - current
        if (missing.isNotEmpty()) {
            !RoleHasPrivilegeRepo.create(missing.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) }).orDie()
        }
        KIO.unit
    }
}
```

- [ ] **Step 6: initializeDatabase umbauen**

In `initializeDatabase.kt` bleibt: Privilegien nachlegen, Systemnutzer anlegen/aktualisieren, `SequenceRepo.addMissing()`. Alles zwischen `val hashedPw` und `SequenceRepo` an Rollen wird ersetzt:

```kotlin
        val now = LocalDateTime.now()

        if (!adminUserExisting) {
            !AppUserRepo.create(
                AppUserRecord(
                    id = SYSTEM_USER,
                    email = admin.email,
                    firstname = "System",
                    lastname = "User",
                    password = hashedPw,
                    language = EmailLanguage.DE.name,
                    createdAt = now,
                    createdBy = SYSTEM_USER,
                    updatedAt = now,
                    updatedBy = SYSTEM_USER,
                )
            )
        } else {
            !AppUserRepo.update(SYSTEM_USER) {
                email = admin.email
                password = hashedPw
                updatedAt = now
                updatedBy = SYSTEM_USER
            }
        }

        // Jobs als statische Rollen säen und synchronisieren
        !JobSeeder.sync(now)

        // Der Systemnutzer trägt die Superadmin-Rolle
        val systemIsSuperadmin = !AppUserHasRoleRepo.exists(SYSTEM_USER, SUPERADMIN_ROLE)
        if (!systemIsSuperadmin) {
            !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = SYSTEM_USER, role = SUPERADMIN_ROLE))
        }
```

`adminRoleExisting`, der Admin-Block, `persistRole` und die dazugehörigen Imports (`RoleRepo`, `RoleHasPrivilegeRepo`, `PrivilegeRecord`, `ADMIN_ROLE`, `USER_ROLE`, `CLUB_REPRESENTATIVE_ROLE`) entfallen, sofern sie nicht mehr gebraucht werden. `val allPrivileges = !PrivilegeRepo.all()` entfällt ebenfalls.

- [ ] **Step 7: Tests laufen lassen**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest='JobSeederTest,RoleSchemaTest,BoardPrivilegeHttpIT' -DfailIfNoSpecifiedTests=false
```

Expected: PASS. `BoardPrivilegeHttpIT` prüft mit, dass der Admin-Login (`admin`/`admin`) weiterhin alles darf, jetzt über die Superadmin-Rolle statt den View-Durchgriff.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role backend/src/main/kotlin/de/lambda9/ready2race/backend/database/initializeDatabase.kt backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/JobSeederTest.kt
git commit -m "Rechte: Jobs im Code, Synchronisation beim Start, Superadmin-Rolle"
```

---

### Task 4: Vergaberegeln im RoleService

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/boundary/RoleService.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/entity/RoleError.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/entity/RoleRequest.kt` (Feld `job`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/control/Conversions.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/control/RoleHasPrivilegeRepo.kt` (`getPrivilegeRecordsByRoles`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/control/PrivilegeRepo.kt` (`getByIds`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/control/AppUserHasRoleRepo.kt` (`getRoleIds`, `deleteManaged`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/requests/Extensions.kt` (`covers`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/calls/responses/ErrorCode.kt` (neue Codes)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleAssignmentRulesTest.kt`

**Interfaces:**
- Consumes: `Job`, `RoleLevel`, Privilegien aus Task 2, `hasPrivilege` aus `Extensions.kt`.
- Produces:
  - `AppUserWithPrivilegesRecord.covers(record: PrivilegeRecord): Boolean` (Aktion und Ressource gleich, Level des Nutzers >= Level des Records)
  - `RoleService.checkAssignable(requester: AppUserWithPrivilegesRecord, roles: List<UUID>, targetUserId: UUID?): App<ServiceError, Unit>`
  - `RoleService.addRole(request: RoleRequest, requester: AppUserWithPrivilegesRecord): App<ServiceError, ApiResponse.Created>`
  - `RoleService.updateRole(id: UUID, request: RoleRequest, requester: AppUserWithPrivilegesRecord): App<ServiceError, ApiResponse.NoData>`
  - `RoleService.page(params, requester): App<Nothing, ApiResponse.Page<RoleDto, RoleWithPrivilegesSort>>` mit `assignable` je Rolle
  - `RoleRequest(name, description, privileges, job: String?)` (`job` beim Anlegen Pflicht, beim Ändern ignoriert)
  - `RoleError.JobUnknown`, `RoleError.JobRequired`, `RoleError.PrivilegeUnknown(ids)`, `RoleError.PrivilegesBeyondOwn(ids)`, `RoleError.ScopeNotAllowedForLevel(level)`, `RoleError.SelfAssignment`
  - `ErrorCode.PRIVILEGES_BEYOND_OWN`, `ErrorCode.SELF_ASSIGNMENT`
  - `AppUserHasRoleRepo.getRoleIds(userId): JIO<List<UUID>>`, `AppUserHasRoleRepo.deleteManaged(userId)` (löscht alle außer `USER_ROLE` und `CLUB_REPRESENTATIVE_ROLE`)
  - `PrivilegeRepo.getByIds(ids: Collection<UUID>): JIO<List<PrivilegeRecord>>`
  - `RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(roleIds: Collection<UUID>): JIO<Map<UUID, List<PrivilegeRecord>>>`

- [ ] **Step 1: Test schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleAssignmentRulesTest.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.role.boundary.RoleService
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.app.role.entity.RoleError
import de.lambda9.ready2race.backend.app.role.entity.RoleRequest
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_WITH_PRIVILEGES
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Die drei Vergaberegeln aus dem Rechtekonzept (Spec 7.1):
 *  1. kein Teilmengen-Bruch, 2. nicht an sich selbst, 3. nach oben ist dicht.
 */
class RoleAssignmentRulesTest {

    private val now = LocalDateTime.of(2026, 9, 7, 11, 0)

    /** Konto mit genau diesen Privilegien über eine Wegwerf-Rolle; liefert den Privilegien-Datensatz. */
    private fun TestComprehensionScope<JEnv>.userWith(privileges: List<Privilege>): AppUserWithPrivilegesRecord {
        val roleId = UUID.randomUUID()
        !RoleRepo.create(
            RoleRecord(
                id = roleId, name = "Test $roleId", description = null, static = false,
                job = Job.Admin.key, level = "GLOBAL",
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        val all = !PrivilegeRepo.all()
        val ids = privileges.map { p -> all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }.id }
        !RoleHasPrivilegeRepo.create(ids.map { RoleHasPrivilegeRecord(role = roleId, privilege = it) })

        val userId = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = userId, email = "rules-$userId@example.org", firstname = "Regel", lastname = "Test",
                password = "x", language = EmailLanguage.DE.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        !AppUserHasRoleRepo.create(listOf(
            AppUserHasRoleRecord(appUser = userId, role = USER_ROLE),
            AppUserHasRoleRecord(appUser = userId, role = roleId),
        ))
        return assertNotNull(!Jooq.query { selectFrom(APP_USER_WITH_PRIVILEGES).where(APP_USER_WITH_PRIVILEGES.ID.eq(userId)).fetchOne() })
    }

    private fun staffPrivileges(vararg more: Privilege) = listOf(Privilege.UpdateStaffGlobal, Privilege.ReadRoleGlobal) + more

    @Test
    fun anAdminCannotAssignSuperadmin() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val target = userWith(emptyList())
        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(Job.Superadmin.roleId))) {
            RoleService.checkAssignable(admin, listOf(Job.Superadmin.roleId), target.id!!)
        }
    }

    @Test
    fun staffRightAloneAssignsOnlyRolesWithinOwnPrivileges() = testComprehension {
        val requester = userWith(staffPrivileges(*Job.Timekeeper.privileges.toTypedArray()))
        val target = userWith(emptyList())
        assertKIOSucceeds { RoleService.checkAssignable(requester, listOf(Job.Timekeeper.roleId), target.id!!) }
        assertKIOFails(RoleError.CannotAssignRoles(notFound = emptyList(), notAssignable = listOf(Job.Judge.roleId))) {
            RoleService.checkAssignable(requester, listOf(Job.Judge.roleId), target.id!!)
        }
    }

    @Test
    fun withoutStaffRightNothingIsAssignable() = testComprehension {
        val requester = userWith(Job.Timekeeper.privileges)
        val target = userWith(emptyList())
        assertKIOFails(AuthError.PrivilegeMissing) {
            RoleService.checkAssignable(requester, listOf(Job.Timekeeper.roleId), target.id!!)
        }
    }

    @Test
    fun nobodyAssignsToThemselves() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        assertKIOFails(RoleError.SelfAssignment) {
            RoleService.checkAssignable(admin, listOf(Job.Timekeeper.roleId), admin.id!!)
        }
    }

    @Test
    fun superadminAccountsAreClosedUpwards() = testComprehension {
        val admin = userWith(Job.Admin.privileges)
        val superadmin = userWith(Job.Superadmin.privileges)
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = superadmin.id!!, role = Job.Superadmin.roleId))
        assertKIOFails(AuthError.PrivilegeMissing) {
            RoleService.checkAssignable(admin, listOf(Job.Timekeeper.roleId), superadmin.id!!)
        }
        val boss = userWith(Job.Superadmin.privileges)
        assertKIOSucceeds { RoleService.checkAssignable(boss, listOf(Job.Timekeeper.roleId), superadmin.id!!) }
    }

    @Test
    fun staticJobsAreAssignable() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val target = userWith(emptyList())
        assertKIOSucceeds { RoleService.checkAssignable(boss, listOf(Job.Admin.roleId, Job.Judge.roleId), target.id!!) }
    }

    @Test
    fun aRoleIsCreatedOnlyAsCopyOfAJobAndWithinOwnPrivileges() = testComprehension {
        val requester = userWith(listOf(Privilege.CreateRoleGlobal) + Job.Timekeeper.privileges)
        val all = !PrivilegeRepo.all()
        val timing = all.first { it.resource == "APP_TIMING" }.id
        val system = all.first { it.resource == "SYSTEM" }.id

        assertKIOFails(RoleError.JobRequired) {
            RoleService.addRole(RoleRequest("Ohne Job", null, listOf(timing), null), requester)
        }
        assertKIOFails(RoleError.JobUnknown) {
            RoleService.addRole(RoleRequest("Falsch", null, listOf(timing), "GIBTS_NICHT"), requester)
        }
        assertKIOFails(RoleError.PrivilegesBeyondOwn(listOf(system))) {
            RoleService.addRole(RoleRequest("Zu viel", null, listOf(timing, system), Job.Timekeeper.key), requester)
        }

        val created = !RoleService.addRole(RoleRequest("Zeitnahme Kopie", null, listOf(timing), Job.Timekeeper.key), requester)
        val record = assertNotNull(!RoleRepo.get(created.id))
        assertEquals(Job.Timekeeper.key, record.job)
        assertEquals("EVENT", record.level)
        assertTrue(!record.static)
    }

    @Test
    fun aCopyOfASelfLevelJobAcceptsOnlyOwnScope() = testComprehension {
        val boss = userWith(Job.Superadmin.privileges)
        val all = !PrivilegeRepo.all()
        val global = all.first { it.resource == "USER" && it.action == "READ" && it.scope == "GLOBAL" }.id
        assertKIOFails(RoleError.ScopeNotAllowedForLevel(RoleLevel.SELF)) {
            RoleService.addRole(RoleRequest("Nutzer plus", null, listOf(global), Job.User.key), boss)
        }
    }
}
```

Die Fehler sind `data object` bzw. `data class`, deshalb reicht `assertKIOFails(expected)` mit Gleichheit. `RoleLevel` importieren (`de.lambda9.ready2race.backend.app.role.entity.RoleLevel`); die Imports `assertIs` und `Jooq` nur behalten, wenn sie gebraucht werden. `AuthError.PrivilegeMissing` muss ein `data object` sein; falls es ein einfaches `object` ist, funktioniert die Gleichheit ebenfalls (Singleton).

- [ ] **Step 2: Test laufen lassen, muss scheitern**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=RoleAssignmentRulesTest -DfailIfNoSpecifiedTests=false
```

Expected: FAIL (Kompilierfehler, `SelfAssignment`, neue Signaturen).

- [ ] **Step 3: Fehler, Codes, Request**

`ErrorCode.kt`: zwei Werte ergänzen, `PRIVILEGES_BEYOND_OWN` und `SELF_ASSIGNMENT` (Schreibweise der bestehenden Einträge übernehmen).

`RoleError.kt` ersetzen durch:

```kotlin
package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*
import java.util.*

sealed interface RoleError : ServiceError {

    data object Static : RoleError
    data object NotFound : RoleError
    data object JobRequired : RoleError
    data object JobUnknown : RoleError
    data object SelfAssignment : RoleError
    data class PrivilegeUnknown(val privileges: List<UUID>) : RoleError
    data class PrivilegesBeyondOwn(val privileges: List<UUID>) : RoleError
    data class ScopeNotAllowedForLevel(val level: RoleLevel) : RoleError
    data class CannotAssignRoles(val notFound: List<UUID>, val notAssignable: List<UUID>) : RoleError

    override fun respond(): ApiError = when (this) {
        NotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Role not found")
        Static -> ApiError(status = HttpStatusCode.Forbidden, message = "Role is static and cannot be changed")
        JobRequired -> ApiError(status = HttpStatusCode.BadRequest, message = "A role is created as copy of a job; job is required")
        JobUnknown -> ApiError(status = HttpStatusCode.BadRequest, message = "Unknown job")
        SelfAssignment -> ApiError(
            status = HttpStatusCode.Forbidden,
            message = "Nobody changes their own role assignments",
            errorCode = ErrorCode.SELF_ASSIGNMENT,
        )
        is PrivilegeUnknown -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Unknown privileges",
            details = mapOf("privileges" to privileges),
        )
        is PrivilegesBeyondOwn -> ApiError(
            status = HttpStatusCode.Forbidden,
            message = "Cannot grant privileges one does not hold",
            details = mapOf("privileges" to privileges),
            errorCode = ErrorCode.PRIVILEGES_BEYOND_OWN,
        )
        is ScopeNotAllowedForLevel -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Privilege scope does not fit role level ${level.name}",
        )
        is CannotAssignRoles -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Cannot assign some roles",
            details = listOfNotNull(
                notFound.takeIf { it.isNotEmpty() }?.let { "notFound" to it },
                notAssignable.takeIf { it.isNotEmpty() }?.let { "notAssignable" to it }
            ).toMap(),
            errorCode = ErrorCode.CANNOT_ASSIGN_ROLES,
        )
    }
}
```

`RoleRequest.kt`: Feld `val job: String? = null` hinter `privileges`; im `example` `job = "TIMEKEEPER"`. Validierung unverändert.

- [ ] **Step 4: Repos und Helfer**

`PrivilegeRepo.kt`:

```kotlin
    fun getByIds(ids: Collection<UUID>): JIO<List<PrivilegeRecord>> = Jooq.query {
        with(PRIVILEGE) {
            selectFrom(this).where(ID.`in`(ids)).fetch()
        }
    }
```

`RoleHasPrivilegeRepo.kt`:

```kotlin
    fun getPrivilegeRecordsByRoles(roleIds: Collection<UUID>): JIO<Map<UUID, List<PrivilegeRecord>>> = Jooq.query {
        select(ROLE_HAS_PRIVILEGE.ROLE, PRIVILEGE.asterisk())
            .from(ROLE_HAS_PRIVILEGE)
            .join(PRIVILEGE).on(PRIVILEGE.ID.eq(ROLE_HAS_PRIVILEGE.PRIVILEGE))
            .where(ROLE_HAS_PRIVILEGE.ROLE.`in`(roleIds))
            .fetchGroups({ it.get(ROLE_HAS_PRIVILEGE.ROLE)!! }, { it.into(PRIVILEGE) })
    }
```

`AppUserHasRoleRepo.kt`: `deleteExceptSystem` umbenennen in `deleteManaged` mit Doku, `getRoleIds` neu:

```kotlin
    /**
     * Entfernt alle Rollen, die die Rollenverwaltung vergibt. USER trägt jedes Konto,
     * CLUB_REPRESENTATIVE vergibt die Vereinsfreigabe; beide bleiben.
     */
    fun deleteManaged(userId: UUID) = APP_USER_HAS_ROLE.delete {
        DSL.and(
            APP_USER.eq(userId),
            ROLE.notIn(USER_ROLE, CLUB_REPRESENTATIVE_ROLE)
        )
    }

    fun getRoleIds(userId: UUID): JIO<List<UUID>> = Jooq.query {
        with(APP_USER_HAS_ROLE) {
            select(ROLE).from(this).where(APP_USER.eq(userId)).fetch { it.value1() }
        }
    }
```

`Extensions.kt` direkt unter `hasPrivilege`:

```kotlin
/** Deckt der Nutzer diesen Privileg-Datensatz ab (gleiche Aktion und Ressource, Scope mindestens so hoch)? */
fun AppUserWithPrivilegesRecord.covers(record: PrivilegeRecord): Boolean =
    privileges!!.any {
        it!!.action == record.action
            && it.resource == record.resource
            && Privilege.Scope.valueOf(it.scope).level >= Privilege.Scope.valueOf(record.scope).level
    }
```

- [ ] **Step 5: RoleService umbauen**

`RoleService.kt` komplett:

```kotlin
package de.lambda9.ready2race.backend.app.role.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.control.toDto
import de.lambda9.ready2race.backend.app.role.entity.*
import de.lambda9.ready2race.backend.calls.requests.covers
import de.lambda9.ready2race.backend.calls.requests.hasPrivilege
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.SUPERADMIN_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.PrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.failIf
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.*

object RoleService {

    /** Welche Scopes eine Rolle der jeweiligen Ebene tragen darf. */
    private fun scopesFor(level: RoleLevel): Set<Privilege.Scope> = when (level) {
        RoleLevel.SELF, RoleLevel.CLUB -> setOf(Privilege.Scope.OWN)
        RoleLevel.EVENT, RoleLevel.ORGANIZER -> setOf(Privilege.Scope.OWN, Privilege.Scope.GLOBAL) // GLOBAL nur bis Schritt 3
        RoleLevel.GLOBAL -> Privilege.Scope.entries.toSet()
    }

    /** Regel 1 für Rollendefinitionen: nur Privilegien vergeben, die man selbst deckt. */
    private fun resolvePrivileges(
        ids: List<UUID>,
        level: RoleLevel,
        requester: AppUserWithPrivilegesRecord,
    ): App<RoleError, List<PrivilegeRecord>> = KIO.comprehension {
        val records = !PrivilegeRepo.getByIds(ids).orDie()
        val unknown = ids.filter { id -> records.none { it.id == id } }
        !KIO.failOn(unknown.isNotEmpty()) { RoleError.PrivilegeUnknown(unknown) }

        val beyond = records.filter { !requester.covers(it) }.map { it.id }
        !KIO.failOn(beyond.isNotEmpty()) { RoleError.PrivilegesBeyondOwn(beyond) }

        val allowed = scopesFor(level)
        !KIO.failOn(records.any { Privilege.Scope.valueOf(it.scope) !in allowed }) { RoleError.ScopeNotAllowedForLevel(level) }

        KIO.ok(records)
    }

    fun addRole(
        request: RoleRequest,
        requester: AppUserWithPrivilegesRecord,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val jobKey = request.job ?: return@comprehension KIO.fail(RoleError.JobRequired)
        val job = Job.byKey(jobKey) ?: return@comprehension KIO.fail(RoleError.JobUnknown)
        val privileges = !resolvePrivileges(request.privileges, job.level, requester)

        val now = LocalDateTime.now()
        val roleId = !RoleRepo.create(
            RoleRecord(
                id = UUID.randomUUID(),
                name = request.name,
                description = request.description,
                static = false,
                job = job.key,
                level = job.level.name,
                createdAt = now,
                createdBy = requester.id!!,
                updatedAt = now,
                updatedBy = requester.id!!,
            )
        ).orDie()

        !RoleHasPrivilegeRepo.create(privileges.map { RoleHasPrivilegeRecord(role = roleId, privilege = it.id) }).orDie()

        KIO.ok(ApiResponse.Created(roleId))
    }

    fun page(
        params: PaginationParameters<RoleWithPrivilegesSort>,
        requester: AppUserWithPrivilegesRecord,
    ): App<Nothing, ApiResponse.Page<RoleDto, RoleWithPrivilegesSort>> = KIO.comprehension {
        val total = !RoleRepo.countWithPrivileges(params.search).orDie()
        val page = !RoleRepo.pageWithPrivileges(params).orDie()

        page.traverse { it.toDto(requester) }.map {
            ApiResponse.Page(data = it, pagination = params.toPagination(total))
        }
    }

    fun updateRole(
        id: UUID,
        request: RoleRequest,
        requester: AppUserWithPrivilegesRecord,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val record = !RoleRepo.get(id).orDie()
            .onNullFail { RoleError.NotFound }
            .failIf(condition = { it.static }) { RoleError.Static }
        val level = RoleLevel.valueOf(record.level)
        val privileges = !resolvePrivileges(request.privileges, level, requester)

        !RoleRepo.update(record) {
            name = request.name
            description = request.description
            updatedAt = LocalDateTime.now()
            updatedBy = requester.id!!
        }.orDie()

        !RoleHasPrivilegeRepo.deleteByRole(id).orDie()
        !RoleHasPrivilegeRepo.create(privileges.map { RoleHasPrivilegeRecord(role = id, privilege = it.id) }).orDie()

        noData
    }

    fun deleteRole(
        id: UUID,
    ): App<RoleError, ApiResponse.NoData> = KIO.comprehension {
        val record = !RoleRepo.get(id).orDie()
            .onNullFail { RoleError.NotFound }
            .failIf(condition = { it.static }) { RoleError.Static }
        record.delete()

        noData
    }

    /**
     * Die drei Vergaberegeln. [targetUserId] ist null bei Einladungen (das Konto gibt es noch nicht).
     *  1. Jede Rolle nur, wenn der Aufrufende all ihre Privilegien selbst deckt.
     *  2. Nicht an sich selbst.
     *  3. Konten mit Superadmin-Rolle nur, wenn der Aufrufende UPDATE SYSTEM trägt.
     */
    fun checkAssignable(
        requester: AppUserWithPrivilegesRecord,
        roles: List<UUID>,
        targetUserId: UUID?,
    ): App<ServiceError, Unit> = KIO.comprehension {
        !KIO.failOn(!requester.hasPrivilege(Privilege.UpdateStaffGlobal)) { AuthError.PrivilegeMissing }
        !KIO.failOn(targetUserId != null && targetUserId == requester.id) { RoleError.SelfAssignment }

        if (targetUserId != null) {
            val targetIsSuperadmin = !AppUserHasRoleRepo.exists(targetUserId, SUPERADMIN_ROLE).orDie()
            !KIO.failOn(targetIsSuperadmin && !requester.hasPrivilege(Privilege.UpdateSystemGlobal)) { AuthError.PrivilegeMissing }
        }

        if (roles.isEmpty()) {
            KIO.unit
        } else {
            val found = !RoleRepo.getIfExist(roles).orDie()
            val notFound = roles.filter { id -> found.none { it.id == id } }
            val privilegesByRole = !RoleHasPrivilegeRepo.getPrivilegeRecordsByRoles(found.map { it.id }).orDie()
            val notAssignable = found
                .filter { role -> (privilegesByRole[role.id] ?: emptyList()).any { !requester.covers(it) } }
                .map { it.id }

            if (notFound.isNotEmpty() || notAssignable.isNotEmpty()) {
                KIO.fail(RoleError.CannotAssignRoles(notFound, notAssignable))
            } else {
                KIO.unit
            }
        }
    }
}
```

`Conversions.kt` im Rollenmodul: `toDto()` bekommt den Aufrufenden, um `assignable` zu berechnen. `RoleDto` erweitern um `static: Boolean`, `job: String?`, `level: String`, `assignable: Boolean`:

```kotlin
fun RoleWithPrivilegesRecord.toDto(requester: AppUserWithPrivilegesRecord): App<Nothing, RoleDto> =
    privileges!!.toList().traverse { it!!.toPrivilegeDto() }.map { dtos ->
        RoleDto(
            id = id!!,
            name = name!!,
            description = description,
            static = static!!,
            job = job,
            level = level!!,
            assignable = privileges!!.all { requester.covers(it!!) },
            privileges = dtos,
        )
    }
```

Gleiches für `EveryRoleWithPrivilegesRecord.toDto(requester)`. Ob `RoleRepo.pageWithPrivileges` weiter aus `ROLE_WITH_PRIVILEGES` (nur nicht-statische) liest, ändert Task 5: die Rollenseite soll alle Rollen zeigen, also auf `EVERY_ROLE_WITH_PRIVILEGES` umstellen (auch `countWithPrivileges`, `searchFields`, und `RoleWithPrivilegesSort.toFields` auf `EVERY_ROLE_WITH_PRIVILEGES.NAME`). Das darf schon hier passieren.

`RoleRequest.toRecord` in `Conversions.kt` wird nicht mehr gebraucht und entfällt.

- [ ] **Step 6: Tests laufen lassen**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest='RoleAssignmentRulesTest,JobSeederTest' -DfailIfNoSpecifiedTests=false
```

Expected: PASS. Kompiliert das Projekt wegen der Aufrufer in `role.kt` und `AppUserService.kt` noch nicht, die Aufrufer minimal anpassen (Task 5 baut sie richtig um): `RoleService.addRole(body, user)`, `RoleService.page(params, user)`, `RoleService.updateRole(id, body, user)`, `RoleService.checkAssignable(user, roles, targetId)`; `AppUserHasRoleRepo.deleteExceptSystem` → `deleteManaged`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/kotlin backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RoleAssignmentRulesTest.kt
git commit -m "Rechte: Vergaberegeln (Teilmenge, nicht an sich selbst, nach oben dicht)"
```

---

### Task 5: Endpunkte, Nutzerverwaltung, Yaml

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/boundary/role.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/role/entity/JobDto.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/boundary/auth.kt` (`/privileges` → `ReadRoleGlobal`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/boundary/user.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/boundary/AppUserService.kt` (`update`, `invite`, `acceptInvitation`, `pageIncludingAdmins`-Verzweigung)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/appuser/entity/InviteRequest.kt` (`admin` entfällt)
- Modify: `backend/src/main/resources/openapi/documentation.yaml` (`RoleDto`, `RoleRequest`, `JobDto`, `/job`, `InviteRequest`)
- Modify: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/appuser/InvitationWithdrawAndResendTest.kt` (falls `admin` verwendet)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RolePrivilegeHttpIT.kt`

**Interfaces:**
- Consumes: `RoleService` aus Task 4, `Job` aus Task 3.
- Produces: `GET /job` → `List<JobDto(key, level, privileges: List<PrivilegeDto>)>`; `RoleDto` mit `static`, `job`, `level`, `assignable`; `RoleRequest.job`; `InviteRequest` ohne `admin`.

- [ ] **Step 1: HTTP-Test schreiben**

`backend/src/test/kotlin/de/lambda9/ready2race/backend/app/role/RolePrivilegeHttpIT.kt`. Die Hilfsfunktionen `seedUser` und `login` aus `BoardPrivilegeHttpIT` übernehmen (Kopie, gleiche Signaturen), dann:

```kotlin
    /** UPDATE USER GLOBAL ist kein Admin mehr: Rollen anlegen verlangt CREATE ROLE. */
    @Test
    fun updateUserAloneNoLongerCreatesRoles() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.UpdateUserGlobal, Privilege.ReadUserGlobal)), password)
        val response = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Schleicher","description":null,"privileges":[],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status, response.bodyAsText())
    }

    /** Mit CREATE ROLE geht es, aber nur innerhalb der eigenen Privilegien. */
    @Test
    fun createRoleStaysWithinOwnPrivileges() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.CreateRoleGlobal, Privilege.ReadRoleGlobal, Privilege.UpdateAppTimingGlobal)), password)
        val all = !PrivilegeRepo.all()
        val timing = all.first { it.resource == "APP_TIMING" }.id
        val system = all.first { it.resource == "SYSTEM" }.id

        val ok = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Zeitnahme Kopie","description":null,"privileges":["$timing"],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Created, ok.status, ok.bodyAsText())

        val beyond = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Schleicher","description":null,"privileges":["$timing","$system"],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, beyond.status, beyond.bodyAsText())
        assertTrue(beyond.bodyAsText().contains("PRIVILEGES_BEYOND_OWN"), beyond.bodyAsText())
    }

    /** Die Jobliste hängt am Leserecht für Rollen. */
    @Test
    fun jobsAreListedWithReadRole() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.ReadRoleGlobal)), password)
        val response = client.get("/api/job") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        assertTrue(response.bodyAsText().contains("\"TIMEKEEPER\""), response.bodyAsText())

        val refused = login(seedUser(password, listOf(Privilege.ReadUserGlobal)), password)
        val denied = client.get("/api/job") { header("X-Api-Session", refused) }
        assertEquals(HttpStatusCode.Forbidden, denied.status, denied.bodyAsText())
    }

    /** Die Rollenseite zeigt jetzt auch die Jobs und markiert, was der Aufrufende vergeben darf. */
    @Test
    fun rolePageListsJobsWithAssignableFlag() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.ReadRoleGlobal, Privilege.UpdateStaffGlobal, Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)), password)
        val response = client.get("/api/role?limit=100") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        val body = response.bodyAsText()
        assertTrue(body.contains("\"job\":\"TIMEKEEPER\""), body)
        assertTrue(body.contains("\"job\":\"SUPERADMIN\""), body)
        // Zeitnahme darf er vergeben, Superadmin nicht
        assertTrue(Regex("\"job\":\"TIMEKEEPER\"[^}]*\"assignable\":true").containsMatchIn(body) || Regex("\"assignable\":true[^}]*\"job\":\"TIMEKEEPER\"").containsMatchIn(body), body)
        assertTrue(Regex("\"job\":\"SUPERADMIN\"[^}]*\"assignable\":false").containsMatchIn(body) || Regex("\"assignable\":false[^}]*\"job\":\"SUPERADMIN\"").containsMatchIn(body), body)
    }

    /** Einladen in eine Rolle verlangt STAFF plus Teilmenge; das alte admin-Flag gibt es nicht mehr. */
    @Test
    fun invitationCarriesOnlyAssignableRoles() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.CreateUserGlobal, Privilege.UpdateStaffGlobal, Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)), password)
        val ok = client.post("/api/user/invitation") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"email":"zeit@example.org","firstname":"Zeit","lastname":"Nahme","language":"DE","roles":["${Job.Timekeeper.roleId}"],"callbackUrl":"http://localhost/invitation/"}""")
        }
        assertEquals(HttpStatusCode.NoContent, ok.status, ok.bodyAsText())

        val beyond = client.post("/api/user/invitation") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"email":"chef@example.org","firstname":"Chef","lastname":"Chef","language":"DE","roles":["${Job.Admin.roleId}"],"callbackUrl":"http://localhost/invitation/"}""")
        }
        assertEquals(HttpStatusCode.Conflict, beyond.status, beyond.bodyAsText())
    }

    /** Ein Admin sieht keine Superadmin-Konten, ein Superadmin schon. */
    @Test
    fun superadminAccountsAreHiddenFromAdmins() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val admin = login(seedUser(password, Job.Admin.privileges), password)
        val list = client.get("/api/user?limit=100") { header("X-Api-Session", admin) }
        assertEquals(HttpStatusCode.OK, list.status)
        assertFalse(list.bodyAsText().contains("\"email\":\"admin\""), list.bodyAsText())

        val boss = login("admin", "admin")
        val all = client.get("/api/user?limit=100") { header("X-Api-Session", boss) }
        assertTrue(all.bodyAsText().contains("\"email\":\"admin\""), all.bodyAsText())
    }
```

Der Systemnutzer heißt in Tests `admin` mit Passwort `admin` (siehe `BoardPrivilegeHttpIT`). Falls die Login-Antwort keinen `email`-Wert im Nutzerobjekt trägt, den Assert auf `firstname":"System` umstellen.

- [ ] **Step 2: Test laufen lassen, muss scheitern**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest=RolePrivilegeHttpIT -DfailIfNoSpecifiedTests=false
```

Expected: FAIL (403 statt 201 bei CreateRole, 404 bei `/job`, …).

- [ ] **Step 3: Endpunkte**

`role.kt`:

```kotlin
fun Route.role() {
    route("/role") {
        post {
            call.respondComprehension {
                val user = !authenticate(Privilege.CreateRoleGlobal)
                val body = !receiveKIO(RoleRequest.example)
                RoleService.addRole(body, user)
            }
        }

        get {
            call.respondComprehension {
                val user = !authenticate(Privilege.ReadRoleGlobal)
                val params = !pagination<RoleWithPrivilegesSort>()
                RoleService.page(params, user)
            }
        }

        route("/{roleId}") {
            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateRoleGlobal)
                    val id = !pathParam("roleId", uuid)
                    val body = !receiveKIO(RoleRequest.example)
                    RoleService.updateRole(id, body, user)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.DeleteRoleGlobal)
                    val id = !pathParam("roleId", uuid)
                    RoleService.deleteRole(id)
                }
            }
        }
    }

    route("/job") {
        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadRoleGlobal)
                RoleService.jobs()
            }
        }
    }
}
```

`JobDto.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.role.entity

import de.lambda9.ready2race.backend.app.auth.entity.PrivilegeDto

data class JobDto(
    val key: String,
    val level: String,
    val privileges: List<PrivilegeDto>,
)
```

In `RoleService`:

```kotlin
    fun jobs(): App<Nothing, ApiResponse.ListDto<JobDto>> = KIO.comprehension {
        val all = !PrivilegeRepo.all().orDie()
        val dtos = Job.entries.map { job ->
            JobDto(
                key = job.key,
                level = job.level.name,
                privileges = job.privileges.map { p ->
                    val record = all.first { it.action == p.action.name && it.resource == p.resource.name && it.scope == p.scope.name }
                    PrivilegeDto(id = record.id, action = record.action, resource = record.resource, scope = record.scope)
                },
            )
        }
        KIO.ok(ApiResponse.ListDto(dtos))
    }
```

Falls `ApiResponse.ListDto` anders heißt, in `calls/responses/ApiResponse.kt` nachsehen, wie `/privileges` in `auth.kt` seine Liste zurückgibt, und dasselbe verwenden.

`auth.kt`: `/privileges` prüft `Privilege.ReadRoleGlobal`.

`user.kt`:
- Liste `get`: `if (user.hasPrivilege(Privilege.UpdateSystemGlobal))` statt `user.id == SYSTEM_USER`.
- `get /{userId}`: die drei Zweige werden zu

```kotlin
                    if (scope == Privilege.Scope.OWN && user.id != id) {
                        KIO.fail(AuthError.PrivilegeMissing)
                    } else if (user.hasPrivilege(Privilege.UpdateSystemGlobal) || user.id == id) {
                        AppUserService.getIncludingAllAdmins(id)
                    } else {
                        AppUserService.get(id)
                    }
```

  Der `TODO`-Kommentar dazu entfällt; `AppUserService.get` liefert für ein Superadmin-Konto 404, was Regel 3 („nach oben ist dicht“) entspricht. Import `SYSTEM_USER` in `user.kt` entfernen, falls unbenutzt.

- [ ] **Step 4: AppUserService**

`update`:

```kotlin
    fun update(
        request: UpdateAppUserRequest,
        scope: Privilege.Scope,
        requester: AppUserWithPrivilegesRecord,
        targetUserId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val requestingUserId = requester.id!!
        val targetIsSuperadmin = !AppUserHasRoleRepo.exists(targetUserId, SUPERADMIN_ROLE).orDie()

        !KIO.failOn(
            scope == Privilege.Scope.OWN && requestingUserId != targetUserId
                || targetIsSuperadmin && requestingUserId != targetUserId && !requester.hasPrivilege(Privilege.UpdateSystemGlobal)
        ) { AuthError.PrivilegeMissing }

        !AppUserRepo.update(targetUserId) {
            firstname = request.firstname
            lastname = request.lastname
            updatedBy = requestingUserId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { AppUserError.NotFound }
            .map { ApiResponse.NoData }

        // Rollen nur anfassen, wenn sich die verwalteten Rollen ändern; sonst greift Regel 2
        // schon beim Ändern des eigenen Namens.
        val current = (!AppUserHasRoleRepo.getRoleIds(targetUserId).orDie())
            .filter { it != USER_ROLE && it != CLUB_REPRESENTATIVE_ROLE }
            .toSet()
        val wanted = request.roles.filter { it != USER_ROLE && it != CLUB_REPRESENTATIVE_ROLE }.toSet()

        if (wanted != current) {
            !RoleService.checkAssignable(requester, wanted.toList(), targetUserId)
            !AppUserHasRoleRepo.deleteManaged(targetUserId).orDie()
            !AppUserHasRoleRepo.create(wanted.map { AppUserHasRoleRecord(appUser = targetUserId, role = it) }).orDie()
        }

        noData
    }
```

Aufruf in `user.kt` anpassen: `AppUserService.update(body, scope, user, id)`.

`invite`: der `admin`-Zweig entfällt komplett:

```kotlin
        !RoleService.checkAssignable(inviter, request.roles, null)
        !AppUserInvitationHasRoleRepo.create(
            request.roles.map { AppUserInvitationHasRoleRecord(appUserInvitation = id, role = it) }
        ).orDie()
```

Achtung: `checkAssignable` verlangt `UpdateStaffGlobal`. Eine Einladung ohne Rollen (`roles = []`) soll weiterhin ohne STAFF möglich sein. Deshalb in `invite`: `if (request.roles.isNotEmpty()) { !RoleService.checkAssignable(inviter, request.roles, null) }`.

`acceptInvitation`: die Prüfung `if (invitation.createdBy?.id != SYSTEM_USER) { !RoleService.checkAssignable(roles) }` entfällt; die Rollen wurden beim Einladen geprüft. Rollen der Einladung werden unverändert zugewiesen.

`InviteRequest.kt`: Feld `admin` entfernen. `pageIncludingAdmins`/`page` bleiben, die Verzweigung liegt in `user.kt`.

- [ ] **Step 5: Yaml**

`RoleDto`: `required` um `static`, `level`, `assignable` ergänzen; Properties:

```yaml
        static:
          type: boolean
        job:
          type: string
        level:
          $ref: '#/components/schemas/RoleLevel'
        assignable:
          type: boolean
          description: Ob der angemeldete Nutzer diese Rolle vergeben darf (Teilmengenregel)
```

`RoleRequest`: Property `job: {type: string, description: Schlüssel des Jobs, dessen Kopie die Rolle ist. Beim Anlegen Pflicht, beim Ändern ignoriert.}`.

Neues Schema neben `Scope`:

```yaml
    RoleLevel:
      type: string
      enum:
        - SELF
        - CLUB
        - EVENT
        - ORGANIZER
        - GLOBAL

    JobDto:
      type: object
      required:
        - key
        - level
        - privileges
      properties:
        key:
          type: string
        level:
          $ref: '#/components/schemas/RoleLevel'
        privileges:
          type: array
          items:
            $ref: '#/components/schemas/PrivilegeDto'
```

Neuer Pfad hinter `/role/{roleId}`:

```yaml
  /job:
    get:
      operationId: getJobs
      responses:
        200:
          description: Alle im Code definierten Jobs
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/JobDto'
        401:
          $ref: '#/components/responses/401'
        403:
          $ref: '#/components/responses/403'
        500:
          $ref: '#/components/responses/500'
```

Die Antwortform (Array oder Objekt mit `data`) muss zu `ApiResponse.ListDto` passen; wie `/privileges` es macht, übernehmen.

`InviteRequest`: Property `admin` entfernen. `ErrorCode`-Enum in der Yaml (suchen nach `CANNOT_ASSIGN_ROLES`) um `PRIVILEGES_BEYOND_OWN` und `SELF_ASSIGNMENT` ergänzen.

```bash
cd frontend && npm run generate
```

- [ ] **Step 6: Tests laufen lassen**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest='RolePrivilegeHttpIT,RoleAssignmentRulesTest,JobSeederTest,BoardPrivilegeHttpIT,InvitationWithdrawAndResendTest' -DfailIfNoSpecifiedTests=false
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend frontend/src/api
git commit -m "Rechte: Rollen- und Job-Endpunkte, Einladung ohne Admin-Flag, Superadmin-Sicht"
```

---

### Task 6: Frontend-Verdrahtung, Nutzerseite, Einladung, i18n

**Files:**
- Modify: `frontend/src/routes.tsx` (Rollen-Route: `readRoleGlobal`)
- Modify: `frontend/src/components/sidebar/SidebarContent.tsx` (Rollen-Eintrag: `readRoleGlobal`)
- Modify: `frontend/src/components/user/RolesSelect.tsx` (nur `assignable`, Anzeigename je Job)
- Modify: `frontend/src/components/user/UserInvitationDialog.tsx` (Admin-Checkbox entfällt)
- Modify: `frontend/src/pages/user/UserPage.tsx` (Rollen editierbar ab `updateStaffGlobal`)
- Modify: `frontend/src/i18n/de/translations.json`, `frontend/src/i18n/en/translations.json`, `frontend/src/i18n/da/translations.json`
- Create: `frontend/src/authorization/roleLabels.ts`
- Test: `frontend/src/authorization/roleLabels.test.ts`

**Interfaces:**
- Consumes: `RoleDto.assignable`, `RoleDto.job`, Konstanten aus Task 2.
- Produces: `roleLabel(role: Pick<RoleDto,'name'|'job'|'static'>, t: TFunction): string` (statische Rollen zeigen den übersetzten Jobnamen, Kopien ihren eigenen Namen).

- [ ] **Step 1: Test für roleLabel**

`frontend/src/authorization/roleLabels.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {roleLabel} from './roleLabels'

const t = (key: string) => (key === 'job.TIMEKEEPER.name' ? 'Zeitnahme' : key)

describe('roleLabel', () => {
    it('zeigt bei statischen Rollen den übersetzten Jobnamen', () => {
        expect(roleLabel({name: 'Timekeeper', job: 'TIMEKEEPER', static: true}, t as never)).toBe('Zeitnahme')
    })
    it('zeigt bei Kopien den eigenen Namen', () => {
        expect(roleLabel({name: 'Zeitnahme Steg B', job: 'TIMEKEEPER', static: false}, t as never)).toBe('Zeitnahme Steg B')
    })
    it('fällt ohne Übersetzung auf den Datenbanknamen zurück', () => {
        expect(roleLabel({name: 'Admin', job: 'ADMIN', static: true}, t as never)).toBe('Admin')
    })
})
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

```bash
cd frontend && npx vitest run src/authorization/roleLabels.test.ts
```

Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: roleLabels.ts**

```ts
import {TFunction} from 'i18next'
import {RoleDto} from '@api/types.gen.ts'

/**
 * Statische Rollen sind Jobs und heißen in der Sprache des Nutzers; Kopien tragen den Namen,
 * den der Betreiber ihnen gegeben hat. Fehlt eine Übersetzung, bleibt der Datenbankname.
 */
export const roleLabel = (role: Pick<RoleDto, 'name' | 'job' | 'static'>, t: TFunction): string => {
    if (role.static && role.job) {
        const key = `job.${role.job}.name`
        const translated = t(key)
        return translated === key ? role.name : translated
    }
    return role.name
}
```

- [ ] **Step 4: Test laufen lassen**

Expected: PASS.

- [ ] **Step 5: Übersetzungen**

In allen drei `translations.json` den Block `role` erweitern und `job` sowie `privilege` neu anlegen. Deutsch:

```json
  "role": {
    "role": "Rolle",
    "roles": "Rollen",
    "userRoles": "Benutzerrollen",
    "name": "Name",
    "description": "Beschreibung",
    "rights": "Rechte",
    "job": "Job",
    "copyOf": "Kopie von",
    "static": "Vordefiniert",
    "level": {
      "label": "Ebene",
      "SELF": "Eigenes Konto",
      "CLUB": "Verein",
      "EVENT": "Veranstaltung",
      "ORGANIZER": "Veranstalter",
      "GLOBAL": "Gesamt"
    },
    "deviation": {
      "added": "Zusätzlich zum Job",
      "missing": "Fehlt gegenüber dem Job"
    },
    "notAssignable": "Diese Rolle enthält Rechte, die Sie selbst nicht haben.",
    "error": {
      "cannotAssign": "Rolle(n) konnte(n) dem Benutzer nicht zugewiesen werden",
      "privilegesBeyondOwn": "Sie können nur Rechte vergeben, die Sie selbst haben.",
      "selfAssignment": "Die eigenen Rollen kann niemand selbst ändern."
    }
  },
  "job": {
    "SUPERADMIN": {"name": "Superadmin", "description": "Betreibt die Installation. Einzige Rolle, die Superadmin-Konten sieht und vergibt."},
    "ADMIN": {"name": "Admin", "description": "Alles außer Superadmin-Konten."},
    "USER": {"name": "Nutzer", "description": "Eigenes Konto lesen und ändern. Trägt jedes Konto."},
    "CLUB_REPRESENTATIVE": {"name": "Vereinsvertreter", "description": "Eigenen Verein, eigene Meldungen, Rechnungen und Ergebnisse."},
    "COMPETITION_MANAGEMENT": {"name": "Wettkampfleitung", "description": "Veranstaltung, Wettkämpfe, Durchführung und Tagesteam."},
    "REGISTRATION_OFFICE": {"name": "Meldestelle", "description": "Meldungen prüfen und ummelden."},
    "FINANCE": {"name": "Kasse", "description": "Rechnungen und Bankkonten."},
    "JUDGE": {"name": "Schiedsrichter", "description": "Strafen, Klärung, Schiedsrichter-Dashboard."},
    "TIMEKEEPER": {"name": "Zeitnahme", "description": "Posten, Sequenzen und Zeitnahme-Anbindung."},
    "ANNOUNCER": {"name": "Sprecher", "description": "Anzeigetafeln und Sprecher-Dashboard."},
    "STREAM_DIRECTOR": {"name": "Regie", "description": "Livestream-Grafiken und Regie-Board."},
    "HELPER_REQUIREMENTS": {"name": "Helfer: Bedingungen", "description": "Bedingungen der Teilnehmenden prüfen."},
    "HELPER_ACCESS_PASS": {"name": "Helfer: Ausgabe", "description": "Bänder und QR-Codes ausgeben."},
    "HELPER_CHECK_IN": {"name": "Helfer: Check-in", "description": "Check-in, Check-out und Wettkampf-Check."},
    "HELPER_CATERING": {"name": "Helfer: Verpflegung", "description": "Verpflegung ausgeben."}
  },
  "privilege": {
    "action": {"CREATE": "Anlegen", "READ": "Lesen", "UPDATE": "Ändern", "DELETE": "Löschen"},
    "scope": {"OWN": "Eigene", "EVENT": "Veranstaltung", "GLOBAL": "Alle"},
    "resource": {
      "USER": "Konten", "EVENT": "Veranstaltungen", "CLUB": "Vereine", "REGISTRATION": "Meldungen",
      "INVOICE": "Rechnungen", "SUBSTITUTION": "Ummeldungen", "APP_EVENT_REQUIREMENT": "App: Bedingungen",
      "APP_QR_MANAGEMENT": "App: Bänder", "APP_COMPETITION_CHECK": "App: Wettkampf-Check",
      "APP_CATERER": "App: Verpflegung", "APP_TIMING": "App: Zeitnahme", "WEB_DAV": "WebDAV",
      "RESULT": "Ergebnisse", "LIVE_DASHBOARD": "Schiedsrichter-Dashboard", "BOARD": "Anzeigetafeln",
      "STREAM": "Livestream", "ADMINISTRATION": "Konfiguration", "ROLE": "Rollen", "STAFF": "Rollenvergabe",
      "SYSTEM": "Installation"
    }
  },
```

Englisch und Dänisch sinngemäß (Englisch: Superadmin/Admin/User/Club representative/Competition management/Registration office/Finance/Judge/Timekeeper/Announcer/Stream director/Helper: requirements/Helper: access passes/Helper: check-in/Helper: catering; Aktionen Create/Read/Update/Delete; Scopes Own/Event/All). Dänisch darf die englischen Texte übernehmen, wenn keine Übersetzung sicher ist.

- [ ] **Step 6: Routen, Sidebar, RolesSelect, Dialoge**

`routes.tsx`: `rolesIndexRoute.beforeLoad` prüft `readRoleGlobal` (Import ergänzen, `updateUserGlobal` bleibt für andere Stellen).

`SidebarContent.tsx`: der Rollen-Eintrag bekommt `privilege={readRoleGlobal}`; den Kommentar darüber anpassen: „Dasselbe Recht wie die Route (rolesIndexRoute).“

`RolesSelect.tsx`:

```tsx
import {RoleDto} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import FormInputMultiselect from '@components/form/input/FormInputMultiselect.tsx'
import {roleLabel} from '@authorization/roleLabels.ts'

type Props = {
    availableRoles?: Array<RoleDto>
}

/** Bietet nur Rollen an, die der Angemeldete vergeben darf (Teilmengenregel, vom Backend berechnet). */
const RolesSelect = (props: Props) => {
    const {t} = useTranslation()
    const options = (props.availableRoles ?? [])
        .filter(r => r.assignable && r.job !== 'USER')
        .map(r => ({id: r.id, label: roleLabel(r, t)}))
        .sort((a, b) => a.label.localeCompare(b.label))
    return (
        <FormInputMultiselect name={'roles'} label={t('role.roles')} options={options} showCheckbox showChips fullWidth />
    )
}

export default RolesSelect
```

Falls der Alias `@authorization` nicht existiert, relativen Import verwenden (siehe `tsconfig.json` / `vite.config.ts` für vorhandene Aliase).

`UserInvitationDialog.tsx`: `admin` aus Form, Defaults und Request entfernen; die Checkbox und `adminId`-Import entfernen; `RolesSelect` immer rendern. `onAddError`: zusätzlich `errorCode === 'PRIVILEGES_BEYOND_OWN'` → `feedback.error(t('role.error.privilegesBeyondOwn'))`. Falls `InviteUserError` durch die Generierung nun 403 ohne `errorCode` typisiert, mit `error.status.value === 403` und `'errorCode' in error` arbeiten.

`UserPage.tsx`: `user.checkPrivilege(updateUserGlobal)` an der Rollenauswahl wird `user.checkPrivilege(updateStaffGlobal)`; das gleiche Flag steuert `mapFormToRequest(formData, editRoles)`. Beim Speichern einen 403 mit `SELF_ASSIGNMENT` als `feedback.error(t('role.error.selfAssignment'))` melden, falls die Seite Fehlercodes auswertet (sonst reicht die generische Fehlermeldung). Die Rollen-Nur-Anzeige nutzt `roleLabel`.

- [ ] **Step 7: Bauen und Tests**

```bash
cd frontend && npm run build && npm run test
```

Expected: tsc ohne Fehler, vitest grün.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "Rechte: Rollenvergabe im Frontend über STAFF, Jobnamen übersetzt, Admin-Flag weg"
```

---

### Task 7: Rollendialog mit Job-Kopie und gruppierten Privilegien

**Files:**
- Create: `frontend/src/components/role/privilegeGroups.ts`
- Test: `frontend/src/components/role/privilegeGroups.test.ts`
- Modify: `frontend/src/components/role/RoleDialog.tsx`
- Modify: `frontend/src/components/role/RoleTable.tsx`

**Interfaces:**
- Consumes: `getJobs`, `getPrivileges`, `RoleDto`, `JobDto` aus der Generierung; Übersetzungen aus Task 6.
- Produces: `groupPrivileges(privileges: PrivilegeDto[]): Array<{resource: Resource, privileges: PrivilegeDto[]}>` (Gruppen alphabetisch nach übersetzbarem Ressourcenschlüssel, innerhalb nach Aktion CREATE, READ, UPDATE, DELETE, dann Scope OWN vor GLOBAL); `deviationOf(selected: string[], job: JobDto | undefined): {added: string[], missing: string[]}`.

- [ ] **Step 1: Test**

`frontend/src/components/role/privilegeGroups.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {deviationOf, groupPrivileges} from './privilegeGroups'
import {PrivilegeDto} from '@api/types.gen.ts'

const p = (id: string, action: PrivilegeDto['action'], resource: PrivilegeDto['resource'], scope: PrivilegeDto['scope']): PrivilegeDto => ({id, action, resource, scope})

describe('groupPrivileges', () => {
    it('gruppiert nach Ressource und ordnet Aktion vor Scope', () => {
        const groups = groupPrivileges([
            p('1', 'UPDATE', 'EVENT', 'GLOBAL'),
            p('2', 'READ', 'EVENT', 'GLOBAL'),
            p('3', 'READ', 'EVENT', 'OWN'),
            p('4', 'READ', 'CLUB', 'GLOBAL'),
        ])
        expect(groups.map(g => g.resource)).toEqual(['CLUB', 'EVENT'])
        expect(groups[1].privileges.map(x => x.id)).toEqual(['3', '2', '1'])
    })
})

describe('deviationOf', () => {
    it('liefert Zusätze und Lücken gegenüber dem Job', () => {
        const job = {key: 'TIMEKEEPER', level: 'EVENT' as const, privileges: [p('a', 'READ', 'EVENT', 'GLOBAL'), p('b', 'UPDATE', 'APP_TIMING', 'GLOBAL')]}
        expect(deviationOf(['a', 'c'], job)).toEqual({added: ['c'], missing: ['b']})
    })
    it('ist ohne Job leer', () => {
        expect(deviationOf(['a'], undefined)).toEqual({added: [], missing: []})
    })
})
```

- [ ] **Step 2: Test laufen lassen, muss scheitern**

```bash
cd frontend && npx vitest run src/components/role/privilegeGroups.test.ts
```

- [ ] **Step 3: privilegeGroups.ts**

```ts
import {JobDto, PrivilegeDto, Resource} from '@api/types.gen.ts'

const actionOrder: Record<PrivilegeDto['action'], number> = {CREATE: 0, READ: 1, UPDATE: 2, DELETE: 3}
const scopeOrder: Record<PrivilegeDto['scope'], number> = {OWN: 0, GLOBAL: 1}

export type PrivilegeGroup = {resource: Resource; privileges: PrivilegeDto[]}

/** Ressourcen alphabetisch, darin Aktion (Anlegen, Lesen, Ändern, Löschen) und dann Scope (Eigene vor Alle). */
export const groupPrivileges = (privileges: PrivilegeDto[]): PrivilegeGroup[] => {
    const byResource = new Map<Resource, PrivilegeDto[]>()
    for (const p of privileges) {
        byResource.set(p.resource, [...(byResource.get(p.resource) ?? []), p])
    }
    return [...byResource.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([resource, list]) => ({
            resource,
            privileges: [...list].sort(
                (a, b) => actionOrder[a.action] - actionOrder[b.action] || scopeOrder[a.scope] - scopeOrder[b.scope],
            ),
        }))
}

/** Was eine Rolle gegenüber ihrem Job zusätzlich hat und was ihr fehlt. */
export const deviationOf = (selected: string[], job: JobDto | undefined): {added: string[]; missing: string[]} => {
    if (!job) return {added: [], missing: []}
    const jobIds = new Set(job.privileges.map(p => p.id))
    const sel = new Set(selected)
    return {
        added: selected.filter(id => !jobIds.has(id)),
        missing: job.privileges.map(p => p.id).filter(id => !sel.has(id)),
    }
}
```

Falls der Typ `Scope` nach der Generierung `EVENT` schon enthält (erst in Schritt 3), `scopeOrder` entsprechend erweitern; der Compiler sagt es.

- [ ] **Step 4: Test laufen lassen**

Expected: PASS.

- [ ] **Step 5: RoleDialog**

Der Dialog bekommt drei Teile: Jobauswahl (nur beim Anlegen), Name und Beschreibung, gruppierte Privilegien mit Abweichungsanzeige.

```tsx
import EntityDialog from '@components/EntityDialog.tsx'
import {BaseEntityDialogProps} from '@utils/types.ts'
import {useForm} from 'react-hook-form-mui'
import {useCallback, useEffect, useMemo} from 'react'
import {Box, Checkbox, Chip, FormControlLabel, Stack, Typography} from '@mui/material'
import {FormInputText} from '@components/form/input/FormInputText.tsx'
import {takeIfNotEmpty} from '@utils/ApiUtils.ts'
import {addRole, getJobs, getPrivileges, updateRole} from '@api/sdk.gen.ts'
import {JobDto, RoleDto, RoleRequest} from '@api/types.gen.ts'
import {useTranslation} from 'react-i18next'
import {useFetch} from '@utils/hooks.ts'
import FormInputSelect from '@components/form/input/FormInputSelect.tsx'
import {deviationOf, groupPrivileges} from './privilegeGroups.ts'
import {useUser} from '@contexts/user/UserContext.ts'

type RoleForm = {
    name: string
    description: string
    job: string
    privileges: string[]
}

const defaultValues: RoleForm = {name: '', description: '', job: '', privileges: []}

const mapDtoToForm = (dto: RoleDto): RoleForm => ({
    name: dto.name,
    description: dto.description ?? '',
    job: dto.job ?? '',
    privileges: dto.privileges.map(p => p.id),
})

const mapFormToRequest = (formData: RoleForm): RoleRequest => ({
    name: formData.name,
    description: takeIfNotEmpty(formData.description),
    privileges: formData.privileges,
    job: formData.job,
})

const addAction = (formData: RoleForm) => addRole({body: mapFormToRequest(formData)})
const editAction = (formData: RoleForm, entity: RoleDto) =>
    updateRole({path: {roleId: entity.id}, body: mapFormToRequest(formData)})

const RoleDialog = (props: BaseEntityDialogProps<RoleDto>) => {
    const {t} = useTranslation()
    const user = useUser()
    const formContext = useForm<RoleForm>()

    const onOpen = useCallback(() => {
        formContext.reset(props.entity ? mapDtoToForm(props.entity) : defaultValues)
    }, [props.entity])

    const {data: privileges} = useFetch(signal => getPrivileges({signal}))
    const {data: jobs} = useFetch(signal => getJobs({signal}))

    const jobKey = formContext.watch('job')
    const selected = formContext.watch('privileges') ?? []
    const job: JobDto | undefined = useMemo(() => jobs?.find(j => j.key === jobKey), [jobs, jobKey])

    // Beim Anlegen: Jobwechsel setzt die Privilegien auf den Job zurück.
    useEffect(() => {
        if (!props.entity && job) {
            formContext.setValue('privileges', job.privileges.map(p => p.id), {shouldDirty: true})
        }
    }, [job?.key, props.entity])

    const groups = useMemo(() => groupPrivileges(privileges ?? []), [privileges])
    const deviation = useMemo(() => deviationOf(selected, job), [selected, job])

    const toggle = (id: string) => {
        const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
        formContext.setValue('privileges', next, {shouldDirty: true})
    }

    // Was der Angemeldete selbst nicht deckt, kann er auch nicht vergeben (Backend prüft ebenfalls).
    const coveredByMe = (p: {action: string; resource: string; scope: string}) =>
        'checkPrivilege' in user && user.checkPrivilege(p as never)

    return (
        <EntityDialog {...props} formContext={formContext} onOpen={onOpen} addAction={addAction} editAction={editAction}>
            <Stack spacing={4}>
                {!props.entity ? (
                    <FormInputSelect
                        name={'job'}
                        label={t('role.copyOf')}
                        required
                        options={(jobs ?? []).map(j => ({id: j.key, label: t(`job.${j.key}.name`)}))}
                    />
                ) : (
                    <Typography variant={'body2'}>
                        {t('role.copyOf')}: {props.entity.job ? t(`job.${props.entity.job}.name`) : '–'}
                    </Typography>
                )}
                <FormInputText name={'name'} label={t('role.name')} required />
                <FormInputText name={'description'} label={t('role.description')} />
                <Box>
                    <Typography variant={'subtitle1'}>{t('role.rights')}</Typography>
                    {groups.map(group => (
                        <Box key={group.resource} sx={{mt: 2}}>
                            <Typography variant={'subtitle2'}>{t(`privilege.resource.${group.resource}`)}</Typography>
                            <Stack direction={'row'} flexWrap={'wrap'}>
                                {group.privileges.map(p => {
                                    const checked = selected.includes(p.id)
                                    const added = deviation.added.includes(p.id)
                                    const missing = deviation.missing.includes(p.id)
                                    return (
                                        <Stack key={p.id} direction={'row'} alignItems={'center'} sx={{mr: 2}}>
                                            <FormControlLabel
                                                control={<Checkbox checked={checked} disabled={!coveredByMe(p)} onChange={() => toggle(p.id)} />}
                                                label={`${t(`privilege.action.${p.action}`)} · ${t(`privilege.scope.${p.scope}`)}`}
                                            />
                                            {added && <Chip size={'small'} color={'info'} label={t('role.deviation.added')} />}
                                            {missing && <Chip size={'small'} color={'warning'} label={t('role.deviation.missing')} />}
                                        </Stack>
                                    )
                                })}
                            </Stack>
                        </Box>
                    ))}
                </Box>
            </Stack>
        </EntityDialog>
    )
}

export default RoleDialog
```

Prüfen, wie `FormInputSelect` seine Optionen erwartet (Datei lesen) und die Prop-Namen anpassen. `getJobs` liefert je nach Yaml ein Array oder `{data: [...]}`; entsprechend `jobs?.data` verwenden.

- [ ] **Step 6: RoleTable**

Spalten: Name (über `roleLabel`), Job (`t('job.<key>.name')`, leer bei Rollen ohne Job → `t('role.copyOf')`-Spalte zeigt „–“), Ebene (`t('role.level.<level>')`), Beschreibung. `editableIf={r => !r.static}` und `parentResource={'ROLE'}`. Für statische Rollen kein Löschen: falls `EntityTable` dafür keine Option hat, `deleteRequest` beibehalten (Backend antwortet 403) und in `customEntityActions` nichts ändern; ein Hinweis-Chip `t('role.static')` in der Namensspalte reicht.

- [ ] **Step 7: Bauen, Tests, Sichtprüfung**

```bash
cd frontend && npm run build && npm run test
```

Expected: grün. Dann Backend bauen und starten (siehe `.claude/launch.json`, Konfiguration `backend` zeigt auf das Hauptverzeichnis; für diesen Worktree ein Jar mit `./mvnw -o -q package -DskipTests -Ddatabase.url=…` bauen und mit eigenem `HTTP_PORT` starten, Frontend mit `VITE_API_BASE_URL` darauf). Als `admin` anmelden, Rollenseite öffnen: Jobs sichtbar, Dialog gruppiert, Kopie von „Zeitnahme“ anlegen, Abweichungs-Chips prüfen. Screenshot ablegen.

- [ ] **Step 8: Commit**

```bash
git add frontend
git commit -m "Rechte: Rollendialog als Kopie eines Jobs mit gruppierten, übersetzten Rechten"
```

---

### Task 8: Gesamtlauf, Doku, Handtest-Katalog

**Files:**
- Create: `docs/rechte.md`
- Modify: `docs/superpowers/specs/2026-09-07-rechtekonzept-design.md` (Abschnitt 10.2, Schritt 1 als erledigt markieren mit Commit-Hash)

- [ ] **Step 1: Backend komplett**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q clean test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build
```

Expected: alle `*Test` grün. Dann die IT-Klassen gezielt:

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./mvnw -o -q test -Ddatabase.url=jdbc:postgresql://localhost:7770/ready2race-build -Dtest='*PrivilegeHttpIT' -DfailIfNoSpecifiedTests=false
```

- [ ] **Step 2: Frontend komplett**

```bash
cd frontend && npm run lint && npm run build && npm run test
```

- [ ] **Step 3: docs/rechte.md**

```markdown
# Rechte in ready2race

Ein Privileg ist ein Tripel aus Aktion (CREATE, READ, UPDATE, DELETE), Ressource und Scope
(OWN, GLOBAL; EVENT folgt). Rollen bündeln Privilegien. Jobs sind im Code definierte Rollen
(`backend/.../app/role/entity/Job.kt`); sie werden beim Start als statische Rollen gesät und
synchronisiert. Eigene Rollen entstehen als Kopie eines Jobs und bekommen neue Job-Privilegien
nachgetragen, behalten aber ihre Abweichungen.

## Vergaberegeln

1. Rollen anlegen, ändern und zuweisen kann nur, wer jedes ihrer Privilegien selbst hat.
2. Niemand ändert die eigenen Rollenzuweisungen.
3. Konten mit Superadmin-Rolle sieht und ändert nur, wer `UPDATE SYSTEM GLOBAL` trägt.

Rollen verwalten: `ROLE`. Rollen zuweisen: `STAFF`. `UPDATE USER GLOBAL` bearbeitet nur Kontodaten.

## Ein neues Privileg

1. `Privilege.kt`: Ressource und `data object`.
2. `Job.kt`: dem passenden Job hinzufügen. Beim nächsten Start bekommen es die statische Rolle und alle Kopien.
3. `documentation.yaml`: `Resource`-Enum ergänzen, `npm run generate`, Konstante in `privileges.ts`.
4. Übersetzung `privilege.resource.<NAME>` in de/en/da.

Keine Migration nötig. Vollständiges Konzept: `docs/superpowers/specs/2026-09-07-rechtekonzept-design.md`.

## Handtests Schritt 1

- H1 Als `admin` (Superadmin) Rollenseite öffnen: alle Jobs sichtbar, als „Vordefiniert“ markiert, nicht editierbar.
- H2 Kopie von „Zeitnahme“ anlegen, ein Recht dazu, eines weg: Chips „Zusätzlich“ und „Fehlt“ erscheinen. Speichern, neu öffnen: Chips bleiben.
- H3 Nutzer mit Job „Admin“ einladen, als dieser anmelden: Rollenseite zeigt Superadmin als nicht vergebbar; Nutzerliste zeigt den Systemnutzer nicht.
- H4 Als Admin versuchen, sich selbst eine Rolle zu geben: Fehlermeldung „Die eigenen Rollen kann niemand selbst ändern.“
- H5 Nutzer mit `UPDATE USER GLOBAL` (Kopie von Admin, nur USER-Rechte): Rollenseite nicht im Menü, `/roles` liefert 403, Rollen im Nutzerdialog nur lesbar.
- H6 Backend neu starten mit einer Kopie von „Schiedsrichter“, der ein Job-Privileg fehlt: nach dem Start ist es wieder da.
```

- [ ] **Step 4: Spec-Vermerk und Commit**

Im Spec unter 10.2 hinter „1. **Jobs, ROLE, STAFF, Vergaberegeln, Superadmin.**“ den Zusatz „(umgesetzt am 2026-09-07, Plan `docs/superpowers/plans/2026-09-07-rechtekonzept-schritt-1.md`)“.

```bash
git add docs
git commit -m "Rechte: Doku und Handtest-Katalog für Schritt 1"
```
