# Timing Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend foundation for the race timing module: timing stations, append-only time marks, assignments, clock-sync endpoint, and WebSocket fanout — per spec `docs/superpowers/specs/2026-08-17-timing-module-design.md`.

**Architecture:** New Ktor domain module `app/timing` following the established boundary/control/entity pattern (KIO comprehensions, JOOQ records, Flyway). Writes go through REST; an in-memory per-event broadcaster pushes change messages over a WebSocket channel. Time marks are an append-only log (client-generated UUIDs for idempotency); assignments are a separate mutable mapping.

**Tech Stack:** Kotlin, Ktor 3.1.1 (+ `ktor-server-websockets-jvm`, new), JOOQ, Flyway, PostgreSQL, tailwind KIO (`de.lambda9.tailwind`), kotlin-test + Testcontainers.

## Global Constraints

- Backend module layout: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/<module>/{boundary,control,entity}` — exactly like `app/eventDay`.
- All service functions return `App<E, ApiResponse...>` KIO values; routes use `call.respondComprehension { ... }` (see `app/eventDay/boundary/eventDay.kt`).
- Flyway migration naming: `V<yyyyMMddHHmm>__<snake_name>.sql` in `backend/src/main/resources/db/migration/`. Schema is `ready2race`.
- After adding a migration, JOOQ classes MUST be regenerated: `cd backend && docker compose up -d && ./mvnw jooq:generate` — generated classes land in `backend/target/generated-sources/jooq` (package `de.lambda9.ready2race.backend.database.generated.*`); they are build output and are NOT committed.
- DB-backed tests use `testComprehension { ... }` from `backend/src/test/kotlin/de/lambda9/ready2race/testing/testing.kt` (Testcontainers Postgres); run with `cd backend && ./mvnw test -Dtest=<ClassName>`.
- Time marks are NEVER updated or hard-deleted in this plan; retract = status change.
- Git: commit after every green test cycle. Commit messages in English, imperative. NEVER mention Claude/AI in commits.
- Docker must be running for JOOQ generation and tests.

---

### Task 1: Database migration + JOOQ generation

**Files:**
- Create: `backend/src/main/resources/db/migration/V202608171400__timing_module.sql`

**Interfaces:**
- Produces: tables `timing_station`, `timing_time_mark`, `timing_assignment`; JOOQ records `TimingStationRecord`, `TimingTimeMarkRecord`, `TimingAssignmentRecord` and table references `TIMING_STATION`, `TIMING_TIME_MARK`, `TIMING_ASSIGNMENT` (used by all later tasks).

- [ ] **Step 1: Write the migration**

```sql
create table if not exists timing_station
(
    id         uuid primary key,
    event      uuid      not null references event on delete cascade,
    name       text      not null,
    type       text      not null check (type in ('START', 'SPLIT', 'FINISH')),
    sorting    int       not null,
    created_at timestamp not null,
    created_by uuid references app_user on delete set null,
    updated_at timestamp not null,
    updated_by uuid references app_user on delete set null,
    unique (event, name)
);

create table if not exists timing_time_mark
(
    id               uuid primary key,
    event            uuid      not null references event on delete cascade,
    station          uuid      not null references timing_station on delete restrict,
    timestamp_millis bigint    not null,
    source           text      not null default 'APP_USER' check (source in ('APP_USER', 'HARDWARE')),
    status           text      not null default 'ACTIVE' check (status in ('ACTIVE', 'RETRACTED')),
    created_at       timestamp not null,
    created_by       uuid references app_user on delete set null
);

create index if not exists idx_timing_time_mark_event on timing_time_mark (event);
create index if not exists idx_timing_time_mark_station on timing_time_mark (station);

create table if not exists timing_assignment
(
    id                     uuid primary key,
    time_mark              uuid      not null unique references timing_time_mark on delete cascade,
    competition_match_team uuid      not null references competition_match_team on delete cascade,
    created_at             timestamp not null,
    created_by             uuid references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid references app_user on delete set null
);

create index if not exists idx_timing_assignment_team on timing_assignment (competition_match_team);
```

Notes:
- `timing_time_mark.station` uses `on delete restrict`: stations with captured marks cannot be deleted (spec: no timestamp is ever lost); the service layer returns a domain error instead.
- `timing_assignment.time_mark` is `unique`: one assignment per mark; re-assigning updates the row.

- [ ] **Step 2: Regenerate JOOQ classes and compile**

Run:
```bash
cd backend && docker compose up -d && ./mvnw jooq:generate -q && ./mvnw compile -q
```
Expected: BUILD SUCCESS; generated sources now contain `TimingStationRecord`, `TimingTimeMarkRecord`, `TimingAssignmentRecord`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V202608171400__timing_module.sql
git commit -m "Add timing module tables"
```

---

### Task 2: APP_TIMING privilege

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt`

**Interfaces:**
- Produces: `Privilege.Resource.APP_TIMING`, `Privilege.UpdateAppTimingGlobal` (used by all timing routes for timekeeper access).

- [ ] **Step 1: Add resource and privilege object**

In the `Resource` enum, after `APP_CATERER`:

```kotlin
        APP_TIMING,
