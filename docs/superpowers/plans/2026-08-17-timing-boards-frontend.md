# Timing Boards Frontend Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Posten area and capture boards for the timing module: station admin UI, app-area timing boards with two-step capture, clock sync, WebSocket live updates, offline buffer, sounds, and team assignment — per spec `docs/superpowers/specs/2026-08-17-timing-module-design.md` (Plan 1, backend foundation, is complete on this branch).

**Architecture:** React/Vite/MUI frontend following existing repo patterns (TanStack Router manual routes, hey-api generated client, `useFetch` hook, EntityTable/EntityDialog CRUD triad, i18next). Two new frontend infrastructure hooks (`useServerClock`, `useTimingWebSocket`) — the first WS client in this codebase. One small backend addition (`GET /event/{eventId}/timing/teams`).

**Tech Stack:** React 18, TypeScript, MUI, TanStack Router, hey-api/client-fetch, i18next, IndexedDB (hand-rolled, no new deps), WebAudio (no sound assets), Kotlin/Ktor for the teams endpoint.

## Global Constraints

- Branch: `feature/timing-module` (continue on it).
- Frontend has NO test runner — per-task verification is `cd frontend && npx tsc -b --noEmit` (typecheck) plus `npm run build` at milestones; behavior verification happens in the final manual browser task. Backend tasks keep the Testcontainers TDD cycle from Plan 1 (`export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home; export PATH="$JAVA_HOME/bin:$PATH"`).
- API client is GENERATED: never hand-edit `frontend/src/api/*.gen.ts`. Flow: edit `api/src/*.tsp` → `cd api && npx tsp compile .` → copy `api/tsp-output/schema/openapi.yaml` to `backend/src/main/resources/openapi/documentation.yaml` → `cd frontend && npm run generate`.
- WS client contract (fixed by Plan 1): `new WebSocket(url, ['r2r', sessionToken])`; messages `{type: 'timeMarkCreated', mark: TimeMarkDto} | {type: 'timeMarkRetracted', id} | {type: 'assignmentChanged', timeMark, competitionMatchTeam: uuid|null} | {type: 'stationsChanged'}`. `competitionMatchTeam` is always present (null = detached). A dropped WS (server drops slow clients at queue capacity 64) MUST auto-reconnect, and every (re)connect MUST refetch full state.
- Capture is never blocked by network: timestamp = `serverNow()` at tap, POST is async, failure goes to the IndexedDB queue. Time mark UUIDs are client-generated (`crypto.randomUUID()`); retries are idempotent server-side.
- i18n: every user-visible string via `t(...)`; add keys to ALL THREE files `frontend/src/i18n/{de,en,da}/translations.json` under a new top-level key `timing`. German with proper Umlauts.
- Session token lives in `sessionStorage` key `session` (see `frontend/src/contexts/user/UserProvider.tsx`); `X-Api-Session` header is injected by the existing interceptor for fetches.
- Git: commit after each task, English imperative messages, NEVER mention Claude/AI, no Co-Authored-By.

---

### Task 1: Regenerate the API client with timing endpoints

**Files:**
- Modify: `backend/src/main/resources/openapi/documentation.yaml` (replace with emitted spec)
- Generated: `frontend/src/api/sdk.gen.ts`, `frontend/src/api/types.gen.ts` (via `npm run generate`)

**Interfaces:**
- Produces: SDK functions used by all later tasks. Verify after generation and record the EXACT generated names in your report (they derive from tsp operation ids): station CRUD (`getTimingStations`, `createTimingStation`, `updateTimingStation`, `deleteTimingStation`), `createTimeMark`, `retractTimeMark`, `assignTimeMark`, `getTimingState`, `getServerTime` (or similar) — plus types `TimingStationDto`, `TimeMarkDto`, `TimingStateDto`.

- [ ] **Step 1:** `cd api && npx tsp compile .` — expect success (4 known warnings OK).
- [ ] **Step 2:** Copy the emitted spec over the served one:
```bash
cp api/tsp-output/schema/openapi.yaml backend/src/main/resources/openapi/documentation.yaml
```
- [ ] **Step 3:** `cd frontend && npm run generate` — then grep `frontend/src/api/sdk.gen.ts` for `timing` and confirm all endpoints above exist. If tsp operation names produce awkward SDK names, adjust `@route`/op names in `api/src/timing.tsp` and repeat (operation names are the contract for all later tasks — finalize them NOW).
- [ ] **Step 4:** `cd frontend && npx tsc -b --noEmit` — expect clean.
- [ ] **Step 5:** Commit: `Regenerate api client with timing endpoints`

