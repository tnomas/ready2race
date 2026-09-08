import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * Livestream overlay: scenes hold a background, a safe area and a set of graphics (startlist,
 * clock, laps, result, finish ticker, next up, schedule, course image), each placed at one of a
 * few named anchor points. The control panel can force a graphic on/off (override) regardless of
 * what the automatic rules would show, and toggle a trial mode so an operator can rehearse the
 * stage without it looking like a live moment.
 *
 * `GET .../view` answers the resolved scene state (StreamSceneViewDto): the server decides what
 * is on air, not the browser. The very same payload is pushed over the scene's websocket channel
 * `/api/ws/event/{eventId}/stream/{sceneId}`, mirroring the board channel documented in
 * eventInfo.tsp: receive-only, full state as the first frame, auth identical to the HTTP route,
 * messages `{ type: "streamSceneView", view: StreamSceneViewDto }`. Pushes come from the event's
 * change marker (start, split, finish, state change, sequence start), from every write on the
 * scene itself, and from a timer for the auto-out windows and override expiries the resolver
 * announces - no polling anywhere.
 *
 * Auth for `GET .../view`: a session with READ STREAM or READ EVENT, OR a device token issued for
 * EXACTLY THIS scene in the X-Timing-Device-Token header (see createStreamSceneShareLink) - same
 * shape as the board's HTTP twin (getBoardView in eventInfo.tsp). The token branch only applies
 * when the header is present AND no session exists; a logged-in user always takes the
 * privilege-checked path. A sceneId that exists but belongs to another event answers 404, same as
 * an unknown one - true for every scene-addressed route below, not only `view`.
 */

enum StreamGraphicType {
  STARTLIST;
  CLOCK;
  LAPS;
  RESULT;
  FINISH_TICKER;
  NEXT_UP;
  SCHEDULE;
  COURSE_IMAGE;
}

// Named anchor point on the stage - deckungsgleich mit stream_scene_graphic.placement. Which of
// these are offered per graphic type is a service-side rule (allowedPlacements), not part of this
// spec.
enum StreamPlacement {
  BOTTOM_CENTER;
  BOTTOM_LEFT;
  BOTTOM_RIGHT;
  TOP_LEFT;
  TOP_RIGHT;
  SIDE_LEFT;
  SIDE_RIGHT;
  FULL_CENTER;
}

enum StreamGraphicSize {
  COMPACT;
  NORMAL;
}

enum StreamBackground {
  TRANSPARENT;
  CHROMA;
}

// Phase of the synthetic demo race in trial mode, in the order of a real race. The control
// panel steps through them by hand (setStreamSceneTrialPhase); nothing advances on its own.
// Every display window (startlist, splits, result) runs from the moment the phase was set, so
// setting the same phase again re-triggers it.
enum StreamTrialPhase {
  PREPARING;
  COUNTDOWN;
  RUNNING;
  SPLIT;
  FINISH;
  FINISHED;
  RESULT;
  IDLE;
}

// AUTO exists only here and in the API - it means "no row in stream_override", not "a row with
// value AUTO".
enum StreamOverrideState {
  AUTO;
  FORCED_ON;
  FORCED_OFF;
}

// Mirrors the `settings` jsonb of stream_scene_graphic - only the fields belonging to the
// graphic's own type are set, the rest stay absent. Unknown fields are ignored on read, so a
// later removed field never breaks deserializing an old row.
model StreamGraphicSettings {
  // LAPS (default 8), RESULT (default 20), STARTLIST (default 15): how long the graphic stays
  // visible, in seconds.
  displaySeconds?: int32;

  // SCHEDULE: number of rows shown, default 8.
  listLength?: int32;

  // COURSE_IMAGE: reference to the stored course image document.
  imageDocument?: uuid;
}

// One graphic's configuration row within a scene - at most one per scene and type.
model StreamSceneGraphicDto {
  type: StreamGraphicType;
  enabled: boolean;
  placement: StreamPlacement;
  size: StreamGraphicSize;
  settings: StreamGraphicSettings;
}

model StreamSceneDto {
  id: uuid;
  event: uuid;
  name: string;
  background: StreamBackground;

  // Only set for background CHROMA.
  chromaColor?: string;
  safeAreaPercent: int32;
  trialMode: boolean;

  // The chosen demo-race phase; only meaningful while trialMode is on, stored regardless.
  trialPhase: StreamTrialPhase;
  graphics: StreamSceneGraphicDto[];
}

// Body of createStreamScene/updateStreamScene - the graphics configuration goes through
// updateStreamSceneGraphics instead.
model StreamSceneRequest {
  name: string;

  // Defaults to TRANSPARENT.
  background?: StreamBackground;

  // Required to be a hex color (#RGB or #RRGGBB) when background is CHROMA.
  chromaColor?: string;

  // 0..100, defaults to 0.
  safeAreaPercent?: int32;
}

