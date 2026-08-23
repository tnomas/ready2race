import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * Live timing: stations capture time marks (start/split/finish), which are then assigned to a
 * competition match team to produce a result.
 *
 * In addition to the HTTP routes below, timing state changes are pushed over a websocket channel:
 *
 * - Path: `/api/ws/event/{eventId}/timing` (note the `/api/ws` prefix - this channel lives outside
 *   the regular `/api` REST routes documented in this spec).
 * - Auth: browsers cannot set custom headers on a websocket handshake, so the session token is
 *   passed as the second entry of the `Sec-WebSocket-Protocol` header: connect with
 *   `new WebSocket(url, ["r2r", sessionToken])`. Non-browser clients may instead send the usual
 *   session header/cookie and omit the subprotocol.
 * - Messages are JSON objects discriminated by a `type` field, mirroring `TimingWsMessage`:
 *   - `{ type: "timeMarkCreated", mark: TimeMarkDto }`
 *   - `{ type: "timeMarkRetracted", id: uuid }`
 *   - `{ type: "assignmentChanged", timeMark: uuid, competitionMatchTeam: uuid | null }` -
 *     `competitionMatchTeam` is always present, even when `null` (a detach), so clients can
 *     distinguish "no assignment" from a field that was never sent.
 *   - `{ type: "stationsChanged" }` - stations were added, edited, or removed; refetch
 *     `GET /event/{eventId}/timing/stations` (or `/timing/state`).
 *   - `{ type: "sequenceChanged", sequence: TimingSequenceDto }` - a start sequence (see below) was
 *     created, started, aborted, had an entry fire or get skipped, or completed. Boards watching
 *     that sequence's station should replace their local copy with `sequence`.
 * - The channel is receive-only: clients should ignore any data they send on it and rely on the
 *   server's ping/pong keepalive.
 * - On (re)connect, clients should always fetch `GET /event/{eventId}/timing/state` first and
 *   only then start applying incoming messages, to cover updates missed while disconnected.
 */

// ==========================================================================
// Models
// ==========================================================================

enum TimingStationType {
  START;
  SPLIT;
  FINISH;
}

model TimingStationDto {
  id: uuid;
  event: uuid;
  name: string;
  type: TimingStationType;
  sorting: int32;
}

model TimingStationRequest {
  name: string;
  type: TimingStationType;
  sorting: int32;
}

model TimeMarkDto {
  id: uuid;
  event: uuid;
  station: uuid;
  timestampMillis: int64;
  source: string; // "APP_USER" | "HARDWARE"
  status: string; // "ACTIVE" | "RETRACTED" - retracted marks stay in the state, never deleted
  createdBy?: uuid;
  assignedTeam?: uuid; // competition_match_team, if this mark has been assigned to a team
}

model CreateTimeMarkRequest {
  // Client-generated id: capturing the same id twice (e.g. an app retrying after a dropped
  // response) is idempotent and creates only one time mark.
  id: uuid;
  station: uuid;
  timestampMillis: int64;
}

model AssignTimeMarkRequest {
  // Omit or set to `null` to detach the time mark from any team.
  competitionMatchTeam?: uuid;
}

model TimingStateDto {
  stations: TimingStationDto[];
  timeMarks: TimeMarkDto[];
}

model ServerTimeResponse {
  serverTimeMillis: int64;
}

model TimingTeamDto {
  competitionMatchTeam: uuid;
  startNumber?: int32;
  teamName?: string;
  clubName?: string;
  participantNames: string[];
  competitionName?: string;
  matchName?: string;
}

enum SequenceMode {
  MASS;
  INTERVAL;
}

enum SequenceState {
  ARMED;
  RUNNING;
  DONE;
  ABORTED;
}

enum SequenceEntryStatus {
  PENDING;
  STARTED;
  SKIPPED;
}

model TimingSequenceEntryDto {
  id: uuid;
  competitionMatchTeam: uuid;
  position: int32;
  status: SequenceEntryStatus;

  // Wall-clock instant (server epoch millis) this entry is scheduled to fire at, or absent while
  // the sequence has not been started yet.
  plannedStartMillis?: int64;
  timeMark?: uuid;
}

