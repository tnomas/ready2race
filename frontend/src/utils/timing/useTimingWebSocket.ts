import {useEffect, useRef, useState} from 'react'
import {
    buildTimingWsUrl,
    parseTimingWsMessage,
    TimingWsMessage,
} from '@utils/timing/timingSocket.ts'
import {readSessionToken} from '../../contexts/user/sessionToken.ts'
import {useUser} from '@contexts/user/UserContext.ts'

/**
 * Storage fallback for the websocket handshake token, used when the `UserProvider` context has none
 * (see `resolveToken` below for why the context is asked first).
 *
 * Reading `sessionStorage.getItem('session')` — what this hook did on its original branch — no longer
 * finds anything: sessions now live in `localStorage` under `session.app` (helper app, everything
 * under `/app`) and `session.admin` (administration), each as a `{token, lastUsedAt}` record with a
 * six-hour sliding window (see `contexts/user/sessionToken.ts`). The timing surfaces are mounted under
 * `/app`, so the app session is asked first; the administration token is the fallback for an operator
 * who reached a board from the administration interface in the same browser profile. `readSessionToken`
 * also drops a token that has aged out, so an expired session lands in `'UNAUTHORIZED'` here rather
 * than being handed to the server only to be rejected with 1008.
 */
function storageToken(): string | null {
    return readSessionToken(true) ?? readSessionToken(false)
}

/**
 * Resolves the token a fresh websocket connection attempt authenticates with.
 *
 * The `UserProvider` context's `token` is asked first: it is exactly what the same render's REST
 * calls authenticate with (see the request interceptor in `UserProvider.tsx`), so a helper who
 * reaches `/app/timing` by a client-side navigation - already authenticated in this session, but
 * possibly under a token that has since rotated, or one stored under the OTHER surface's storage key
 * because they signed in through the administration interface first - gets the SAME token for the
 * websocket as for every other request this render makes. Storage is only the fallback, for public
 * pages that mount this hook (via `useEventInvalidation`) with no `UserProvider`-authenticated user
 * at all - see that hook's docs on the auth nuance there.
 */
function resolveToken(contextToken: string | null): string | null {
    return contextToken ?? storageToken()
}

export type TimingWsStatus = 'CONNECTING' | 'OPEN' | 'RECONNECTING' | 'UNAUTHORIZED'

export type UseTimingWebSocketHandlers = {
    onMessage: (message: TimingWsMessage) => void
    onConnect: () => void
}

const BASE_BACKOFF_MILLIS = 1000
const MAX_BACKOFF_MILLIS = 10000
const JITTER_RATIO = 0.2
const STABLE_CONNECTION_MILLIS = 10000
const AUTH_FAILURE_CLOSE_CODE = 1008
/**
 * Retry cadence while unauthorized. Deliberately slow and un-jittered: this is not a transient
 * network fault that clears on its own in a second, it needs a human to log in again — but it *does*
 * clear without a reload (a re-login in another view of the same browser profile refreshes the stored
 * session), so the board must keep looking rather than staying broken until someone reloads it.
 */
const UNAUTHORIZED_RETRY_MILLIS = 30000

function backoffMillis(attempt: number): number {
    const capped = Math.min(BASE_BACKOFF_MILLIS * 2 ** attempt, MAX_BACKOFF_MILLIS)
    const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1)
    return capped + jitter
}

