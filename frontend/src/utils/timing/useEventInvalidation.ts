import {useCallback, useRef} from 'react'
import {TimingWsMessage} from '@utils/timing/timingSocket.ts'
import {useTimingWebSocket} from '@utils/timing/useTimingWebSocket.ts'

/**
 * Subscribes [onInvalidate] to the event-wide `eventStateChanged` push (PORT-T6).
 *
 * Thin wrapper over `useTimingWebSocket`, on the same `/api/ws/event/{eventId}/timing` channel the
 * timing board and Leitstand already use — the endpoint predates this hook and keeps its path
 * unchanged (it was never timing-specific in practice, just the only consumer so far). Every other
 * message type is ignored.
 *
 * This is a pure "maybe refetch a little early" hint for views that already poll on a fixed
 * cadence and keep that polling as their source of truth and fallback:
 * - Connection status is deliberately **not** returned or surfaced. A reconnecting, unauthorized,
 *   or permanently failed socket must stay silent here — the callers of this hook (LiveDashboard,
 *   Speaker board, Board displays) show no banner for it, they simply keep polling at their normal
 *   interval as if this hook did not exist.
 * - [onInvalidate] should just trigger the view's existing reload/refetch function; it is not
 *   expected to use any payload (there is none) and must tolerate being called more than the
 *   backend strictly needed to (the backend throttles to ~1 push per event per 2s, see
 *   `EventChangeMarker.claimBroadcastSlot`, but a reconnect can still replay one already handled).
 *
 * **Auth nuance (v1):** the websocket requires a session token (staff/helper login), but the
 * Speaker board and Board displays are public pages with no login at all. Callers on those public
 * pages are responsible for only mounting this hook (or a wrapper around it) when a token
 * happens to exist in this browser profile (e.g. staff opened the public link while still logged
 * in on the same device) — see the call sites in `SpeakerBoardPage.tsx` / `BoardDisplayPage.tsx`.
 * A page with no token simply never mounts this hook and falls back to pure polling; this hook
 * itself does not re-check for a token appearing later.
 */
export function useEventInvalidation(eventId: string, onInvalidate: () => void): void {
    const onInvalidateRef = useRef(onInvalidate)
    onInvalidateRef.current = onInvalidate

    const handleMessage = useCallback((message: TimingWsMessage) => {
        if (message.type === 'eventStateChanged') {
            onInvalidateRef.current()
        }
    }, [])

    // onConnect intentionally does nothing: unlike the timing board (which must refetch full state
    // after a reconnect since it could have missed messages), these views already have their own
    // poll loop supplying a full snapshot on the interval they chose - a reconnect here doesn't need
    // to do anything beyond what the next `eventStateChanged` (or the next poll) already covers.
    useTimingWebSocket(eventId, {
        onMessage: handleMessage,
        onConnect: () => {},
    })
}

export type EventInvalidationBridgeProps = {
    eventId: string
    onInvalidate: () => void
}

/**
 * Mounts [useEventInvalidation] as a child component rather than a direct hook call, so a PUBLIC
 * page (Speaker board, Board displays) can gate the subscription with an ordinary conditional
 * render (`{hasToken && <EventInvalidationBridge .../>}`) instead of calling a hook conditionally.
 * Renders nothing - callers decide `hasToken` once at their own mount via `hasAnySessionToken()`
 * (see the auth nuance on [useEventInvalidation]).
 */
export function EventInvalidationBridge({eventId, onInvalidate}: EventInvalidationBridgeProps): null {
    useEventInvalidation(eventId, onInvalidate)
    return null
}