model TimingSequenceDto {
  id: uuid;
  event: uuid;
  station: uuid;
  mode: SequenceMode;

  // Only ever set for mode INTERVAL.
  intervalMillis?: int64;

  // Countdown before the first entry fires, in milliseconds, counted from startedAtMillis. Gives
  // clients room to run a countdown (with beeps) before anything actually starts.
  leadInMillis: int64;
  state: SequenceState;
  startedAtMillis?: int64;
  entries: TimingSequenceEntryDto[];
}

model CreateSequenceRequest {
  station: uuid;
  mode: SequenceMode;

  // Required (and must be >= 1000) for mode INTERVAL; ignored for MASS.
  intervalMillis?: int64;

  // Ordered: index in this list becomes the entry position and therefore the start slot.
  teams: uuid[];

  // Countdown before the first entry fires, in milliseconds. When absent, defaults to
  // intervalMillis for mode INTERVAL (one full cadence) or 10000 for MASS. When given, must be
  // between 3000 and 600000.
  leadInMillis?: int64;
}

// A station without an armed or running sequence is the normal case (the board then shows its
// setup form), not a missing resource - hence `sequence` being absent rather than a 404.
//
// `sequence` is not limited to ARMED/RUNNING: if the station has none of those, the most recently
// finished (DONE/ABORTED) sequence is returned instead, as long as it finished within the last 10
// minutes. This lets a client that reconnects (or missed the terminal websocket broadcast) still
// render the outcome of a run that just ended, instead of seeing nothing at all.
model ActiveSequenceDto {
  sequence?: TimingSequenceDto;
}

enum OfficialTimeResultStatus {
  NONE;
  DNS;
  DNF;
  DSQ;
}

// One row of the Leitstand's result table. `startMillis`/`finishMillis` are resolved live from the
// team's currently assigned, non-retracted marks (not stored); `effectiveMillis` is the value a
// push would write - `(overrideMillis ?? computedMillis) + penaltyMillis`, or absent when there is
// no base time or when `resultStatus` is not `NONE`.
model OfficialTimeDto {
  competitionMatchTeam: uuid;
  event: uuid;
  startMillis?: int64;
  finishMillis?: int64;
  computedMillis?: int64;
  overrideMillis?: int64;
  penaltyMillis: int64;
  resultStatus: OfficialTimeResultStatus;
  effectiveMillis?: int64;
  dirty: boolean;
  pushedAt?: dateTime;
  // Der Platz, wie er aktuell am Lauf steht - von der Übernahme aus den Zeiten abgeleitet
  // (Gleichstände teilen sich den Platz) oder von Hand gesetzt; vorläufig, solange der Lauf läuft.
  place?: int32;
}

enum OfficialTimeSkipReason {
  // Marks exist, but none on a START station - the difference cannot be formed.
  NO_START_MARK;
  // Started but not finished yet (or the finish mark was retracted).
  NO_FINISH_MARK;
  // The finish mark lies before the start mark - the marks are wrong, not the team.
  NEGATIVE_DURATION;
  // `teams` named this id explicitly, but it has no marks at all - there is nothing to compute.
  NO_MARKS;
}

model OfficialTimeSkipDto {
  competitionMatchTeam: uuid;
  reason: OfficialTimeSkipReason;
}

model OfficialTimeComputeResultDto {
  computed: OfficialTimeDto[];
  skipped: OfficialTimeSkipDto[];
}

// Which teams to recompute. Absent or omitted recomputes the whole event.
model ComputeOfficialTimesRequest {
  teams?: uuid[];
}

// PUT semantics: every field is replaced - an absent `overrideMillis` clears a previous override,
// an absent `penaltyMillis` resets the penalty to 0, and an absent `resultStatus` resets it to
// `NONE`.
model OfficialTimeOverrideRequest {
  overrideMillis?: int64;
  penaltyMillis?: int64;
  resultStatus?: OfficialTimeResultStatus;
}

enum PushConflictReason {
  // The team's result is already recorded in the results flow (a place was entered, or places
  // were calculated) - overridable with `force`.
  RESULT_FROZEN;
  // Neither a computed nor an overridden time, and no DNS/DNF/DSQ status - nothing to write.
  NO_EFFECTIVE_TIME;
}

model OfficialTimePushConflictDto {
  competitionMatchTeam: uuid;
  reason: PushConflictReason;
}

