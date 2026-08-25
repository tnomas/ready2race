import "@typespec/http";
import "@typespec/rest";

using TypeSpec.Http;
using TypeSpec.Rest;

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
 */
model EventInfoDto {
  // Event info information
}

@route("/eventInfo")
@tag("EventInfo")
interface EventInfoRoutes {
  // Event info routes
}