---

### Task 2: Backend — timing teams endpoint

**Files:**
- Modify: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/boundary/TimingService.kt`, `.../timing.kt`
- Create: `backend/src/main/kotlin/de/lambda9/ready2race/backend/app/timing/entity/TimingTeamDto.kt`
- Modify: `api/src/timing.tsp` (+ regenerate per Global Constraints)
- Test: `backend/src/test/kotlin/de/lambda9/ready2race/backend/app/timing/TimingTeamsTest.kt`

**Interfaces:**
- Produces: `GET /event/{eventId}/timing/teams` → `ApiResponse.ListDto<TimingTeamDto>` with
  `data class TimingTeamDto(val competitionMatchTeam: UUID, val startNumber: Int?, val teamName: String?, val clubName: String?, val participantNames: List<String>, val competitionName: String?, val matchName: String?)`
  Auth: `authenticateAny(UpdateAppTimingGlobal, ReadEventGlobal)`. This feeds the board's assignment picker.

- [ ] **Step 1 (TDD):** Write failing test in `TimingTeamsTest.kt`: use the existing fixture `createTestMatchTeam(eventId)` (in `TimingTestFixtures.kt`), then assert `TimingService.getTeams(eventId)` returns exactly one entry whose `competitionMatchTeam` equals the fixture's team id. Run `./mvnw test -Dtest=TimingTeamsTest -q` → fails (unresolved `getTeams`).
- [ ] **Step 2:** Implement. Data source: check `backend/src/main/resources/db/migration/afterMigrate.sql` for an existing view joining `competition_match_team` up to event with names (search for `competition_match_team` occurrences — the start-list/live views used by `competitionExecution` are candidates; e.g. the view feeding `getStartList`). If a suitable view exists, add a repo function selecting from its generated table reference filtered by event; otherwise write an explicit jOOQ join: `competition_match_team → competition_registration → (club name, event_registration.event) + competition_properties.name`, participant names via the registration's participants (mirror how `CompetitionExecutionService` builds team DTOs — reuse its repo functions if they fit). Keep it read-only and simple; a `TimingTeamRepo` in `app/timing/control/` if a new query is needed.
- [ ] **Step 3:** Route in `timing.kt` inside `route("/timing")`:
```kotlin
        get("/teams") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                TimingService.getTeams(eventId)
            }
        }