// `force` only overrides the RESULT_FROZEN conflict; a team without an effective time can never be
// pushed because there is nothing to write. Forcing only replaces the timecode (and failed/
// failedReason) of an already-frozen team - it does NOT recalculate places. After a forced push,
// a referee has to re-save that match's results for the place to reflect the pushed time.
model PushOfficialTimesRequest {
  teams: uuid[];
  force?: boolean;
}

// The ids the explicit "delete times" action physically removed.
model DeletedTimeMarksDto {
  timeMarks: uuid[];
}

// Metadata of a hardware device token. Deliberately carries neither the token nor its hash.
model TimingDeviceTokenDto {
  id: uuid;
  event: uuid;
  station: uuid;
  name: string;
  revoked: boolean;
  createdAt: dateTime;
}

// Response of an issue call: the only moment the plaintext `token` exists outside the device. Only
// its hash is stored, so a lost token cannot be recovered - it has to be revoked and reissued.
model TimingDeviceTokenIssuedDto {
  deviceToken: TimingDeviceTokenDto;
  token: string;
}

model TimingDeviceTokenRequest {
  name: string;
  station: uuid;
}

// ==========================================================================
// Routes - event-scoped
// ==========================================================================
// GET /state, GET /stations, GET /teams: require UpdateAppTimingGlobal OR ReadEventGlobal
//   These reads (and GET /sequences/active plus the websocket) alternatively accept an
//   `X-Timing-Device-Token` header instead of a session: shared station links (capture board,
//   start display) carry the device token in their URL and read the whole event's timing state.
//   Event-bound only (`validateForEvent`) - the station binding stays a write-side concern of
//   POST /timeMarks. The branch is only taken when the header is present AND no session exists.
// POST /stations, PUT /stations/{id}, DELETE /stations/{id}: require UpdateEventGlobal
// POST /timeMarks, PUT /timeMarks/{id}/retract, PUT /timeMarks/{id}/assignment: require UpdateAppTimingGlobal OR UpdateEventGlobal
//   POST /timeMarks alternatively accepts an `X-Timing-Device-Token` header instead of a session -
//   see createTimeMark below. That branch is only taken when the header is present AND no session
//   exists; a logged-in user's request always takes the ordinary privilege-checked path.
// DELETE /timeMarks/retracted: require UpdateEventGlobal
// GET /sequences/active: require UpdateAppTimingGlobal OR UpdateEventGlobal OR ReadEventGlobal (or device token, see above)
// POST /sequences, POST /sequences/{id}/start|abort, POST /sequences/{id}/entries/{id}/skip: require UpdateAppTimingGlobal OR UpdateEventGlobal
// GET /officialTimes: require UpdateAppTimingGlobal OR ReadEventGlobal
// POST /officialTimes/compute, PUT /officialTimes/{id}, POST /officialTimes/push: require UpdateEventGlobal
// GET /deviceTokens, POST /deviceTokens, DELETE /deviceTokens/{id}: require UpdateEventGlobal

@route("/event/{eventId}/timing")
@tag("Timing")
interface TimingRoutes {

  @get
  @route("/state")
  @operationId("getTimingState")
  getTimingState(@path eventId: uuid): TimingStateDto;

  @get
  @route("/stations")
  @operationId("getTimingStations")
  listTimingStations(@path eventId: uuid): TimingStationDto[];

  @get
  @route("/teams")
  @operationId("getTimingTeams")
  listTimingTeams(@path eventId: uuid): TimingTeamDto[];

  @post
  @route("/stations")
  @operationId("createTimingStation")
  createTimingStation(
    @path eventId: uuid,
    @body request: TimingStationRequest,
  ): Created;

  @put
  @route("/stations/{stationId}")
  @operationId("updateTimingStation")
  updateTimingStation(
    @path eventId: uuid,
    @path stationId: uuid,
    @body request: TimingStationRequest,
  ): void;

  @delete
  @route("/stations/{stationId}")
  @operationId("deleteTimingStation")
  deleteTimingStation(
    @path eventId: uuid,
    @path stationId: uuid,
  ): void;

