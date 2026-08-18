# Timing Leitstand Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Timeboxed: large task cuts, review gate after backend and after UI (Plan-3 pattern).

**Goal:** The control board (Leitstand) and the official-time layer per spec `docs/superpowers/specs/2026-08-17-timing-module-design.md`: computed/overridden official times with penalties and DNS/DNF/DSQ, explicit push into the existing `timecode` results flow, freeze-on-approval semantics, cross-station live overview with correction tools, explicit delete, and station-scoped hardware device tokens (API surface only).

**Data model (new):**
```sql
create table if not exists timing_official_time
(
    id                     uuid primary key,
    competition_match_team uuid      not null unique references competition_match_team on delete cascade,
    event                  uuid      not null references event on delete cascade,
    computed_millis        bigint,
    override_millis        bigint,
    penalty_millis         bigint    not null default 0,
    result_status          text      not null default 'NONE' check (result_status in ('NONE', 'DNS', 'DNF', 'DSQ')),
    dirty                  boolean   not null default false,
    pushed_at              timestamp,
    created_at             timestamp not null,
    created_by             uuid references app_user on delete set null,
    updated_at             timestamp not null,
    updated_by             uuid references app_user on delete set null
);
create index if not exists idx_timing_official_time_event on timing_official_time (event);

create table if not exists timing_device_token
(
    id         uuid primary key,
    event      uuid      not null references event on delete cascade,
    station    uuid      not null references timing_station on delete cascade,
    name       text      not null,
    token_hash text      not null unique,
    revoked    boolean   not null default false,
    created_at timestamp not null,
    created_by uuid references app_user on delete set null
);
```

**Semantics:**
- Effective time = `override_millis ?? computed_millis`, plus `penalty_millis`; `result_status != NONE` supersedes any time.
- `computeOfficialTimes(eventId)` (service, also callable per team): for each team with an ACTIVE assigned FINISH mark AND an ACTIVE assigned START mark → computed = finish − start; teams with finish but no start, or negative diff → skipped with a per-team reason in the response (Leitstand shows it). Recompute upserts rows and clears `dirty` for recomputed teams; never touches overrides/penalties/status.
- Any timing edit (retract/assignment change/new mark) on a team that HAS an official_time row sets `dirty = true` on it (hook in the existing TimingService mutations; cheap lookup by team).
- **Push to results** (`pushOfficialTimes(eventId, competitionMatchTeamIds)`): writes/updates the existing `timecode` record per team (study the timecode table semantics: `time bigint, base_unit, millisecond_precision` and how `UpdateCompetitionMatchTeamResultRequest`/Conversions use it — mirror EXACTLY what the CSV import writes so places calculation works unchanged) and links `competition_match_team.timecode`. Freeze rule: if the team's match/round is already approved/places-calculated (study `CompetitionExecutionService` for the flag — e.g. `places_calculated` on the team or round approval), the push FAILS for that team with a 409-style per-team error unless `force=true` — approval is the freeze boundary per the spec. Sets `pushed_at`, clears `dirty`.
- Explicit delete of time marks ("Zeiten löschen", spec principle 1): new endpoint deleting RETRACTED marks (only retracted ones!) of a station or event — hard delete, requires `UpdateEventGlobal`, WS `timesDeleted` message with the ids.
- Device tokens: issue (returns the plaintext token ONCE, store only hash — reuse the repo's Password4j/Argon2 or a SHA-256 hash, study how auth hashes; SHA-256 is fine for machine tokens), revoke, list. Auth path: `POST /event/{eventId}/timing/timeMarks` additionally accepts header `X-Timing-Device-Token` when no session is present → validates token (event+station match, not revoked) → mark with `source = 'HARDWARE'`, created_by null. No UI beyond the Leitstand token table.

## Global Constraints

Same as Plans 1-3 (branch feature/timing-module; KIO/JOOQ/Flyway; Java env via brew openjdk@21; jooq regen `./mvnw org.jooq:jooq-codegen-maven:generate -q`; testComprehension; tsp @operationId + surgical yaml merge; i18n de/en/da additive no reformat; commits English/imperative, never mention Claude/AI). WS broadcast after commit (AfterCommit for routes; post-transact for any job path).

---

### Task A: Backend — official times, push, dirty tracking, delete, device tokens

Migration `V202608181100__timing_official_time.sql` (SQL above) + jooq regen. Entities (OfficialTimeDto with effectiveMillis, ComputeResultDto with per-team skip reasons, requests: OverrideRequest {overrideMillis?, penaltyMillis?, resultStatus?}, PushRequest {teams: [uuid], force: bool}, DeviceTokenRequest/Dto), errors (OfficialTimeNotFound, PushConflict(teams), DeviceTokenInvalid...). Repos. Service `TimingOfficialTimeService`: compute/get-all-for-event/setOverride/push/deleteRetractedMarks; `TimingDeviceTokenService`: issue/revoke/list/validate. Dirty-hook in TimingService mutations. Hardware-token auth branch in the timeMarks POST route (keep session path unchanged). WS messages: `officialTimeChanged`, `timesDeleted`. TDD: compute happy path + missing-start skip + negative skip; override/penalty/status arithmetic; dirty set on retract/reassign; push writes timecode identically to the import path (assert the written record fields); push blocked when places calculated, force overrides; DNS/DNF/DSQ push behavior (study what the import/results flow does for non-finishers — mirror it, likely no timecode + a team state; document the decision); token issue/validate/revoke + hardware mark source. Commits: `Add official time layer` then `Add timing device tokens`.

### Task B: Routes + contract

Routes under `/timing/officialTimes` (GET all, POST compute, PUT {teamId} override, POST push, DELETE retracted marks under `/timing/timeMarks/retracted`) and `/timing/deviceTokens` (GET/POST/DELETE{id}) — admin ops `UpdateEventGlobal`, reads also APP_TIMING. tsp ops (`getOfficialTimes`, `computeOfficialTimes`, `setOfficialTimeOverride`, `pushOfficialTimes`, `deleteRetractedTimeMarks`, `listTimingDeviceTokens`, `issueTimingDeviceToken`, `revokeTimingDeviceToken`) + surgical merge + `npm run generate` + tsc. Commit: `Add leitstand routes and api contract`.

### Task C: Leitstand UI

New fullscreen board `/app/timing/$eventId/leitstand` (entry: a "Leitstand" card on the station-select page, gated `UpdateEventGlobal`). Content, one screen with tabs or sections:
1. **Zeiten**: live table of ALL marks across stations (station, seq/time, status, team, source) — reuse board state hook with `stationId=null` variant (extend `useTimingBoardState` minimally: optional stationId → no station filter); actions per mark: reassign (existing AssignTeamDialog), retract, and for RETRACTED marks a delete-selected flow ("Zeiten löschen" with confirm, count).
2. **Ergebnisse**: table per team (start/finish times resolved, computed, override/penalty/status edit dialog, effective time, dirty badge, pushed_at); buttons: "Neu berechnen" (compute, shows skip reasons), "In Ergebnisse übernehmen" (selected/all, force-confirm on conflicts).
3. **Geräte**: device-token table (name, station, created, revoked) + issue dialog (shows plaintext token once, copy button) + revoke.
Live: WS officialTimeChanged/timesDeleted handling + the existing message set. i18n de/en/da. Commit: `Add leitstand board`.

### Task D: Gates + verification

Gate 1 (backend, focus: timecode-write parity with the import path, freeze semantics, token auth hardening — timing-safe hash compare, no token logging). Gate 2 (UI). Browser E2E: compute→override→push on the seeded dev data; hardware-token mark via curl. Full `./mvnw test -q` + `npm run build`.