// Body of updateStreamSceneGraphics - one call may carry any subset of the eight graphic types,
// not necessarily all of them. Every row is validated against its type's allowed placements
// BEFORE anything is written; a single disallowed placement rejects the whole call.
model StreamSceneGraphicsRequest {
  graphics: StreamSceneGraphicDto[];
}

// Director intervention from the control panel; match/seconds stay absent when not set.
// state=AUTO is equivalent to clearStreamOverride (no row = AUTO).
model StreamOverrideRequest {
  state: StreamOverrideState;

  // Content choice ("result of match 12"); absent = most recent/current content.
  match?: uuid;

  // Auto-out of the manual override in seconds; absent = no automatic fallback to AUTO.
  seconds?: int32;
}

// One finish on the FINISH_TICKER band, in the order the boats crossed the line.
model StreamFinishEntry {
  rank: int32;
  startNumber: int32;
  clubsShort?: string;
  clubsFull?: string;
  timeString: string;
}

// The resolved state of a single graphic. At most one of the content payloads is set, depending
// on `type`. The payloads reuse the existing display DTOs (AthleteBoardMatch/AthleteBoardResult),
// which eventInfo.tsp does not model - they are typed as `unknown` here and spelled out in
// documentation.yaml, the file the frontend codegen actually reads.
model StreamGraphicViewDto {
  type: StreamGraphicType;
  placement: StreamPlacement;
  size: StreamGraphicSize;

  // Whether the graphic is on air right now - a configured graphic can be off at this moment.
  visible: boolean;

  visibleSince?: dateTime;

  // Timer for fading out; absent while no end is due.
  visibleUntil?: dateTime;

  overrideState: StreamOverrideState;

  // STARTLIST/CLOCK/LAPS/NEXT_UP: an AthleteBoardMatch.
  match?: unknown;

  // RESULT: an AthleteBoardResult.
  result?: unknown;

  // RESULT: the match is under clarification - the result still goes out, marked provisional.
  provisional?: boolean;

  finishEntries?: StreamFinishEntry[];

  // SCHEDULE: AthleteBoardMatch entries.
  schedule?: unknown[];

  // COURSE_IMAGE: root-relative address of the image, served by getStreamSceneCourseImage
  // (`/api/event/{eventId}/stream/{sceneId}/courseImage`). The stage fetches it with the same
  // credentials as `/view` - a plain <img> would not carry the scene token.
  imageUrl?: string;

  // CLOCK: countdown anchor of the running start sequence.
  sequenceStartedAt?: dateTime;

  // CLOCK: instant the start signal falls (sequence anchor plus its configured lead-in) - absent
  // unless a start sequence is currently running. The countdown counts down TO this, as opposed
  // to sequenceStartedAt, which it used to (wrongly) count up FROM.
  sequenceFiresAt?: dateTime;

  // CLOCK: start of the sequence's CURRENT pause - only present while it is paused. The stage
  // freezes the countdown at the remainder as of this instant (sequenceFiresAt minus
  // sequencePausedAt, a pure server-time difference); resuming shifts sequenceFiresAt by exactly
  // the pause duration, so the frozen value continues seamlessly.
  sequencePausedAt?: dateTime;
}

// The resolved scene state a stage renders - see the class doc above for the websocket channel
// that pushes exactly this payload.
model StreamSceneViewDto {
  sceneId: uuid;
  background: StreamBackground;

  // Only set for background CHROMA.
  chromaColor?: string;

  safeAreaPercent: int32;

  // Trial mode: the state is fed by a synthetic demo race, no real data is touched.
  trialMode: boolean;

  // The demo-race phase currently shown - absent unless trialMode is on.
  trialPhase?: StreamTrialPhase;

  // Server clock at resolution time, for the stage's clock correction.
  serverTime: dateTime;

  graphics: StreamGraphicViewDto[];
}

// Coarse state of a match for the control panel's match picker - deliberately just these three,
// not the full match-state machine the referee dashboard uses.
enum StreamPickerMatchState {
  UPCOMING;
  RUNNING;
  FINISHED;
}

// One match of the event's day for the control panel's match picker (getStreamPickerMatches) -
// decomposed name parts rather than one joined label, same shape as LiveMatchInfo (eventInfo.tsp),
// so the panel can build its own label.
model StreamPickerMatchDto {
  matchId: uuid;
  competitionName: string;
  categoryName?: string;
  roundName?: string;
  matchName?: string;

  // Scheduled start; absent for a match without one yet.
  startTime?: dateTime;
  state: StreamPickerMatchState;
}

// The shareable scene link, word for word like BoardShareLinkDto (eventInfo.tsp isn't kept in
// sync closely enough to reference it directly - see the class doc there): Wirecast/OBS cannot
// log in, so it gets the same shared link with device token as a board display. Repeatable: the
// same scene returns the same link until its token is revoked.
model StreamSceneShareLinkDto {
  // Handle for revoking this link, through the same route as the other device tokens
  // (deleteTimingDeviceToken).
  deviceTokenId: uuid;
  scene: uuid;
  token: string;

  // Root-relative frontend path including the token query parameter
  // (`/event/{eventId}/stream/{sceneId}?token=...`). The client prepends its own origin.
  path: string;
}

