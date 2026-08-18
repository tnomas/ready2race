# Timing Start Sequences Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Timeboxed plan: larger task cuts, one review gate after the backend and one after the UI.

**Goal:** Server-driven start sequences per spec `docs/superpowers/specs/2026-08-17-timing-module-design.md` ("Start board" section): MASS (one signal starts all) and INTERVAL (one team every N seconds) sequences that run server-side, fire actual start time marks, and render synchronized countdowns on all connected boards.

**Architecture:** New tables `timing_start_sequence` + `timing_start_sequence_entry`. Sequence state lives in the DB; a Scheduler job (existing `Scheduler`/`scheduleDynamic` infra, see `Application.kt`) fires due entries: creates a time mark + assignment per team (reusing Plan-1 services), updates entry status, completes the sequence, broadcasts over the existing timing WS channel. Boards render countdowns from `startedAtMillis` + interval + server-clock offset — no client timers of record.

**Firing semantics:**
- Sequence created ARMED with an ORDERED list of `competition_match_team` entries, `mode MASS|INTERVAL`, `intervalMillis` (INTERVAL only).
- `start` → state RUNNING, `startedAtMillis = server now`.
- MASS: all PENDING entries fire at `startedAtMillis` (one mark per team, identical timestamp).
- INTERVAL: entry at `position` p fires at `startedAtMillis + p * intervalMillis`. SKIPPED entries keep the cadence (their slot passes empty).
- Fired entry: create time mark (id random UUID, station = sequence.station, timestamp = planned time, source APP_USER, createdBy = sequence creator) via the race-safe repo path + assignment to the team; entry → STARTED with mark reference.
- No PENDING entries left → DONE. `abort` → ABORTED (pending entries never fire). `skip(entry)` only while PENDING.
- Scheduler job every 1 second; firing is idempotent/crash-safe (entry status flip and mark creation in one transaction; job re-run picks up whatever is still due).

## Global Constraints

Same as Plan 1/2 (branch feature/timing-module; KIO/JOOQ/Flyway patterns; Java env `export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home; export PATH="$JAVA_HOME/bin:$PATH"`; docker up; migration naming V<yyyyMMddHHmm>__; jooq regen after migrations; tests via testComprehension; commits English/imperative, never mention Claude/AI; tsp surgical-merge flow with @operationId; i18n de/en/da additive, no reformat).

Broadcast caveat: the Scheduler job runs OUTSIDE respondKIO, so `AfterCommit` has no buffer installed and `TimingBroadcaster` falls back to immediate enqueue. The job must therefore broadcast AFTER its own transact completes (collect messages in the job, flush after the KIO run succeeds), mirroring the after-commit guarantee manually.

---

### Task A: Backend — migration, entities, repos, sequence service + scheduler

**Files:** new migration `V202608180030__timing_start_sequences.sql`; `app/timing/entity/` (TimingSequenceDto, TimingSequenceEntryDto, CreateSequenceRequest, sequence errors added to TimingError); `app/timing/control/` (TimingSequenceRepo, TimingSequenceEntryRepo, conversions); `app/timing/boundary/TimingSequenceService.kt`; scheduler registration in `Application.kt`; tests `TimingSequenceServiceTest`.

Migration:
```sql
create table if not exists timing_start_sequence
(
    id                uuid primary key,
    event             uuid      not null references event on delete cascade,
    station           uuid      not null references timing_station on delete restrict,
    mode              text      not null check (mode in ('MASS', 'INTERVAL')),
    interval_millis   bigint,
    state             text      not null default 'ARMED' check (state in ('ARMED', 'RUNNING', 'DONE', 'ABORTED')),
    started_at_millis bigint,
    created_at        timestamp not null,
    created_by        uuid references app_user on delete set null,
    updated_at        timestamp not null,
    updated_by        uuid references app_user on delete set null
);

create table if not exists timing_start_sequence_entry
(
    id                     uuid primary key,
    sequence               uuid      not null references timing_start_sequence on delete cascade,
    competition_match_team uuid      not null references competition_match_team on delete cascade,
    position               int       not null,
    status                 text      not null default 'PENDING' check (status in ('PENDING', 'STARTED', 'SKIPPED')),
    time_mark              uuid references timing_time_mark on delete set null,
    unique (sequence, position)
);

create index if not exists idx_timing_sequence_event on timing_start_sequence (event);
create index if not exists idx_timing_sequence_entry_seq on timing_start_sequence_entry (sequence);
```