```

Next to the other app privileges (after `UpdateAppCatererGlobal`):

```kotlin
    data object UpdateAppTimingGlobal : Privilege(Action.UPDATE, Resource.APP_TIMING, Scope.GLOBAL)
```

Check the bottom of the file: if there is a companion `entries`/list that enumerates all privileges explicitly, add `UpdateAppTimingGlobal` there too (grep for `UpdateAppCatererGlobal` to find every enumeration site — `initializeDatabase.kt` seeds from `Privilege.entries`, verify it picks the new object up automatically).

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/auth/entity/Privilege.kt
git commit -m "Add APP_TIMING privilege"
```

---

### Task 3: Entity layer (DTOs, requests, errors)

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingStationType.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingStationRequest.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingStationDto.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/CreateTimeMarkRequest.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimeMarkDto.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/AssignTimeMarkRequest.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingStateDto.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingError.kt`

**Interfaces:**
- Produces (exact signatures used by Tasks 4–7):
  - `enum class TimingStationType { START, SPLIT, FINISH }`
  - `data class TimingStationRequest(val name: String, val type: TimingStationType, val sorting: Int) : Validatable`
  - `data class TimingStationDto(val id: UUID, val event: UUID, val name: String, val type: TimingStationType, val sorting: Int)`
  - `data class CreateTimeMarkRequest(val id: UUID, val station: UUID, val timestampMillis: Long) : Validatable`
  - `data class TimeMarkDto(val id: UUID, val event: UUID, val station: UUID, val timestampMillis: Long, val source: String, val status: String, val createdBy: UUID?, val assignedTeam: UUID?)`
  - `data class AssignTimeMarkRequest(val competitionMatchTeam: UUID?) : Validatable` (null = detach)
  - `data class TimingStateDto(val stations: List<TimingStationDto>, val timeMarks: List<TimeMarkDto>)`
  - `sealed interface TimingError : ServiceError` with objects `StationNotFound`, `StationHasTimeMarks`, `TimeMarkNotFound`, `EventMismatch`

- [ ] **Step 1: Write the entity files**

`TimingStationType.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

enum class TimingStationType { START, SPLIT, FINISH }
```

`TimingStationRequest.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

data class TimingStationRequest(
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example get() = TimingStationRequest(
            name = "Finish",
            type = TimingStationType.FINISH,
            sorting = 0,
        )
    }
}
```

`TimingStationDto.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingStationDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
)
```

`CreateTimeMarkRequest.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

data class CreateTimeMarkRequest(
    val id: UUID,
    val station: UUID,
    val timestampMillis: Long,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = CreateTimeMarkRequest(
            id = UUID.randomUUID(),
            station = UUID.randomUUID(),
            timestampMillis = 1755430000000,
        )
    }
}
```

`TimeMarkDto.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimeMarkDto(
    val id: UUID,
    val event: UUID,
    val station: UUID,
    val timestampMillis: Long,
    val source: String,
    val status: String,
    val createdBy: UUID?,
    val assignedTeam: UUID?,
)
```

`AssignTimeMarkRequest.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

data class AssignTimeMarkRequest(
    val competitionMatchTeam: UUID?,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.Valid

    companion object {
        val example get() = AssignTimeMarkRequest(
            competitionMatchTeam = UUID.randomUUID(),
        )
    }
}
```

`TimingStateDto.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

data class TimingStateDto(
    val stations: List<TimingStationDto>,
    val timeMarks: List<TimeMarkDto>,
)
```

`TimingError.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.*

sealed interface TimingError : ServiceError {
    data object StationNotFound : TimingError
    data object StationHasTimeMarks : TimingError
    data object TimeMarkNotFound : TimingError
    data object EventMismatch : TimingError