/**
 * Hook managing the live timing websocket connection for one event.
 * Connects to `ws(s)://<host>/api/ws/event/{eventId}/timing`, authenticating via the `r2r`
 * subprotocol (session token as the second entry). Reconnects with exponential backoff
 * (1s/2s/4s, capped at 10s, +/-20% jitter) on close/error, and calls `handlers.onConnect` on every
 * successful (re)connect so callers can refetch full state — this covers both the initial load and
 * the server dropping slow clients at its queue capacity.
 *
 * The backend closes with code 1008 (policy violation) *after* completing the 101 upgrade when the
 * session token is invalid/expired, so `onopen` still fires once before the close. Two problems stem
 * from that, both handled the same way — a bare `onopen` is never trusted on its own:
 * 1) the reconnect `attempt` counter is only reset once a connection has stayed open for
 *    `STABLE_CONNECTION_MILLIS` (a bare `onopen` never resets it), and
 * 2) `onopen` fired by a connection attempt that was armed while `'UNAUTHORIZED'` does not set the
 *    status to `'OPEN'` or call `onConnect` either — both are deferred to the stable-timer firing.
 *    Without that, every 30s retry would flash `'OPEN'` (clearing the banner and firing `onConnect`,
 *    which refetches and drains the offline queue against a session that is about to be rejected
 *    again) for the instant between the upgrade and the 1008 close.
 * A close with code 1008 switches the status to `'UNAUTHORIZED'` and drops to a slow fixed retry
 * every `UNAUTHORIZED_RETRY_MILLIS` instead of the normal backoff. The same slow retry covers "no
 * session token at all" (no socket is created, status goes straight to `'UNAUTHORIZED'`).
 *
 * The unauthorized state is explicitly **not** terminal. Sessions expire on a quiet station (the
 * board's only steady traffic is unauthenticated), and a re-login happening in the same tab must
 * bring the board back on its own — a state that can only be left by reloading the page would strand
 * an operator mid-event. Recovery is automatic: once a retry armed by the unauthorized path connects
 * and *stays* connected for `STABLE_CONNECTION_MILLIS` (proving the 1008 won't follow), the
 * stable-timer callback flips the status to `'OPEN'` and fires `onConnect`, which refetches state and
 * lets the board drain its offline queue.
 *
 * `handlers` is kept in a ref (updated in its own depless effect) so reconnecting never
 * resubscribes per render.
 */