```
- [ ] **Step 4:** Green: `./mvnw test -Dtest=TimingTeamsTest -q`, then `./mvnw test -Dtest='Timing*,TimeMark*' -q` (no regressions).
- [ ] **Step 5:** tsp: add the `/teams` op + `TimingTeamDto` model to `api/src/timing.tsp`, compile, copy yaml, `npm run generate`, `npx tsc -b --noEmit`.
- [ ] **Step 6:** Commit: `Add timing teams endpoint`

---

### Task 3: Frontend skeleton — privilege, app function, routes, i18n

**Files:**
- Modify: `frontend/src/authorization/privileges.ts` (add `updateAppTimingGlobal`)
- Modify: `frontend/src/components/qrApp/common.ts` (APP_FUNCTIONS entry + rights mapping)
- Modify: `frontend/src/routes.tsx` (timing board routes under `appRoute`)
- Create: `frontend/src/pages/app/TimingEventsPage.tsx` (event selection)
- Create: `frontend/src/pages/app/TimingStationSelectPage.tsx` (station selection)
- Create: `frontend/src/pages/app/TimingBoardPage.tsx` (placeholder shell, filled in Task 6)
- Modify: `frontend/src/i18n/{de,en,da}/translations.json` (new `timing` top-level key)

**Interfaces:**
- Consumes: `getTimingStations` SDK fn (Task 1).
- Produces: routes `/app/timing` (event select) → `/app/timing/$eventId` (station select) → `/app/timing/$eventId/$stationId` (board); privilege constant `updateAppTimingGlobal = {action: 'UPDATE', resource: 'APP_TIMING', scope: 'GLOBAL'}` (mirror the exact shape of `updateAppQrManagementGlobal` in privileges.ts); app-function card "Zeitnahme".

- [ ] **Step 1:** Add the privilege constant mirroring `updateAppQrManagementGlobal` exactly (same type/shape, resource `'APP_TIMING'` — check `types.gen.ts` after Task 1 for the enum value string).
- [ ] **Step 2:** In `qrApp/common.ts`: add a `timing` entry to `APP_FUNCTIONS` (icon: MUI `Timer` icon, labelKey `'app.functionSelect.functions.timing'`, navigate target `/app/timing`) and wire the privilege into `getUserAppRights`/`getAppRights` following the existing entries' pattern precisely.
- [ ] **Step 3:** Event-select page: mirror the existing event-selection page used by the app area (see how `QrEventsPage.tsx` lists events and navigates) but navigate to `/app/timing/$eventId`. Station-select page: `useFetch(signal => getTimingStations({signal, path: {eventId}}))`, render stations as large MUI card buttons (min-height 96px, full width, station name + type chip), navigate to the board route. Both pages: gate via `checkAuthApp`-style beforeLoad like other `/app` routes, plus render-guard `user.checkPrivilege(updateAppTimingGlobal)`.
- [ ] **Step 4:** Routes in `routes.tsx` under `appRoute`, mirroring existing app child routes (`createRoute({getParentRoute: () => appRoute, path: 'timing', ...})`, then `$eventId`, then `$stationId`), added to the `routeTree.addChildren` wiring where appRoute's children are declared.
- [ ] **Step 5:** i18n `timing` key in all three files — initial set:
```json
"timing": {
  "title": "Zeitnahme",
  "selectEvent": "Veranstaltung wählen",
  "selectStation": "Posten wählen",
  "station": {"types": {"START": "Start", "SPLIT": "Zwischenzeit", "FINISH": "Ziel"}}
}
```
(en/da translated equivalents; also `app.functionSelect.functions.timing`: de "Zeitnahme", en "Timing", da "Tidtagning").
- [ ] **Step 6:** `npx tsc -b --noEmit` clean. Commit: `Add timing app function and board routes`

---

### Task 4: `useServerClock` hook

**Files:**
- Create: `frontend/src/utils/timing/serverClock.ts` (pure offset logic)
- Create: `frontend/src/utils/timing/useServerClock.ts` (React hook)

**Interfaces:**
- Produces:
  - `class ClockSync { fun ingest(sample: {offset: number, latency: number}): void; readonly offset: number|null; readonly quality: 'SYNCING'|'OK'|'DEGRADED' }` — pure, documented, keeps lowest-latency sample; a new sample whose implied drift vs current offset exceeds 300 ms resets state (recalibration), mirroring the backend spec.
  - `useServerClock(): {now: () => number|null, quality, offsetMillis}` — `now()` returns epoch millis on the SERVER clock or null while syncing.

- [ ] **Step 1:** Pure logic in `serverClock.ts` (complete):
```ts
export type ClockQuality = 'SYNCING' | 'OK' | 'DEGRADED'

export type ClockSample = {
    // serverMillis measured at the midpoint of the request
    offset: number // serverMillis - clientMillis
    latency: number // full roundtrip millis
}

const DRIFT_RESET_THRESHOLD = 300

export class ClockSync {
    private best: ClockSample | null = null
    private lastSampleAt: number | null = null

    ingest(sample: ClockSample, nowMonotonic: number) {
        if (this.best !== null && Math.abs(sample.offset - this.best.offset) >= DRIFT_RESET_THRESHOLD) {
            // device clock jumped or drifted — recalibrate from scratch
            this.best = sample
        } else if (this.best === null || sample.latency < this.best.latency) {
            this.best = sample
        }
        this.lastSampleAt = nowMonotonic
    }

    offset(): number | null {
        return this.best?.offset ?? null
    }