    override fun respond(): ApiError = when (this) {
        StationNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing station not found")
        StationHasTimeMarks -> ApiError(
            HttpStatusCode.Conflict,
            message = "Timing station has captured time marks and cannot be deleted"
        )
        TimeMarkNotFound -> ApiError(HttpStatusCode.NotFound, message = "Time mark not found")
        EventMismatch -> ApiError(HttpStatusCode.BadRequest, message = "Resource does not belong to this event")
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity
git commit -m "Add timing entity layer"
```

---

### Task 4: Control layer (repos + conversions)

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/control/TimingStationRepo.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/control/TimingTimeMarkRepo.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/control/TimingAssignmentRepo.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/control/Conversions.kt`

**Interfaces:**
- Consumes: JOOQ records/references from Task 1, entities from Task 3.
- Produces (used by Task 5–7 services):
  - `TimingStationRepo.create(record): JIO<UUID>`, `.getByEvent(eventId): JIO<List<TimingStationRecord>>`, `.get(id): JIO<TimingStationRecord?>`, `.update(id, f): JIO<TimingStationRecord?>`, `.delete(id): JIO<Int>`
  - `TimingTimeMarkRepo.create(record): JIO<UUID>`, `.get(id): JIO<TimingTimeMarkRecord?>`, `.exists(id): JIO<Boolean>`, `.getByEvent(eventId): JIO<List<TimingTimeMarkRecord>>`, `.existsByStation(stationId): JIO<Boolean>`, `.update(id, f): JIO<TimingTimeMarkRecord?>`
  - `TimingAssignmentRepo.upsertForTimeMark(...)`, `.deleteByTimeMark(timeMarkId): JIO<Int>`, `.getByTimeMarks(ids): JIO<List<TimingAssignmentRecord>>`
  - `Conversions`: `TimingStationRecord.toDto(): App<Nothing, TimingStationDto>`, `TimingStationRequest.toRecord(userId, eventId): App<Nothing, TimingStationRecord>`, `fun timeMarkDto(record, assignedTeam): TimeMarkDto`

- [ ] **Step 1: Write the repos**

Before writing, open `backend/src/main/kotlin/de/lambda9/ready2race/backend/database/Extensions.kt` and `app/eventDay/control/EventDayRepo.kt` to mirror the exact helper usage (`insertReturning`, `update`, `delete`, `select`, `exists` — use whatever helpers exist there; the snippets below assume the same helpers used by `TimecodeRepo` and `EventDayRepo`).

`TimingStationRepo.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import java.util.UUID

object TimingStationRepo {

    fun create(record: TimingStationRecord) = TIMING_STATION.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_STATION.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_STATION.select { EVENT.eq(eventId) }

    fun update(id: UUID, f: TimingStationRecord.() -> Unit) = TIMING_STATION.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_STATION.delete { ID.eq(id) }
}
```

`TimingTimeMarkRepo.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TIME_MARK
import java.util.UUID

object TimingTimeMarkRepo {

    fun create(record: TimingTimeMarkRecord) = TIMING_TIME_MARK.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_TIME_MARK.selectOne { ID.eq(id) }

    fun exists(id: UUID) = TIMING_TIME_MARK.exists { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_TIME_MARK.select { EVENT.eq(eventId) }

    fun existsByStation(stationId: UUID) = TIMING_TIME_MARK.exists { STATION.eq(stationId) }

    fun update(id: UUID, f: TimingTimeMarkRecord.() -> Unit) = TIMING_TIME_MARK.update(f) { ID.eq(id) }
}
```

`TimingAssignmentRepo.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import java.util.UUID

object TimingAssignmentRepo {

    fun create(record: TimingAssignmentRecord) = TIMING_ASSIGNMENT.insertReturning(record) { ID }

    fun getByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.selectOne { TIME_MARK.eq(timeMarkId) }

    fun getByTimeMarks(ids: List<UUID>) = TIMING_ASSIGNMENT.select { TIME_MARK.`in`(ids) }

    fun update(id: UUID, f: TimingAssignmentRecord.() -> Unit) = TIMING_ASSIGNMENT.update(f) { ID.eq(id) }

    fun deleteByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.delete { TIME_MARK.eq(timeMarkId) }
}
```

If `selectOne`/`select`/`exists` helpers have different names in `database/Extensions.kt`, adapt to the actual helper names — the repos must compile against the existing helpers, not introduce new ones.

`Conversions.kt`:
```kotlin
package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.App
import java.time.LocalDateTime
import java.util.UUID

fun TimingStationRecord.toDto(): App<Nothing, TimingStationDto> = KIO.ok(
    TimingStationDto(
        id = id!!,
        event = event,
        name = name,
        type = TimingStationType.valueOf(type),
        sorting = sorting,
    )
)

fun TimingStationRequest.toRecord(userId: UUID, eventId: UUID): App<Nothing, TimingStationRecord> = KIO.ok(
    LocalDateTime.now().let { now ->
        TimingStationRecord(
            id = UUID.randomUUID(),
            event = eventId,
            name = name,
            type = type.name,
            sorting = sorting,
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    }
)

fun timeMarkDto(record: TimingTimeMarkRecord, assignedTeam: UUID?): TimeMarkDto = TimeMarkDto(
    id = record.id!!,
    event = record.event,
    station = record.station,
    timestampMillis = record.timestampMillis,
    source = record.source,
    status = record.status,
    createdBy = record.createdBy,
    assignedTeam = assignedTeam,
)
```

Check the actual `App` type import used in `app/eventDay/control/Conversions.kt` (it may be `de.lambda9.ready2race.backend.app.App`) and mirror it exactly; also mirror nullability of generated record fields (adjust `!!`/`?` to what the generated code requires).

- [ ] **Step 2: Compile**

Run: `cd backend && ./mvnw compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/control
git commit -m "Add timing control layer"
```

---

### Task 5: Station service + routes

**Files:**
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingService.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/timing.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/event/boundary/event.kt` (add `timing()` inside `route("/{eventId}")`, next to `eventDay()` at line ~85)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingServiceTest.kt`

**Interfaces:**
- Consumes: Task 3 entities, Task 4 repos/conversions, `Privilege.UpdateEventGlobal` / `Privilege.UpdateAppTimingGlobal` (Task 2).
- Produces:
  - `TimingService.addStation(request: TimingStationRequest, userId: UUID, eventId: UUID): App<ServiceError, ApiResponse.Created>`
  - `TimingService.getStations(eventId: UUID): App<ServiceError, ApiResponse.ListDto<TimingStationDto>>` (check `ApiResponse` for the actual list wrapper; `eventInfo`/`results` modules show the convention — use the same)
  - `TimingService.updateStation(request, userId, stationId): App<TimingError, ApiResponse.NoData>`
  - `TimingService.deleteStation(stationId): App<TimingError, ApiResponse.NoData>`
  - Route prefix: `/api/event/{eventId}/timing/stations`

- [ ] **Step 1: Write the test fixtures and the failing service test**

There are no event/user fixtures in the test tree yet (`TestExamples.kt` only exercises `EmailRepo`). Create `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingTestFixtures.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

// Insert a minimal event + app user directly via repos and return their ids.
// IMPORTANT: field lists below must match the generated EventRecord/AppUserRecord —
// open the generated record classes and fill ALL non-null columns (adjust as needed).
fun createTestEventWithAdmin(): App<Any?, Pair<UUID, UUID>> = KIO.comprehension {
    val now = LocalDateTime.now()
    val userId = UUID.randomUUID()
    !AppUserRepo.create(
        de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord(
            id = userId,
            email = "timing-test-${UUID.randomUUID()}@example.com",
            firstname = "Timing",
            lastname = "Tester",
            password = "irrelevant",
            language = "de",
            createdAt = now,
            updatedAt = now,
        )
    ).orDie()

    val eventId = UUID.randomUUID()
    !EventRepo.create(
        de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord(
            id = eventId,
            name = "Timing Test Event",
            createdAt = now,
            createdBy = userId,
            updatedAt = now,
            updatedBy = userId,
        )
    ).orDie()

    KIO.ok(eventId to userId)
}

fun addTestStation(eventId: UUID, userId: UUID): App<Any?, UUID> = KIO.comprehension {
    val response = !TimingService.addStation(
        TimingStationRequest(name = "Station-${UUID.randomUUID()}", type = TimingStationType.FINISH, sorting = 0),
        userId,
        eventId,
    )
    KIO.ok((response as ApiResponse.Created).id)
}
```

(Check the actual `create` signatures on `EventRepo`/`AppUserRepo` — if they don't exist or expect different input, insert via the JOOQ table helpers `EVENT.insertReturning(record) { ID }` directly in the fixture. Check `ApiResponse.Created`'s property name for the id.)

Test file:

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test

class TimingServiceTest {

    @Test
    fun addAndListStations() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        val created = !TimingService.addStation(
            TimingStationRequest(name = "Finish", type = TimingStationType.FINISH, sorting = 0),
            userId,
            eventId,
        )

        val stations = !TimingService.getStations(eventId)
        // assert the list contains exactly one station named "Finish" of type FINISH
    }

    @Test
    fun deleteStationWithMarksFails() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        // add station, capture a time mark on it (TimingService.createTimeMark, Task 6 —
        // for this task, assert only StationNotFound on deleting a random UUID:)
        assertKIOFails(TimingError.StationNotFound) {
            TimingService.deleteStation(java.util.UUID.randomUUID())
        }
    }
}
```

The `createTestEventWithAdmin()` helper: if `TestExamples.kt` has no ready-made fixture, add one there (insert `event` + `app_user` records via their repos, return both UUIDs). Copy the approach used by the closest existing DB test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=TimingServiceTest -q`
Expected: FAIL — `TimingService` unresolved.