  // Accepts either a normal session with UpdateAppTimingGlobal or UpdateEventGlobal, OR an
  // `X-Timing-Device-Token` header identifying a hardware timing device that cannot hold a
  // session (see the header note in the auth matrix above). A device token binds the capture to
  // its own station: it can never write marks for a different station than the one it was issued
  // for. Marks captured this way are recorded with `source: "HARDWARE"` and no `createdBy`.
  @post
  @route("/timeMarks")
  @operationId("createTimeMark")
  createTimeMark(
    @path eventId: uuid,
    @body request: CreateTimeMarkRequest,
  ): Created;

  @put
  @route("/timeMarks/{timeMarkId}/retract")
  @operationId("retractTimeMark")
  retractTimeMark(
    @path eventId: uuid,
    @path timeMarkId: uuid,
  ): void;

  @put
  @route("/timeMarks/{timeMarkId}/assignment")
  @operationId("assignTimeMark")
  assignTimeMark(
    @path eventId: uuid,
    @path timeMarkId: uuid,
    @body request: AssignTimeMarkRequest,
  ): void;

  @post
  @route("/sequences")
  @operationId("createTimingSequence")
  createTimingSequence(
    @path eventId: uuid,
    @body request: CreateSequenceRequest,
  ): Created;

  @get
  @route("/sequences/active")
  @operationId("getActiveTimingSequence")
  getActiveTimingSequence(
    @path eventId: uuid,
    @query stationId: uuid,
  ): ActiveSequenceDto;

  @post
  @route("/sequences/{sequenceId}/start")
  @operationId("startTimingSequence")
  startTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  @post
  @route("/sequences/{sequenceId}/abort")
  @operationId("abortTimingSequence")
  abortTimingSequence(
    @path eventId: uuid,
    @path sequenceId: uuid,
  ): void;

  @post
  @route("/sequences/{sequenceId}/entries/{entryId}/skip")
  @operationId("skipTimingSequenceEntry")
  skipTimingSequenceEntry(
    @path eventId: uuid,
    @path sequenceId: uuid,
    @path entryId: uuid,
  ): void;

  @delete
  @route("/timeMarks/retracted")
  @operationId("deleteRetractedTimeMarks")
  deleteRetractedTimeMarks(
    @path eventId: uuid,
    @query station?: uuid,
  ): DeletedTimeMarksDto;

  @get
  @route("/officialTimes")
  @operationId("getOfficialTimes")
  getOfficialTimes(@path eventId: uuid): OfficialTimeDto[];

  @post
  @route("/officialTimes/compute")
  @operationId("computeOfficialTimes")
  computeOfficialTimes(
    @path eventId: uuid,
    @body request: ComputeOfficialTimesRequest,
  ): OfficialTimeComputeResultDto;

  @put
  @route("/officialTimes/{competitionMatchTeamId}")
  @operationId("setOfficialTimeOverride")
  setOfficialTimeOverride(
    @path eventId: uuid,
    @path competitionMatchTeamId: uuid,
    @body request: OfficialTimeOverrideRequest,
  ): void;

  // See PushOfficialTimesRequest.force: a forced push never recalculates places, only the
  // timecode snapshot - a referee must re-save the match's results afterwards for the place to
  // reflect the pushed time.
  @post
  @route("/officialTimes/push")
  @operationId("pushOfficialTimes")
  pushOfficialTimes(
    @path eventId: uuid,
    @body request: PushOfficialTimesRequest,
  ): void;

  @get
  @route("/deviceTokens")
  @operationId("listTimingDeviceTokens")
  listTimingDeviceTokens(@path eventId: uuid): TimingDeviceTokenDto[];

  @post
  @route("/deviceTokens")
  @operationId("issueTimingDeviceToken")
  issueTimingDeviceToken(
    @path eventId: uuid,
    @body request: TimingDeviceTokenRequest,
  ): TimingDeviceTokenIssuedDto;

  @delete
  @route("/deviceTokens/{tokenId}")
  @operationId("revokeTimingDeviceToken")
  revokeTimingDeviceToken(
    @path eventId: uuid,
    @path tokenId: uuid,
  ): void;
}

// ==========================================================================
// Routes - global, unauthenticated
// ==========================================================================

@route("/timing/serverTime")
@tag("Timing")
interface TimingGlobalRoutes {

  // Used by clients to measure and correct their local clock's offset against the server
  // before capturing time marks. Deliberately unauthenticated - it is safe to expose and
  // needs to be reachable before a session even exists.
  @post
  @operationId("getServerTime")
  getServerTime(): ServerTimeResponse;
}