    quality(nowMonotonic: number): ClockQuality {
        if (this.best === null) return 'SYNCING'
        if (this.lastSampleAt === null || nowMonotonic - this.lastSampleAt > 30_000) return 'DEGRADED'
        return 'OK'
    }
}
```
- [ ] **Step 2:** Hook `useServerClock.ts`: every 5 s (setInterval, cleared on unmount) do `const t0 = Date.now(); const res = await <serverTime SDK fn>({}); const t1 = Date.now();` compute `latency = t1 - t0`, `offset = res.data.serverTimeMillis - (t0 + latency / 2)`, `sync.ingest({offset, latency}, performance.now())`. Expose `now: () => sync.offset() === null ? null : Date.now() + sync.offset()!`, `quality`, `offsetMillis`. First sample fires immediately on mount. Use the generated SDK function from Task 1 (record its actual name). On request failure just skip the sample (quality degrades automatically).
- [ ] **Step 3:** `npx tsc -b --noEmit` clean. Commit: `Add server clock sync hook`

---

### Task 5: `useTimingWebSocket` hook

**Files:**
- Create: `frontend/src/utils/timing/timingSocket.ts` (message types + URL/protocol helpers)
- Create: `frontend/src/utils/timing/useTimingWebSocket.ts`

**Interfaces:**
- Produces:
  - `type TimingWsMessage = {type:'timeMarkCreated', mark: TimeMarkDto} | {type:'timeMarkRetracted', id: string} | {type:'assignmentChanged', timeMark: string, competitionMatchTeam: string|null} | {type:'stationsChanged'}` (import `TimeMarkDto` from `../../api`).
  - `useTimingWebSocket(eventId: string, handlers: {onMessage: (m: TimingWsMessage) => void, onConnect: () => void}): {status: 'CONNECTING'|'OPEN'|'RECONNECTING'}`

- [ ] **Step 1:** URL helper in `timingSocket.ts`: derive from `Config.ts`'s `VITE_API_BASE_URL` (e.g. `http://localhost:8080/api`) → `ws(s)://host/api/ws/event/{eventId}/timing` (replace `http`→`ws`, strip trailing `/api`, append path). Session token: `sessionStorage.getItem('session')` — confirm the exact key in `UserProvider.tsx` and reuse whatever accessor it exports if one exists.
- [ ] **Step 2:** Hook (complete logic): on mount create `new WebSocket(url, ['r2r', token])`; `onmessage` → `JSON.parse` → validate `type` field → `handlers.onMessage`; `onopen` → status OPEN + `handlers.onConnect()` (callers refetch state there — this covers both initial load dedup and the queue-capacity-drop reconnect requirement); `onclose`/`onerror` → schedule reconnect with exponential backoff (1s, 2s, 4s, capped 10s, with ±20% jitter), status RECONNECTING. Cleanup on unmount (close + clear timer + ignore events after cleanup via a `disposed` flag). Keep `handlers` in a ref so reconnects don't resubscribe on every render.
- [ ] **Step 3:** `npx tsc -b --noEmit` clean. Commit: `Add timing websocket hook`

---

### Task 6: Station admin UI (Posten tab in EventPage)

**Files:**
- Create: `frontend/src/components/event/timing/TimingStationTable.tsx`, `TimingStationDialog.tsx`, `TimingStationPanel.tsx`
- Modify: `frontend/src/pages/event/EventPage.tsx` (new tab `posten`)
- Modify: i18n (station admin keys under `timing.station`)

**Interfaces:**
- Consumes: station CRUD SDK fns (Task 1).
- Produces: admin CRUD for timing stations following the repo's CRUD triad EXACTLY as in `frontend/src/components/ratingCategory/` (Table wraps `EntityTable`, Dialog wraps `EntityDialog` with `react-hook-form-mui`, Panel wires them via `useEntityAdministration`).