- [ ] **Step 3: Write the service**

`TimingService.kt` (station part; time-mark functions come in Task 6):

```kotlin
package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

object TimingService {

    fun addStation(
        request: TimingStationRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val record = !request.toRecord(userId, eventId)
        val id = !TimingStationRepo.create(record).orDie()
        KIO.ok(ApiResponse.Created(id))
    }

    fun getStations(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { ApiResponse.ListDto(it) }
    }

    fun updateStation(
        request: TimingStationRequest,
        userId: UUID,
        stationId: UUID,
    ): App<TimingError, ApiResponse.NoData> =
        TimingStationRepo.update(stationId) {
            name = request.name
            type = request.type.name
            sorting = request.sorting
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { TimingError.StationNotFound }
            .map { ApiResponse.NoData }

    fun deleteStation(
        stationId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        val hasMarks = !TimingTimeMarkRepo.existsByStation(stationId).orDie()
        !KIO.failOn(hasMarks) { TimingError.StationHasTimeMarks }
        !TimingStationRepo.delete(stationId).orDie()
        noData
    }
}
```

(`ApiResponse.ListDto` — verify the actual name of the non-paged list response in `calls/responses/ApiResponse.kt` and use that; if only `Dto` exists, wrap the list in `ApiResponse.Dto(it)`.)

`timing.kt` routes:

```kotlin
package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.calls.requests.*
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import io.ktor.server.routing.*

fun Route.timing() {
    route("/timing") {

        route("/stations") {

            post {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingStationRequest.example)
                    TimingService.addStation(body, user.id!!, eventId)
                }
            }

            get {
                call.respondComprehension {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingService.getStations(eventId)
                }
            }

            route("/{stationId}") {

                put {
                    call.respondComprehension {
                        val user = !authenticate(Privilege.UpdateEventGlobal)
                        val stationId = !pathParam("stationId", uuid)
                        val body = !receiveKIO(TimingStationRequest.example)
                        TimingService.updateStation(body, user.id!!, stationId)
                    }
                }

                delete {
                    call.respondComprehension {
                        !authenticate(Privilege.UpdateEventGlobal)
                        val stationId = !pathParam("stationId", uuid)
                        TimingService.deleteStation(stationId)
                    }
                }
            }
        }
    }
}
```

In `event.kt`, inside `route("/{eventId}") {`, directly after `eventDay()`:

```kotlin
            timing()
```
(plus import `de.lambda9.ready2race.backend.app.timing.boundary.timing`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=TimingServiceTest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing backend/src/main/kotlin/de/lambda9/ready2race/backend/app/event/boundary/event.kt backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing
git commit -m "Add timing station service and routes"
```

---

### Task 6: Time mark capture, retract, assignment

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingService.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/timing.kt`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimeMarkServiceTest.kt`

**Interfaces:**
- Consumes: Task 4 repos, Task 3 entities.
- Produces:
  - `TimingService.createTimeMark(request: CreateTimeMarkRequest, userId: UUID, eventId: UUID): App<ServiceError, ApiResponse.Created>` — **idempotent**: if a mark with `request.id` exists, succeed without insert.
  - `TimingService.retractTimeMark(timeMarkId: UUID, eventId: UUID): App<TimingError, ApiResponse.NoData>` — sets status `RETRACTED`, never deletes.
  - `TimingService.assignTimeMark(request: AssignTimeMarkRequest, userId: UUID, timeMarkId: UUID, eventId: UUID): App<TimingError, ApiResponse.NoData>` — team UUID = upsert assignment; null = detach.
  - Routes: `POST /timing/timeMarks`, `PUT /timing/timeMarks/{timeMarkId}/retract`, `PUT /timing/timeMarks/{timeMarkId}/assignment` (all `Privilege.UpdateAppTimingGlobal`, admin `UpdateEventGlobal` also passes via `authenticateAny`).

- [ ] **Step 1: Write the failing tests**

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test

class TimeMarkServiceTest {

    @Test
    fun createIsIdempotent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId) // helper: TimingService.addStation(...).map { it.id }
        val markId = UUID.randomUUID()
        val request = CreateTimeMarkRequest(id = markId, station = stationId, timestampMillis = 1755430000000)

        !TimingService.createTimeMark(request, userId, eventId)
        !TimingService.createTimeMark(request, userId, eventId) // second call must succeed, no duplicate

        // assert: exactly one mark exists for the event (via TimingTimeMarkRepo.getByEvent)
    }

    @Test
    fun retractKeepsMark() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.retractTimeMark(markId, eventId)

        // assert: mark still exists, status == "RETRACTED"
    }

    @Test
    fun assignAndDetach() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val teamId = !createTestMatchTeam(eventId) // fixture: minimal competition + match + team; reuse existing fixtures from competitionExecution tests if present
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        !TimingService.assignTimeMark(AssignTimeMarkRequest(teamId), userId, markId, eventId)
        // assert assignment exists for markId -> teamId

        !TimingService.assignTimeMark(AssignTimeMarkRequest(null), userId, markId, eventId)
        // assert assignment gone
    }
}
```

If creating a `competition_match_team` fixture is disproportionate (deep FK chain), split `assignAndDetach` to only cover detach-error path (`TimeMarkNotFound`) and cover team assignment in the Task 7 state test where the fixture is needed anyway. Do not skip idempotency and retract tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=TimeMarkServiceTest -q`
Expected: FAIL — functions unresolved.

- [ ] **Step 3: Implement in TimingService**

```kotlin
    fun createTimeMark(
        request: CreateTimeMarkRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val exists = !TimingTimeMarkRepo.exists(request.id).orDie()
        if (exists) {
            KIO.ok(ApiResponse.Created(request.id))
        } else {
            val station = !TimingStationRepo.get(request.station).orDie()
                .onNullFail { TimingError.StationNotFound }
            !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

            val id = !TimingTimeMarkRepo.create(
                TimingTimeMarkRecord(
                    id = request.id,
                    event = eventId,
                    station = request.station,
                    timestampMillis = request.timestampMillis,
                    source = "APP_USER",
                    status = "ACTIVE",
                    createdAt = LocalDateTime.now(),
                    createdBy = userId,
                )
            ).orDie()
            KIO.ok(ApiResponse.Created(id))
        }
    }

    fun retractTimeMark(
        timeMarkId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }
        !TimingTimeMarkRepo.update(timeMarkId) { status = "RETRACTED" }.orDie()
            .onNullFail { TimingError.TimeMarkNotFound }
        noData
    }

    fun assignTimeMark(
        request: AssignTimeMarkRequest,
        userId: UUID,
        timeMarkId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }

        val team = request.competitionMatchTeam
        if (team == null) {
            !TimingAssignmentRepo.deleteByTimeMark(timeMarkId).orDie()
        } else {
            val existing = !TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie()
            if (existing == null) {
                !TimingAssignmentRepo.create(
                    TimingAssignmentRecord(
                        id = UUID.randomUUID(),
                        timeMark = timeMarkId,
                        competitionMatchTeam = team,
                        createdAt = LocalDateTime.now(),
                        createdBy = userId,
                        updatedAt = LocalDateTime.now(),
                        updatedBy = userId,
                    )
                ).orDie()
            } else {
                !TimingAssignmentRepo.update(existing.id!!) {
                    competitionMatchTeam = team
                    updatedAt = LocalDateTime.now()
                    updatedBy = userId
                }.orDie()
            }
        }
        noData
    }