export function useTimingWebSocket(
    eventId: string,
    handlers: UseTimingWebSocketHandlers,
): {status: TimingWsStatus} {
    const [status, setStatus] = useState<TimingWsStatus>('CONNECTING')
    const handlersRef = useRef(handlers)

    useEffect(() => {
        handlersRef.current = handlers
    })

    // The context token as of the latest render, mirrored into a ref so a (re)connect attempt made
    // from inside a `setTimeout` - every retry after the first - reads the current value rather than
    // the one captured when that timer was armed. `useUser()` always resolves here: `UserProvider`
    // wraps the whole app (see `main.tsx`), including the public pages that reach this hook through
    // `useEventInvalidation` without ever authenticating - `user.token` is simply `null` for those.
    const user = useUser()
    const contextTokenRef = useRef(user.token)
    useEffect(() => {
        contextTokenRef.current = user.token
    })

    const disposedRef = useRef(false)

    useEffect(() => {
        disposedRef.current = false
        setStatus('CONNECTING')

        let socket: WebSocket | null = null
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null
        let stableTimer: ReturnType<typeof setTimeout> | null = null
        let attempt = 0
        // Set by `armUnauthorizedRetry`, cleared only once a connection armed by that path survives
        // `STABLE_CONNECTION_MILLIS` (see `onopen` below). Not a dependency-tracked ref: like `attempt`,
        // it lives for the lifetime of this effect run and is shared by every `connect()` call it makes.
        let wasUnauthorized = false

        const clearStableTimer = () => {
            if (stableTimer !== null) {
                clearTimeout(stableTimer)
                stableTimer = null
            }
        }

        const armReconnectTimer = () => {
            // Non-auth failures: clear the flag since this path means failure is unrelated to auth
            wasUnauthorized = false
            setStatus('RECONNECTING')
            const delay = backoffMillis(attempt)
            attempt += 1
            reconnectTimer = setTimeout(connect, delay)
        }

        /**
         * Stay in `'UNAUTHORIZED'` (the banner must keep telling the operator to log in again) but
         * keep probing on a slow fixed cadence, so a re-login elsewhere in the tab recovers the board
         * without a reload. Does not touch `attempt`: this isn't a backoff, and a later genuine
         * connection failure should still start from the normal fast retry.
         */
        const armUnauthorizedRetry = () => {
            wasUnauthorized = true
            setStatus('UNAUTHORIZED')
            reconnectTimer = setTimeout(connect, UNAUTHORIZED_RETRY_MILLIS)
        }

        const connect = () => {
            if (disposedRef.current) return

            const token = resolveToken(contextTokenRef.current)
            if (token === null) {
                armUnauthorizedRetry()
                return
            }

            const url = buildTimingWsUrl(eventId)
            let ws: WebSocket
            try {
                ws = new WebSocket(url, ['r2r', token])
            } catch {
                // Constructing the socket can throw synchronously (e.g. a malformed URL). Back off
                // like any other connection failure so a persistently bad URL doesn't spin fast.
                armReconnectTimer()
                return
            }
            socket = ws
            // A connection failure fires both `onerror` and `onclose` (error always precedes
            // close per the WebSocket spec) - guard so we only ever schedule one reconnect per
            // broken connection.
            let reconnectScheduled = false

            const cleanupSocket = () => {
                try {
                    ws.onopen = null
                    ws.onmessage = null
                    ws.onclose = null
                    ws.onerror = null
                    ws.close()
                } catch {
                    // ignore errors closing an already-closing/closed socket
                }
            }

            const scheduleReconnect = () => {
                if (disposedRef.current || reconnectScheduled) return
                reconnectScheduled = true
                clearStableTimer()
                cleanupSocket()
                armReconnectTimer()
            }

            ws.onopen = () => {
                if (disposedRef.current) return
                // If this connection attempt was armed by `armUnauthorizedRetry`, do not report it as
                // `'OPEN'` yet: the backend closes with 1008 *after* the upgrade on auth failure, so a
                // bare `onopen` fires every cycle even when auth is still broken, and reporting `'OPEN'`
                // here would flash the connected state (clearing the unauthorized banner and firing
                // `onConnect`, which refetches/drains against a session that's about to be rejected
                // again) for the instant before that close arrives. Both are deferred to the
                // stable-timer callback below, which only fires once the connection has actually stayed
                // open for a while.
                if (!wasUnauthorized) {
                    setStatus('OPEN')
                    handlersRef.current.onConnect()
                }
                // Do NOT reset `attempt` here: the backend closes with 1008 *after* the upgrade on
                // auth failure, so a bare `onopen` fires every cycle even when auth is broken. Only
                // treat the connection as healthy - and reset the backoff - once it has stayed open
                // for a while.
                clearStableTimer()
                stableTimer = setTimeout(() => {
                    attempt = 0
                    stableTimer = null
                    // The deferred half of the unauthorized case above: this connection has now stayed
                    // open long enough to prove the 1008 isn't coming, so it's a genuine recovery.
                    if (wasUnauthorized) {
                        wasUnauthorized = false
                        setStatus('OPEN')
                        handlersRef.current.onConnect()
                    }
                }, STABLE_CONNECTION_MILLIS)
            }

            ws.onmessage = event => {
                if (disposedRef.current) return
                if (typeof event.data !== 'string') return
                const message = parseTimingWsMessage(event.data)
                if (message !== null) {
                    handlersRef.current.onMessage(message)
                }
            }

            ws.onclose = event => {
                if (disposedRef.current || reconnectScheduled) return
                if (event.code === AUTH_FAILURE_CLOSE_CODE) {
                    reconnectScheduled = true
                    clearStableTimer()
                    cleanupSocket()
                    armUnauthorizedRetry()
                    return
                }
                scheduleReconnect()
            }

            ws.onerror = scheduleReconnect
        }

        connect()

        return () => {
            disposedRef.current = true
            if (reconnectTimer !== null) {
                clearTimeout(reconnectTimer)
            }
            if (stableTimer !== null) {
                clearTimeout(stableTimer)
            }
            if (socket !== null) {
                socket.onopen = null
                socket.onmessage = null
                socket.onclose = null
                socket.onerror = null
                socket.close()
            }
        }
    }, [eventId])

    return {status}
}
