import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "./common.tsp";

using Http;
using Rest;
using OpenAPI;

namespace Ready2Race;

/**
 * The referee's live dashboard - the part of it documented here is the clarification of a match:
 * an objection is running, the match stays activated but drops out of the public displays and the
 * activation chain until the clarification is lifted (or the match is finished).
 *
 * The remaining dashboard routes (`/event/{eventId}/liveDashboard`, `.../match/{matchId}/start`,
 * `.../finish`, `.../activation`, team notes) are described in the hand-maintained backend OpenAPI
 * document only.
 */

// Puts a match into clarification. Nothing but the reason is given - the server sets the
// timestamp.
model MatchClarificationRequest {
  // Must not be blank, at most 255 characters (the column width).
  @maxLength(255)
  reason: string;
}

// ==========================================================================
// Routes
// ==========================================================================
// PUT/DELETE .../clarification: require UpdateEventGlobal

@route("/event/{eventId}/liveDashboard/match/{matchId}/clarification")
@tag("LiveDashboard")
interface LiveDashboardClarificationRoutes {

  // A second call only sharpens the reason - the timestamp stays the one from the first call.
  // A finished match is rejected with 409 LIVE_DASHBOARD_MATCH_ALREADY_FINISHED: finishing is
  // the release, and the way back would be unreachable. A match of another event answers 404.
  @put
  @operationId("setMatchClarification")
  setMatchClarification(
    @path eventId: uuid,
    @path matchId: uuid,
    @body request: MatchClarificationRequest,
  ): void;

  // Lifts the clarification: both columns are cleared and the match returns to the state it
  // would derive without them (usually RUNNING).
  @delete
  @operationId("clearMatchClarification")
  clearMatchClarification(
    @path eventId: uuid,
    @path matchId: uuid,
  ): void;
}