// ==========================================================================
// Routes
// ==========================================================================
// GET /event/{eventId}/stream: require ReadStreamGlobal OR ReadEventGlobal
// POST /event/{eventId}/stream: require UpdateStreamGlobal OR UpdateEventGlobal
// GET /event/{eventId}/stream/matches: require ReadStreamGlobal OR ReadEventGlobal
// PUT/DELETE /event/{eventId}/stream/{sceneId}: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT /event/{eventId}/stream/{sceneId}/graphics: require UpdateStreamGlobal OR UpdateEventGlobal
// POST /event/{eventId}/stream/{sceneId}/shareLink: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT/DELETE /event/{eventId}/stream/{sceneId}/override/{graphicType}: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT /event/{eventId}/stream/{sceneId}/trialMode: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT /event/{eventId}/stream/{sceneId}/trialPhase: require UpdateStreamGlobal OR UpdateEventGlobal
// GET /event/{eventId}/stream/{sceneId}/view: require ReadStreamGlobal OR ReadEventGlobal, OR a
//   scene device token (see the class doc above).

@route("/event/{eventId}/stream")
@tag("Stream")
interface StreamRoutes {

  @get
  @operationId("getStreamScenes")
  getStreamScenes(@path eventId: uuid): StreamSceneDto[];

  // The day's matches for the control panel's match picker, including finished ones - unlike the
  // public /info/live-matches, which drops a match the moment it is finished. Always includes
  // finished results regardless of the event's public results visibility: this is an admin
  // surface, not the public results page.
  @get
  @route("/matches")
  @operationId("getStreamPickerMatches")
  getStreamPickerMatches(@path eventId: uuid): StreamPickerMatchDto[];

  @post
  @operationId("createStreamScene")
  createStreamScene(
    @path eventId: uuid,
    @body request: StreamSceneRequest,
  ): StreamSceneDto;

  @put
  @route("/{sceneId}")
  @operationId("updateStreamScene")
  updateStreamScene(
    @path eventId: uuid,
    @path sceneId: uuid,
    @body request: StreamSceneRequest,
  ): StreamSceneDto;

  @delete
  @route("/{sceneId}")
  @operationId("deleteStreamScene")
  deleteStreamScene(
    @path eventId: uuid,
    @path sceneId: uuid,
  ): void;

  @put
  @route("/{sceneId}/graphics")
  @operationId("updateStreamSceneGraphics")
  updateStreamSceneGraphics(
    @path eventId: uuid,
    @path sceneId: uuid,
    @body request: StreamSceneGraphicsRequest,
  ): StreamSceneDto;

  @post
  @route("/{sceneId}/shareLink")
  @operationId("createStreamSceneShareLink")
  createStreamSceneShareLink(
    @path eventId: uuid,
    @path sceneId: uuid,
  ): StreamSceneShareLinkDto;

  @put
  @route("/{sceneId}/override/{graphicType}")
  @operationId("setStreamOverride")
  setStreamOverride(
    @path eventId: uuid,
    @path sceneId: uuid,
    @path graphicType: StreamGraphicType,
    @body request: StreamOverrideRequest,
  ): void;

  @delete
  @route("/{sceneId}/override/{graphicType}")
  @operationId("clearStreamOverride")
  clearStreamOverride(
    @path eventId: uuid,
    @path sceneId: uuid,
    @path graphicType: StreamGraphicType,
  ): void;

  @put
  @route("/{sceneId}/trialMode")
  @operationId("setStreamSceneTrialMode")
  setStreamSceneTrialMode(
    @path eventId: uuid,
    @path sceneId: uuid,
    @query trialMode: boolean,
  ): void;

  // Steps the demo race to `phase` - its display windows start now, so choosing the phase that
  // is already set re-triggers them. Stored even while trial mode is off.
  @put
  @route("/{sceneId}/trialPhase")
  @operationId("setStreamSceneTrialPhase")
  setStreamSceneTrialPhase(
    @path eventId: uuid,
    @path sceneId: uuid,
    @query phase: StreamTrialPhase,
  ): void;

  // See the class doc above - same payload as the scene's websocket channel.
  @get
  @route("/{sceneId}/view")
  @operationId("getStreamSceneView")
  getStreamSceneView(
    @path eventId: uuid,
    @path sceneId: uuid,
  ): StreamSceneViewDto;

  // The file behind the scene's COURSE_IMAGE graphic - the address
  // `StreamGraphicViewDto.imageUrl` points at. Same door as `/view`: a session with READ STREAM
  // or READ EVENT, or the scene's own device token in the X-Timing-Device-Token header. 404 when
  // the scene has no course image configured. Content-Type is the stored document's.
  @get
  @route("/{sceneId}/courseImage")
  @operationId("getStreamSceneCourseImage")
  getStreamSceneCourseImage(
    @path eventId: uuid,
    @path sceneId: uuid,
  ): {
    @header contentType: "application/octet-stream";
    @body body: bytes;
  };
}