```

Add imports for `TimingTimeMarkRecord`, `TimingAssignmentRecord`.

Routes in `timing.kt`, inside `route("/timing")`:

```kotlin
        route("/timeMarks") {

            post {
                call.respondComprehension {
                    val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(CreateTimeMarkRequest.example)
                    TimingService.createTimeMark(body, user.id!!, eventId)
                }
            }

            route("/{timeMarkId}") {

                put("/retract") {
                    call.respondComprehension {
                        !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        TimingService.retractTimeMark(timeMarkId, eventId)
                    }
                }

                put("/assignment") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        val body = !receiveKIO(AssignTimeMarkRequest.example)
                        TimingService.assignTimeMark(body, user.id!!, timeMarkId, eventId)
                    }
                }
            }
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=TimeMarkServiceTest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing
git commit -m "Add time mark capture, retract and assignment"
```

---

### Task 7: Timing state endpoint

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingService.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/timing.kt`
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingStateTest.kt`

**Interfaces:**
- Produces: `TimingService.getState(eventId: UUID): App<ServiceError, ApiResponse.Dto<TimingStateDto>>`; route `GET /event/{eventId}/timing/state`. Boards load this on open/reload (spec: "refresh never hurts").

- [ ] **Step 1: Write the failing test**

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

class TimingStateTest {

    @Test
    fun stateContainsStationsAndMarksWithAssignments() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId)
        val markId = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(markId, stationId, 1755430000000), userId, eventId)

        val state = !TimingService.getState(eventId)
        // assert: 1 station, 1 mark, mark.assignedTeam == null, mark.status == "ACTIVE"
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=TimingStateTest -q`
Expected: FAIL — `getState` unresolved.

- [ ] **Step 3: Implement**

```kotlin
    fun getState(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        val marks = !TimingTimeMarkRepo.getByEvent(eventId).orDie()
        val assignments = !TimingAssignmentRepo.getByTimeMarks(marks.mapNotNull { it.id }).orDie()
        val assignmentByMark = assignments.associateBy({ it.timeMark }, { it.competitionMatchTeam })

        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { stationDtos ->
            ApiResponse.Dto(
                TimingStateDto(
                    stations = stationDtos,
                    timeMarks = marks.sortedBy { it.timestampMillis }
                        .map { timeMarkDto(it, assignmentByMark[it.id]) },
                )
            )
        }
    }
```

Route inside `route("/timing")`:

```kotlin
        get("/state") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                TimingService.getState(eventId)
            }
        }
```

- [ ] **Step 4: Run all timing tests**

Run: `cd backend && ./mvnw test -Dtest='Timing*,TimeMark*' -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing
git commit -m "Add timing state endpoint"
```

---

### Task 8: Clock-sync endpoint

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/timing.kt` (new top-level route function)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Routing.kt` (register `timingGlobal()`)
- Test: extend `backend/src/test/kotlin/de/lambda9/ready2race/backend/ApplicationTest.kt` style — new test file `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/ServerTimeTest.kt`

**Interfaces:**
- Produces: `POST /api/timing/serverTime` → `{"serverTimeMillis": <Long>}` — unauthenticated (devices poll it every 5 s, response must involve no DB access).