- [ ] **Step 1:** Copy the ratingCategory triad file-by-file and adapt: columns `name`, `type` (translated via `timing.station.types.*`), `sorting`; dialog form fields: `FormInputText` for name, a select for type (mirror how other dialogs build MUI selects with react-hook-form-mui — search for `FormInputSelect` or equivalent existing component), number input for sorting. `dataRequest: getTimingStations({signal, path: {eventId}})`, add/edit/delete accordingly (note: stations API is NOT paginated — check how other non-paginated `EntityTable` usages handle that, or render a plain MUI table if `EntityTable` requires pagination; decide by reading `EntityTable`'s props and follow the closest existing example).
- [ ] **Step 2:** `EventPage.tsx`: add `'posten'` to `EVENT_TABS`, a `<Tab>` gated by `user.checkPrivilege(updateEventGlobal)` (mirror the exact privilege-gating style of the `organization` tab), and a `<TabPanel>` rendering `TimingStationPanel`. Delete-error handling: surface the 409 `StationHasTimeMarks` message via the existing `useFeedback` error path.
- [ ] **Step 3:** i18n keys (three files): `timing.station.name`, `.type`, `.sorting`, `.add`, `.edit`, `.tabTitle` ("Posten"), plus `event.tabs.posten`: de "Posten", en "Stations", da "Poster".
- [ ] **Step 4:** `npx tsc -b --noEmit` clean. Commit: `Add timing station admin tab`

---

### Task 7: Board shell — clock, status, state, live updates

**Files:**
- Modify: `frontend/src/pages/app/TimingBoardPage.tsx` (replace the Task 3 placeholder)
- Create: `frontend/src/components/timing/BoardHeader.tsx`
- Create: `frontend/src/components/timing/useTimingBoardState.ts`

**Interfaces:**
- Consumes: `getTimingState`, `useServerClock`, `useTimingWebSocket`.
- Produces: `useTimingBoardState(eventId, stationId)` returning `{marks: TimeMarkDto[], stations, refetch, wsStatus, applyLocalMark, markSaved, markFailed}` — the single state store the capture components (Tasks 8-10) mutate; and the fullscreen board page rendering `BoardHeader` (big running clock HH:MM:SS.d rendered from `useServerClock` via `requestAnimationFrame` — NOT setInterval; ws status chip; station name; sync quality indicator).

- [ ] **Step 1:** `useTimingBoardState`: `useState<TimeMarkDto[]>`; initial + reconnect load via `getTimingState` (merge by id, server wins); WS handler: `timeMarkCreated` → upsert (ignore if id already present — own optimistic entry gets confirmed instead), `timeMarkRetracted` → set status RETRACTED, `assignmentChanged` → set `assignedTeam`, `stationsChanged` → refetch stations only. `applyLocalMark(mark)` inserts an optimistic entry flagged `pending: true` (extend the type locally: `type BoardMark = TimeMarkDto & {pending?: boolean, failed?: boolean}`); `markSaved(id)` clears flags; `markFailed(id)` sets `failed`.
- [ ] **Step 2:** Board page: fullscreen layout (no scroll on the capture area, `100dvh` flex column: `BoardHeader` top, capture area middle (Task 8 fills it), mark list bottom third, scrollable). Clock: `requestAnimationFrame` loop writing into a `ref`'d element (`textContent`) to avoid re-render at 60fps; display `--:--:--` while `now()` is null.
- [ ] **Step 3:** Wire WS `onConnect` → `refetch`. Show a persistent MUI `Alert` banner when `wsStatus !== 'OPEN'` ("Verbindung wird wiederhergestellt…") and when clock quality is `DEGRADED`.
- [ ] **Step 4:** `npx tsc -b --noEmit` clean. Commit: `Add timing board shell with live state`

---

### Task 8: Two-step capture — button, keyboard, sound

**Files:**
- Create: `frontend/src/components/timing/CaptureButton.tsx`
- Create: `frontend/src/components/timing/MarkList.tsx`
- Create: `frontend/src/utils/timing/feedback.ts` (sound + vibration)
- Modify: `frontend/src/pages/app/TimingBoardPage.tsx`

**Interfaces:**
- Consumes: `useTimingBoardState`, `useServerClock`, `createTimeMark` SDK fn.
- Produces: `captureMark()` flow used verbatim by Task 9's offline queue: `const id = crypto.randomUUID(); const ts = now(); applyLocalMark(...); playCaptureFeedback(); await createTimeMark(...)` → `markSaved`/`markFailed`.

- [ ] **Step 1:** `feedback.ts` — WebAudio beep, no assets:
```ts
let ctx: AudioContext | null = null

export function playCaptureFeedback() {
    try {
        ctx = ctx ?? new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
    } catch {
        // audio unavailable — ignore
    }
    navigator.vibrate?.(80)
}
```
- [ ] **Step 2:** `CaptureButton`: one huge MUI ButtonBase (flex-grow, min 40% of viewport height, high-contrast, station-type label + flag icon), disabled with visible reason while `now() === null` (clock not synced — capture must never use a wrong clock). onPointerDown (not onClick — fire on press, not release) → capture flow above.
- [ ] **Step 3:** Keyboard: `useEffect` window `keydown` listener on the board page — Space triggers the same capture (guard: not when a dialog/input has focus — check `document.activeElement`), `preventDefault` to stop scrolling. (Digit keys / armed mode are Plan 2b — do NOT build them now.)
- [ ] **Step 4:** `MarkList`: reverse-chronological list of this station's marks: sequence number (1-based by creation order), formatted time-of-day (derived from `timestampMillis`, 0.1 s precision), status icon (pending = spinner/red, saved = green check, failed = red warning, RETRACTED = struck through), undo button per active mark → `retractTimeMark` (optimistic status change; the WS echo confirms).
- [ ] **Step 5:** `npx tsc -b --noEmit` clean. Commit: `Add two-step capture with keyboard and sound feedback`

---

### Task 9: Offline buffer (IndexedDB queue)

**Files:**
- Create: `frontend/src/utils/timing/offlineQueue.ts`
- Modify: `frontend/src/components/timing/CaptureButton.tsx` (route failures into the queue)
- Modify: `frontend/src/pages/app/TimingBoardPage.tsx` (queue status banner, drain on reconnect)

**Interfaces:**
- Produces: `class OfflineQueue { enqueue(item: PendingTimeMark): Promise<void>; drain(post: (item) => Promise<boolean>): Promise<number>; count(): Promise<number> }` where `PendingTimeMark = {id: string, eventId: string, station: string, timestampMillis: number}` — hand-rolled IndexedDB (db `r2r-timing`, store `pendingTimeMarks`, keyPath `id`), no new dependencies. Survives reload/restart by design.

- [ ] **Step 1:** Implement `offlineQueue.ts` with plain IndexedDB API (~70 lines: open with `indexedDB.open('r2r-timing', 1)`, `onupgradeneeded` creates the store, promisified get-all/put/delete). `drain` iterates all items, calls `post`, deletes on success, keeps on failure, returns remaining count.
- [ ] **Step 2:** Capture flow: on `createTimeMark` failure (network error or non-2xx) → `enqueue` + `markFailed(id)`. Drain triggers: (a) WS `onConnect`, (b) `window.addEventListener('online', ...)`, (c) every 15 s while queue non-empty. Successful drain of an item → `markSaved(id)`. Server-side UUID idempotency makes duplicate posts harmless.
- [ ] **Step 3:** Banner: while `count > 0` show warning Alert "N Zeiten noch nicht übertragen" (i18n). On board mount, also drain (covers reload-while-offline → reload-online).
- [ ] **Step 4:** `npx tsc -b --noEmit` clean. Commit: `Add offline queue for time marks`

---

### Task 10: Assignment UI

**Files:**
- Create: `frontend/src/components/timing/AssignTeamDialog.tsx`
- Modify: `frontend/src/components/timing/MarkList.tsx` (assign action + assigned display)
- Modify: i18n

**Interfaces:**
- Consumes: `getTimingTeams` (Task 2), `assignTimeMark` SDK fns; board state from Task 7.
- Produces: per-mark assign/re-assign/detach in the mark list.

- [ ] **Step 1:** `AssignTeamDialog`: MUI Dialog with an `Autocomplete` over `useFetch`-loaded teams (label: `#startNumber teamName/clubName — participantNames`, secondary line competition/match), filter by number or name; selecting → `assignTimeMark({path:{...}, body:{competitionMatchTeam: team.id}})`; a "Zuordnung lösen" (detach) button sends `{competitionMatchTeam: null}`. Optimistic update via board state; WS echo confirms.
- [ ] **Step 2:** `MarkList`: unassigned active marks get a prominent "Zuordnen" button; assigned marks show the team label (resolve from the loaded teams list) with an edit affordance reopening the dialog.
- [ ] **Step 3:** i18n keys (`timing.assign.*`). `npx tsc -b --noEmit` clean. Commit: `Add team assignment to timing board`

---

### Task 11: Build, manual browser verification, final review

- [ ] **Step 1:** `cd frontend && npm run build` — must succeed. `cd backend && ./mvnw test -q` — all green.
- [ ] **Step 2:** Manual run (controller does this in-session, not a subagent): start db + backend jar + vite (see `backend/local-dev.config` flow from the Plan-1 test run), open the browser: (a) admin → EventPage → Posten tab → create stations; (b) `/app` login → Zeitnahme → event → station → board; (c) verify: clock runs and matches server time, capture via button AND space bar creates marks with sound, marks appear on a SECOND board window in near-realtime (WS), reload loses nothing, retract strikes through, assignment picker finds the smoke-test data. Fix whatever this surfaces (small fixes inline; anything structural becomes a follow-up task).
- [ ] **Step 3:** Final whole-branch review (superpowers:requesting-code-review) over the Plan-2 commit range, most capable model. Fix Critical/Important, then commit.

---

## Not in this plan (Plan 2b / later)

- Armed mode, digit-key capture and direct-tap-per-team (armed slots, direct-tap grid) — Plan 2b, layered onto CaptureButton/MarkList.
- Start sequences + start board with countdown/audio (Plan 3).
- Leitstand, official times, penalties, timecode snapshot (Plan 4).
- Referee board re-home (Plan 5).
