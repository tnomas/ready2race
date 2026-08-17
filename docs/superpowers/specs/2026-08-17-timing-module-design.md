# Design: Race Timing Module (Zeitnahme)

Date: 2026-08-17
Status: Draft for review

## Goal

Replace the external timing workflow (and its CSV export/import) with a built-in
timing module. Timekeepers stop times on one or more devices (start, splits, finish),
all boards update in near-realtime, and final times flow directly into the existing
results and referee-approval flow.

Reference: the 2026 regatta was timed with an external service (wave starts, 2
splits, finish, multiple devices). That season showed what the operation needs
from a timing module: client-side timestamping, NTP-light clock sync, two-step
finish capture and undo-as-history. Its pain point (export/import) disappears
with integration.

## Core principles

1. **No timestamp is ever lost.** Time marks are an append-only log. Undo and delete
   are status changes; physical deletion only via an explicit "delete times" action
   in the control board (Leitstand).
2. **Capture is local, network is only distribution.** A timestamp is taken on the
   device at the moment of the tap (device clock + server offset). Persisting and
   broadcasting happen asynchronously and never block capture.
3. **The server clock is the single time reference.** Devices calibrate via
   NTP-light HTTP roundtrips (lowest observed latency wins; drift > 300 ms triggers
   recalibration). Display resolution 0.1 s; storage in milliseconds.
4. **Integration, not import.** Start lists come from `competitionExecution`; final
   times are written to the existing `timecode` table on `competition_match_team`,
   feeding the existing places calculation and referee approval unchanged.
5. **Timestamps are raw material; official times exist only in the Leitstand.**
   Start/split/finish boards purely capture and assign time marks. Computed or
   manually overridden official times are a separate layer, managed in the Leitstand.
6. **Refresh never hurts.** All board state is server-derived. Opening a board is
   taking over the Posten; reload, close/reopen, or a
   replacement device continue seamlessly.

## Posten concept (frontend)

New event area **"Posten"** — the shared pattern for all privileged positions
(Zeitnahme now; Schiedsrichter moves in as part of this work, Livestream and
Sprecherinnen later, the latter on a parallel branch). Event admins configure
timing stations and assign app users to Posten. Boards open as dedicated
full-screen work views (own route, new window, no app chrome). Auth uses the
existing app-user login; every time mark records who captured it.

The existing referee working view (Wettkampf-Check / result verification) is
re-homed as the **Schiedsrichter board** under the Posten area: same entry
pattern as the timing boards, unchanged approval logic. This establishes the
Posten area as the single entry point for all on-site positions.

### Boards (v1)

- **Start board** — runs *start sequences*:
  - Modes: `MASS` (one signal starts the whole wave) and `INTERVAL` (time trial:
    one team every N seconds, N configurable, running through until a defined end —
    end of wave or beyond).
  - Arm sequence → countdown runs server-driven with acoustic signals and large
    visual feedback (next starter prominently displayed, on a dedicated
    countdown view). Multiple devices render the same countdown in sync (athlete
    display next to starter device), derived from shared sequence state + clock
    offset.
  - Exception handling: skip (no-show), abort, manual tap fallback. Actual start
    marks are created by the sequence; every start is still a time mark in the log.
- **Split/finish board** — capture-only:
  - Primary mode: **two-step** — a large "mark time" button banks an unassigned
    time mark with a running number; assignment to a team happens afterwards from
    the list of expected (started, not yet passed) teams.
  - Also: direct tap per team, undo (status change), history view.
  - **Keyboard capture** (laptop operation): Space bar banks an unassigned mark
    (two-step). Digit keys capture directly for a visible team slot. An
    **armed mode**: the operator arms teams in
    expected arrival order; each armed slot gets its own color-coded key
    (A, B, C, … in arming order) that fires the mark for exactly that team.
    Keystrokes use the same local-timestamp path as taps.
- **Leitstand (control board)** —
  - Live view of all marks and assignments across stations; device status
    (connected, last sync).
  - Assignment management: detach, re-attach to another team, map so-far-unassigned
    marks. Assignments always reference `competition_match_team` UUIDs.
  - Manual time overrides (with audit trail) — the only place where official times
    are edited.
  - Penalties, DNS/DNF/DSQ, explicit "delete times", trigger result computation.

### Live updates

- New rounds/Läufe created in R2R (when a previous round is approved) appear on all
  boards automatically via the event WebSocket channel — no page refresh.
- Reconnect or page load performs a full state refetch via REST; the WS channel is
  only a change feed.

