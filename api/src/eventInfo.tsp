import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * Public displays ("boards") and the event info views behind `/event/{eventId}/info`.
 *
 * Beyond the HTTP routes, two websocket channels serve the displays. Both live under the
 * `/api/ws` prefix, outside the REST routes documented in this spec, and both are receive-only
 * with the server's ping/pong keepalive:
 *
 * - `/api/ws/event/{eventId}/info` - the event change channel. No auth. Carries only
 *   `{ type: "changed", marker: int64 }`: something about the event changed, refetch the
 *   display's regular endpoint. The current marker is sent once right after connecting.
 * - `/api/ws/event/{eventId}/board/{boardId}` - the per-board channel. Carries
 *   `{ type: "boardView", view: BoardViewDto }`, i.e. the complete, already rendered view -
 *   apply it directly, there is nothing left to fetch. The full view is also the first frame of
 *   every connection, so a reconnect recovers on its own. Auth is the same as the HTTP route:
 *   a session with READ BOARD or READ EVENT, or a device token for exactly this board, passed
 *   as the second subprotocol entry (`new WebSocket(url, ["r2r", token])`) because browsers
 *   cannot set headers on a handshake; non-browser clients may use the session header instead.
 *
 * A display that renders one board should prefer the second: for a livestream overlay the HTTP
 * round trip after a mere hint is the delay you can see on screen. Both are complements to, not
 * replacements for, a slow safety poll - a connection can die silently.
 *
 * The large display payloads (UpcomingCompetitionMatchInfo, RunningMatchInfo,
 * LatestMatchResultInfo, LiveMatchesDto, BoardProgramEntry, BoardViewDto, MyEventDto) are typed as
 * `unknown` here and spelled out in documentation.yaml, the file the frontend codegen reads -
 * same convention as the graphic payloads in stream.tsp.
 */

// ==========================================================================
// Models
// ==========================================================================

model BoardNameDto {
  id: uuid;
  name: string;
}

// The shareable board link. Repeatable like the station link: the same board returns the same
// link until its token is revoked. Deliberately not a TimingDeviceTokenDto - that one names a
// timing station, this one a board.
model BoardShareLinkDto {
  // Handle for revoking this link, through the same route as the station tokens
  // (deleteTimingDeviceToken).
  deviceTokenId: uuid;
  board: uuid;
  token: string;

  // Root-relative frontend path including the token (`/board/{eventId}/{boardId}?token=...`).
  // The client prepends its own origin.
  path: string;
}

// ==========================================================================
// Routes - public info views
// ==========================================================================
// upcoming-matches, running-matches, latest-match-results, live-matches, program: public, but
//   only for a PUBLISHED event - an unpublished one answers 404.
// boards, board/{boardId}: session with ReadBoardGlobal or ReadEventGlobal, OR a board device
//   token of this event (boards) / of exactly this board (board/{boardId}) in the
//   X-Timing-Device-Token header.
// my-event/{qrCode}: public (the QR code on the wristband is the credential).

@route("/event/{eventId}/info")
@tag("EventInfo")
interface EventInfoRoutes {

  @get
  @route("/upcoming-matches")
  @operationId("getUpcomingMatches")
  getUpcomingMatches(
    @path eventId: uuid,
    @query limit?: int32,
  ): unknown[];

  // `includeClarification` adds the matches currently under clarification, marked as such. It is
  // only honoured for callers with a session (ReadBoardGlobal or ReadEventGlobal) or a board
  // device token of this event; for anonymous callers it is always treated as false - a running
  // objection is not public information.
  @get
  @route("/running-matches")
  @operationId("getRunningMatches")
  getRunningMatches(
    @path eventId: uuid,
    @query limit?: int32,
    @query includeClarification?: boolean,
  ): unknown[];

  @get
  @route("/latest-match-results")
  @operationId("getLatestMatchResults")
  getLatestMatchResults(
    @path eventId: uuid,
    @query limit?: int32,
    @query competitionId?: uuid,
    @query matchId?: uuid,
  ): unknown[];

  // The "live" tab of the public results page: activated matches (PREPARING, RUNNING) together
  // with the upcoming ones. Finished matches are absent - those are results and governed by
  // Event.publicResultsVisibility through /latest-match-results.
  @get
  @route("/live-matches")
  @operationId("getLiveMatches")
  getLiveMatches(
    @path eventId: uuid,
    @query limit?: int32,
  ): unknown;

  // The whole day program from the timeline, each slot with its derived state. Carries no
  // lineups and no results.
  @get
  @route("/program")
  @operationId("getPublicProgram")
  getPublicProgram(@path eventId: uuid): unknown[];

  // Short list of the event's boards (id and name only). Any board token OF THIS EVENT is
  // accepted, because a shared screen has to find its own board before it knows its id.
  @get
  @route("/boards")
  @operationId("getPublicBoards")
  getPublicBoards(@path eventId: uuid): BoardNameDto[];

  // Everything one board needs in a single response (BoardViewDto). A token of another board, a
  // timing station token and a revoked token are all answered alike with 401.
  @get
  @route("/board/{boardId}")
  @operationId("getBoardView")
  getBoardView(
    @path eventId: uuid,
    @path boardId: uuid,
  ): unknown;

  // Personal dashboard of one participant (MyEventDto), reachable without login through the QR
  // code on the wristband.
  @get
  @route("/my-event/{qrCode}")
  @operationId("getMyEvent")
  getMyEvent(
    @path eventId: uuid,
    @path qrCode: string,
  ): unknown;
}

// ==========================================================================
// Routes - board administration (share link only; the board CRUD lives in documentation.yaml)
// ==========================================================================
// POST .../share-link: require UpdateBoardGlobal or UpdateEventGlobal

@route("/event/{eventId}/boards/{boardId}/share-link")
@tag("EventInfo")
interface BoardShareLinkRoutes {

  // Issues a device token for the board automatically and returns the finished link - the way a
  // wall-mounted screen or an OBS source gets at a board it cannot log in for. Mirrors
  // createTimingStationShareLink down to the rule: as long as an automatically issued, unrevoked
  // token exists for the board, every call returns the SAME link; revoking it makes the next call
  // issue a fresh one.
  @post
  @operationId("createBoardShareLink")
  createBoardShareLink(
    @path eventId: uuid,
    @path boardId: uuid,
  ): BoardShareLinkDto;
}