- [ ] **Step 1: Write the failing test**

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.timingGlobal
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ServerTimeTest {

    @Test
    fun serverTimeReturnsMillis() = testApplication {
        application {
            routing {
                route("/api") { timingGlobal() }
            }
        }
        val before = System.currentTimeMillis()
        val response = client.post("/api/timing/serverTime")
        val after = System.currentTimeMillis()
        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.bodyAsText()
        val millis = Regex("\\d{13}").find(body)!!.value.toLong()
        assertTrue(millis in before..after)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=ServerTimeTest -q`
Expected: FAIL — `timingGlobal` unresolved.

- [ ] **Step 3: Implement**

In `timing.kt`, add a second top-level route function (kept separate because it is NOT nested under `/event/{eventId}` and needs no auth):

```kotlin
fun Route.timingGlobal() {
    route("/timing") {
        post("/serverTime") {
            call.respondText(
                """{"serverTimeMillis":${System.currentTimeMillis()}}""",
                io.ktor.http.ContentType.Application.Json,
            )
        }
    }
}
```

(Direct `respondText` instead of `respondComprehension` is deliberate: the endpoint is latency-critical and must not touch session or DB.)

In `Routing.kt`, inside `route("/api")`, after `globalConfigurations(env)`:

```kotlin
            timingGlobal()
```
(plus import `de.lambda9.ready2race.backend.app.timing.boundary.timingGlobal`)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=ServerTimeTest -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/timing.kt backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Routing.kt backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/ServerTimeTest.kt
git commit -m "Add clock-sync server time endpoint"
```

---

### Task 9: WebSocket fanout

**Files:**
- Modify: `backend/pom.xml` (add dependency)
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Sockets.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingBroadcaster.kt`
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt` (call `configureSockets(env)` in `module()`)
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingService.kt` (broadcast on mutations)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingBroadcasterTest.kt`

**Interfaces:**
- Produces:
  - WS endpoint `GET /api/ws/event/{eventId}/timing` (session-authenticated, `Privilege.UpdateAppTimingGlobal` or `ReadEventGlobal`).
  - `TimingBroadcaster.broadcast(eventId: UUID, message: TimingWsMessage)` — fire-and-forget, called by `TimingService` after successful mutations.
  - `sealed class TimingWsMessage` (Jackson-serialized with a `type` discriminator): `TimeMarkCreated(mark: TimeMarkDto)`, `TimeMarkRetracted(id: UUID)`, `AssignmentChanged(timeMark: UUID, competitionMatchTeam: UUID?)`, `StationsChanged`.
  - Frontend (Plan 2) consumes exactly these message shapes.

- [ ] **Step 1: Add the websockets dependency**

In `backend/pom.xml`, next to the other `io.ktor` dependencies:

```xml
        <dependency>
            <groupId>io.ktor</groupId>
            <artifactId>ktor-server-websockets-jvm</artifactId>
            <version>${ktor.version}</version>
        </dependency>
```

Run: `cd backend && ./mvnw compile -q` — Expected: BUILD SUCCESS.

- [ ] **Step 2: Write the broadcaster unit test (failing)**

`TimingBroadcaster` keeps `ConcurrentHashMap<UUID, MutableSet<suspend (String) -> Unit>>` of subscribers (the WS route registers a lambda that sends over its session). Test it without Ktor:

```kotlin
package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingWsMessage
import kotlinx.coroutines.runBlocking
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TimingBroadcasterTest {

    @Test
    fun broadcastReachesOnlySubscribersOfSameEvent() = runBlocking {
        val eventA = UUID.randomUUID()
        val eventB = UUID.randomUUID()
        val receivedA = mutableListOf<String>()
        val receivedB = mutableListOf<String>()

        val subA = TimingBroadcaster.subscribe(eventA) { receivedA.add(it) }
        val subB = TimingBroadcaster.subscribe(eventB) { receivedB.add(it) }

        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))

        assertEquals(1, receivedA.size)
        assertTrue(receivedA[0].contains("timeMarkRetracted"))
        assertEquals(0, receivedB.size)

        TimingBroadcaster.unsubscribe(eventA, subA)
        TimingBroadcaster.unsubscribe(eventB, subB)
        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))
        assertEquals(1, receivedA.size)
    }
}
```

Run: `cd backend && ./mvnw test -Dtest=TimingBroadcasterTest -q`
Expected: FAIL — `TimingBroadcaster` unresolved.

- [ ] **Step 3: Implement broadcaster + messages**

`TimingBroadcaster.kt`:

```kotlin
package de.lambda9.ready2race.backend.app.timing.boundary

import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import de.lambda9.ready2race.backend.app.timing.entity.TimeMarkDto
import io.github.oshai.kotlinlogging.KotlinLogging
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(TimingWsMessage.TimeMarkCreated::class, name = "timeMarkCreated"),
    JsonSubTypes.Type(TimingWsMessage.TimeMarkRetracted::class, name = "timeMarkRetracted"),
    JsonSubTypes.Type(TimingWsMessage.AssignmentChanged::class, name = "assignmentChanged"),
    JsonSubTypes.Type(TimingWsMessage.StationsChanged::class, name = "stationsChanged"),
)
sealed class TimingWsMessage {
    data class TimeMarkCreated(val mark: TimeMarkDto) : TimingWsMessage()
    data class TimeMarkRetracted(val id: UUID) : TimingWsMessage()
    data class AssignmentChanged(val timeMark: UUID, val competitionMatchTeam: UUID?) : TimingWsMessage()
    data object StationsChanged : TimingWsMessage()
}

typealias TimingSubscriber = suspend (String) -> Unit

object TimingBroadcaster {

    private val logger = KotlinLogging.logger {}
    private val mapper: ObjectMapper = ObjectMapper().registerKotlinModule()
    private val subscribers = ConcurrentHashMap<UUID, MutableSet<TimingSubscriber>>()

    fun subscribe(eventId: UUID, subscriber: TimingSubscriber): TimingSubscriber {
        subscribers.computeIfAbsent(eventId) { ConcurrentHashMap.newKeySet() }.add(subscriber)
        return subscriber
    }

    fun unsubscribe(eventId: UUID, subscriber: TimingSubscriber) {
        subscribers[eventId]?.remove(subscriber)
    }

    suspend fun broadcast(eventId: UUID, message: TimingWsMessage) {
        val json = mapper.writeValueAsString(message)
        subscribers[eventId]?.forEach { subscriber ->
            try {
                subscriber(json)
            } catch (ex: Exception) {
                logger.warn(ex) { "Failed to deliver timing ws message, dropping subscriber" }
                subscribers[eventId]?.remove(subscriber)
            }
        }
    }
}
```

(Match Jackson serialization config with `plugins/Serialization.kt` — if a shared configured `ObjectMapper` is exposed there, reuse it instead of creating a new one. `data object StationsChanged` may need to be a `class` if Jackson cannot serialize the object singleton — check the test.)

Run: `cd backend && ./mvnw test -Dtest=TimingBroadcasterTest -q`
Expected: PASS

- [ ] **Step 4: Wire the WS route**

`plugins/Sockets.kt`:

```kotlin
package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import java.util.UUID
import kotlin.time.Duration.Companion.seconds

fun Application.configureSockets(env: JEnv) {
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 30.seconds
    }

    routing {
        webSocket("/api/ws/event/{eventId}/timing") {
            val eventId = call.parameters["eventId"]?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            if (eventId == null) {
                close(CloseReason(CloseReason.Codes.CANNOT_ACCEPT, "Invalid eventId"))
                return@webSocket
            }

            val authResult = call.authenticateAny(
                Privilege.UpdateAppTimingGlobal,
                Privilege.ReadEventGlobal,
            ).unsafeRunSync(env)
            if (authResult.isError()) {
                close(CloseReason(CloseReason.Codes.VIOLATED_POLICY, "Unauthorized"))
                return@webSocket
            }

            val subscriber = TimingBroadcaster.subscribe(eventId) { json ->
                send(Frame.Text(json))
            }
            try {
                for (frame in incoming) {
                    // Clients only listen; incoming frames are ignored (keepalive handled by ktor pings)
                }
            } finally {
                TimingBroadcaster.unsubscribe(eventId, subscriber)
            }
        }
    }
}
```

(Verify the exact result-inspection API for `unsafeRunSync` — mirror how `Exit`/`fold` is used in `testing/kio/testComprehension.kt`: use `.fold(onSuccess = {...}, onError = {...}, onDefect = {...})` if `isError()` does not exist.)

In `Application.kt` `module()`, before `configureRouting`:

```kotlin
    configureSockets(env)
```

Run: `cd backend && ./mvnw compile -q` — Expected: BUILD SUCCESS.

- [ ] **Step 5: Broadcast from TimingService**

`TimingService` mutations get a broadcast after successful persistence. KIO comprehensions are synchronous; broadcasting is fire-and-forget — add a small helper at the bottom of `TimingService`:

```kotlin
    private fun broadcastAsync(eventId: UUID, message: TimingWsMessage) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            TimingBroadcaster.broadcast(eventId, message)
        }
    }
```

Call sites (each directly before the terminal `KIO.ok(...)`/`noData` of the function):
- `createTimeMark` (only in the insert branch): `broadcastAsync(eventId, TimingWsMessage.TimeMarkCreated(timeMarkDto(record, null)))` — build `record` as a local `val` before `create` so it is available here.
- `retractTimeMark`: `broadcastAsync(eventId, TimingWsMessage.TimeMarkRetracted(timeMarkId))`
- `assignTimeMark`: `broadcastAsync(eventId, TimingWsMessage.AssignmentChanged(timeMarkId, request.competitionMatchTeam))`
- `addStation` / `updateStation` / `deleteStation`: `broadcastAsync(eventId, TimingWsMessage.StationsChanged)` — `updateStation`/`deleteStation` need the `eventId`: read it from the station record already fetched (for `updateStation`, fetch the record via `TimingStationRepo.get` first and fail with `StationNotFound` if null, keeping the existing update logic).

Run: `cd backend && ./mvnw test -Dtest='Timing*,TimeMark*,ServerTime*' -q`
Expected: PASS (existing tests unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/pom.xml backend/src/main/kotlin/de/lambda9/ready2race/backend/plugins/Sockets.kt backend/src/main/kotlin/de/lambda9/ready2race/backend/Application.kt backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingBroadcasterTest.kt
git commit -m "Add websocket fanout for timing updates"
```

---

### Task 10: Full test run + push

- [ ] **Step 1: Run the whole backend test suite**

Run: `cd backend && ./mvnw test -q`
Expected: PASS — no regressions.

- [ ] **Step 2: Push and verify CI**

```bash
git push origin main
```
Then check the GitHub Actions/CI status of the repo (if configured) — fix and re-push on failure.

---

## Not in this plan (later plans)

- Plan 2: Posten area + capture boards (frontend; consumes `TimingStateDto`, WS messages, `serverTime`).
- Plan 3: Start sequences (tables `timing_start_sequence` + entries, state machine, start board).
- Plan 4: Leitstand + official times (`timing_official_time`), timecode snapshot on referee approval, penalties, explicit delete, hardware device tokens.
- Plan 5: Referee board re-home under Posten.