## Data model (new tables)

- `timing_station` — per event: name, type `START | SPLIT | FINISH`, order.
- `timing_time_mark` — **append-only log**: client-generated UUID (idempotency),
  event, station, source (`APP_USER | HARDWARE`), app user or hardware device
  reference, timestamp (ms, server clock), status `ACTIVE | RETRACTED`,
  created_at. The time value is never updated.
- `timing_assignment` — mutable mapping: time mark ↔ `competition_match_team`
  (UUID) + station context. Created, detached, re-attached freely; changes are
  audit-logged. Unassigned marks are first-class.
- `timing_start_sequence` / `timing_start_sequence_entry` — sequence: station,
  mode `MASS | INTERVAL`, interval seconds, state
  `ARMED | RUNNING | DONE | ABORTED`, started_at; entries: team/wave reference,
  planned time, actual start mark reference, status `PENDING | STARTED | SKIPPED`.
- `timing_official_time` — the Leitstand layer: per
  `competition_match_team`, computed value (finish − start, penalties applied)
  or manual override, with source and audit trail.

### Result flow & decoupling on approval

- Result computation writes the official time into the existing `timecode` table
  on `competition_match_team` → existing places calculation and referee approval
  remain unchanged.
- **Approval freezes results.** The written `timecode` is a snapshot copy. After
  referee approval, changes in the timing module have no effect on approved
  results. Post-approval edits mark affected teams as "dirty" for visibility in
  the Leitstand but never propagate automatically; correcting an approved result
  requires the existing revoke/re-approve path.

## Realtime & sync

- **Writes via REST** (consistent with all other mutations), **fanout via Ktor
  WebSocket** `/ws/timing/{eventId}`: one channel per event. Broadcast messages:
  `time_mark_created`, `time_mark_retracted`, `assignment_changed`,
  `official_time_changed`, `sequence_state_changed`, `round_added`,
  `times_deleted`, device presence.
- **Clock sync endpoint**: POST returning server time in ms. Clients poll every
  5 s, keep the offset from the lowest-latency roundtrip, recalibrate on drift
  > 300 ms. Tap timestamps = device clock +
  offset, using a monotonic source (`performance.now()`-based) to be immune to
  wall-clock jumps.
- **Offline buffer**: outgoing writes queue in IndexedDB with retry/backoff
  (survives reboot/battery death). Per-mark UI status: saved (green) / pending
  (red). Client UUIDs make retries idempotent; the server deduplicates.
- WS reconnect → full state refetch via REST (no event replay needed).

## Failure handling

- **Device failure** (battery, crash): everything captured while online is already
  on the server; the IndexedDB buffer survives restarts and syncs when the device
  returns. A replacement device opens the same Posten board and continues — the
  running sequence lives server-side.
- **Double tap**: two marks exist; one is retracted (stays in the log).
- **Assignment conflict** (two devices assign the same mark/team): last write
  wins; the Leitstand shows history and corrects.
- **Server restart**: sequence state is in the DB; clients reconnect and refetch;
  running countdowns continue from `started_at` + interval.

## Testing

- Unit: official-time/penalty computation, sequence state machine, clock-offset
  logic incl. simulated drift.
- Integration: Ktor tests for REST endpoints and WS broadcast (existing test
  infrastructure).
- Pre-event manual drill: multi-device run with deliberately wrong device clocks
  and forced network interruption.

## Hardware triggers (prepared in v1, added incrementally)

Arduino-based triggers (buzzers first, later possibly light barriers) will be
added step by step. v1 prepares for them without building them:

- Time marks carry a `source` (`APP_USER | HARDWARE`); the capture API is
  device-agnostic — a hardware trigger POSTs the same idempotent time-mark
  payload as a board.
- Hardware devices authenticate with a station-scoped device token (issued in
  the Leitstand), not an app-user session.
- Hardware devices use the same clock-sync endpoint (NTP-light roundtrips) to
  timestamp locally, so triggers behave identically to boards: capture locally,
  deliver asynchronously.
- Marks from hardware appear on boards and Leitstand like any other mark
  (assignment, undo, audit all identical).

## Out of scope (v1)

- Lap races / automatic lap counting (data model permits adding later).
- The hardware trigger devices themselves (firmware, gateway) — only the API
  surface above is built in v1.
- Livestream and Sprecherinnen boards (same Posten pattern, separate work).
- Full-offline PWA operation (v1 buffers short outages; initial load needs
  connectivity).
