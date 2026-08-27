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
 * `GET .../view` currently answers 501 - the resolver that turns the scene's configuration,
 * overrides and the event's live matches into a StreamSceneViewDto is a later task. Once it
 * exists, the same payload is expected to also be pushed over a websocket channel
 * (`/api/ws/event/{eventId}/stream/{sceneId}`), mirroring the board channel documented in
 * eventInfo.tsp: receive-only, full view as the first frame, auth identical to the HTTP route.
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
// PUT/DELETE /event/{eventId}/stream/{sceneId}: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT /event/{eventId}/stream/{sceneId}/graphics: require UpdateStreamGlobal OR UpdateEventGlobal
// POST /event/{eventId}/stream/{sceneId}/shareLink: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT/DELETE /event/{eventId}/stream/{sceneId}/override/{graphicType}: require UpdateStreamGlobal OR UpdateEventGlobal
// PUT /event/{eventId}/stream/{sceneId}/trialMode: require UpdateStreamGlobal OR UpdateEventGlobal
// GET /event/{eventId}/stream/{sceneId}/view: require ReadStreamGlobal OR ReadEventGlobal, OR a
//   scene device token (see the class doc above) - answers 501 for now, see Task 8.

@route("/event/{eventId}/stream")
@tag("Stream")
interface StreamRoutes {

  @get
  @operationId("getStreamScenes")
  getStreamScenes(@path eventId: uuid): StreamSceneDto[];

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

  // See the class doc above - answers 501 until Task 8 wires up the resolver.
  @get
  @route("/{sceneId}/view")
  @operationId("getStreamSceneView")
  getStreamSceneView(
    @path eventId: uuid,
    @path sceneId: uuid,
  ): NotImplemented;
}
