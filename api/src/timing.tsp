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

// ==========================================================================
// Routes - event-scoped
// ==========================================================================
// GET /state, GET /stations, GET /teams: require UpdateAppTimingGlobal OR ReadEventGlobal
// POST /stations, PUT /stations/{id}, DELETE /stations/{id}: require UpdateEventGlobal
// POST /timeMarks, PUT /timeMarks/{id}/retract, PUT /timeMarks/{id}/assignment: require UpdateAppTimingGlobal OR UpdateEventGlobal

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