Service functions (exact signatures for the routes task):
- `createSequence(request: CreateSequenceRequest, userId, eventId): App<ServiceError, ApiResponse.Created>` — request `{station: UUID, mode: 'MASS'|'INTERVAL', intervalMillis: Long?, teams: List<UUID>}` (ordered); validation: INTERVAL requires intervalMillis >= 1000; station must be type START and belong to event; teams non-empty. Only one ARMED/RUNNING sequence per station at a time → `TimingError.SequenceAlreadyActive` (409).
- `getActiveSequence(eventId, stationId): App<..., ApiResponse>` — latest non-DONE/ABORTED sequence with entries (Dto includes entries with team ids, positions, status, plannedStartMillis computed, timeMark id).
- `startSequence(sequenceId, userId, eventId)`, `abortSequence(...)`, `skipEntry(entryId, ...)` — state machine guards (start only ARMED; abort only RUNNING/ARMED; skip only PENDING entries of ARMED/RUNNING sequences), wrong state → `TimingError.SequenceStateConflict` (409).
- `fireDueEntries(): App<...>` — the scheduler body: for each RUNNING sequence, compute due PENDING entries (planned <= now), per entry: createIfAbsent mark + assignment + entry update in the transaction; sequence with zero PENDING left → DONE. Returns count fired. Broadcast (sequenceChanged + timeMarkCreated + assignmentChanged per fired entry) AFTER transact per the Global Constraints caveat — study how `scheduleDynamic` jobs run their KIO (EmailService.sendNext) to place the flush correctly.

Scheduler registration in `Application.kt` `scheduleJobs`: `scheduleDynamic("Fire due start sequence entries", 1.seconds) { TimingSequenceService.fireDueEntries().map { if (it > 0) DynamicIntervalJobState.Processed else DynamicIntervalJobState.Empty } }` (adapt to the actual DynamicIntervalJobState API).

Tests (TDD): create+getActive round trip; INTERVAL fire ordering (create with 2 teams, interval 1000ms, start with a mocked/now-shifted startedAt → fireDueEntries fires only due ones; simplest: set startedAtMillis in the past via repo update in the test); MASS fires all at once; skip keeps cadence; state-machine conflicts (start twice → SequenceStateConflict); DONE transition. Use `createTestEventWithAdmin`/`addTestStation` (type START!)/`createTestMatchTeam` fixtures.

Commit granularity: migration+entities+repos (`Add start sequence tables and entities`), then service+scheduler+tests (`Add start sequence service and scheduler`).

### Task B: Routes + WS + API contract

**Files:** `timing.kt` (nested under /timing: `route("/sequences")` with POST create, GET `/active?stationId=`, POST `/{sequenceId}/start|abort`, POST `/{sequenceId}/entries/{entryId}/skip` — auth `authenticateAny(UpdateAppTimingGlobal, UpdateEventGlobal)`, GET also ReadEventGlobal); `TimingWsMessage.SequenceChanged(sequence: TimingSequenceDto)` (+ jackson subtype "sequenceChanged") broadcast from all sequence mutations (after-commit via the established mechanisms — service mutations called from routes use AfterCommit.register; the scheduler path per Task A); `api/src/timing.tsp` ops (`createTimingSequence`, `getActiveTimingSequence`, `startTimingSequence`, `abortTimingSequence`, `skipTimingSequenceEntry`) + models; surgical yaml merge (scripts in .superpowers/sdd/ as precedent); `npm run generate`; tsc clean.

Commit: `Add start sequence routes and api contract`.

### Task C: Start board UI

**Files:** `frontend/src/components/timing/SequencePanel.tsx` (+ subcomponents as needed), integrated into `TimingBoardPage` shown INSTEAD of the two-step capture area when the station type is START (capture button remains available below as manual fallback, smaller); `frontend/src/utils/timing/useSequence.ts` if cleaner; i18n de/en/da.

Behavior:
- No active sequence: setup form — mode toggle (Massenstart/Einzelstart), interval seconds (INTERVAL, default 60), ordered team multi-select (from the already-loaded teams list; simple add-in-order list with remove), "Sequenz scharf stellen" → create (ARMED).
- ARMED: entry list with positions, "Sequenz starten" (big), "Abbrechen" (abort), per-entry skip.
- RUNNING: BIG countdown to the next pending entry's planned time (server clock offset — reuse `now()` from useServerClock; rAF rendering like the header clock), next team prominently displayed (name + start number), following entries listed, per-entry skip, abort (with confirm). Sounds: short beep at T-5..T-1 (per second), long beep at T-0 — WebAudio like feedback.ts (extend it with `playCountdownBeep(final: boolean)`); fire sounds client-side from the countdown (each board plays its own audio — synchronized via server clock).
- Fired entries show their actual mark time; DONE state shows a summary + "Neue Sequenz" reset.
- Live sync: handle `sequenceChanged` WS message (extend the message union + useTimingBoardState or a parallel handler); refetch active sequence on WS connect.
- MASS mode: same flow, countdown to the single start, all teams fire at once.

Commit: `Add start sequence board`.

### Task D: Review gates + verification

- Review gate 1 after Task B (backend+contract, one reviewer pass, focus: firing idempotency/crash-safety, transaction+broadcast ordering, state-machine guards).
- Review gate 2 after Task C (UI pass, focus: countdown correctness vs server clock, WS-driven state changes, sounds not firing on stale renders).
- `./mvnw test -q` + `npm run build` green before each commit as usual.
- Manual browser verification if time remains; otherwise documented as next session's first step in the ledger.
