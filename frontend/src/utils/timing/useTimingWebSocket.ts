import { useEffect, useRef, useState } from 'react'
import { buildTimingWsUrl, parseTimingWsMessage, TimingWsMessage } from './timingSocket'
import { isInAppSurface, timingSocketTokens, tokenRoundInProgress } from './socketTokens.ts'

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
 * clear without a reload (a re-login in another view of the same tab refreshes `sessionStorage`), so
 * the board must keep looking rather than staying broken until someone reloads it.
 */
const UNAUTHORIZED_RETRY_MILLIS = 30000
/**
 * Pause vor dem Versuch mit dem NÄCHSTEN Token derselben Runde (siehe `timingSocketTokens`). Kurz
 * gehalten, weil hier nichts zu warten ist: Der Server hat gerade Token A abgewiesen, Token B ist
 * eine andere Sitzung und kann sofort durchgehen. Die Runde ist durch die Zahl der abgelegten
 * Tokens begrenzt — danach greift die langsame Kadenz oben, es entsteht also keine Schleife.
 */
const ALTERNATE_TOKEN_RETRY_MILLIS = 250

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
 * 2) `onopen` fired by a connection attempt that was armed while `'UNAUTHORIZED'` (oder mit dem
 *    Ersatztoken einer laufenden Runde) does not set the status to `'OPEN'` or call `onConnect`
 *    either — both are deferred to the stable-timer firing.
 *    Without that, every 30s retry would flash `'OPEN'` (clearing the banner and firing `onConnect`,
 *    which refetches and drains the offline queue against a session that is about to be rejected
 *    again) for the instant between the upgrade and the 1008 close.
 *
 * Ein 1008 heißt „dieser Token nicht", nicht „diese Person nicht": In einem Browserprofil können
 * mehrere Tokens liegen (Helfersitzung, Verwaltungssitzung, Geräte-Token). Abgewiesen wird deshalb
 * erst der Token, dann die Runde — `timingSocketTokens` liefert die Reihenfolge, der abgewiesene
 * Token wandert in `rejectedTokens`, und solange ein ungetesteter übrig ist, geht es nach
 * `ALTERNATE_TOKEN_RETRY_MILLIS` mit dem nächsten weiter. Erst wenn die Runde durch ist, schaltet
 * der Status auf `'UNAUTHORIZED'` und die langsame feste Kadenz von `UNAUTHORIZED_RETRY_MILLIS`
 * greift; dieselbe Kadenz deckt „gar kein Token da" ab (es wird kein Socket gebaut).
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
): { status: TimingWsStatus } {
	const [status, setStatus] = useState<TimingWsStatus>('CONNECTING')
	const handlersRef = useRef(handlers)

	useEffect(() => {
		handlersRef.current = handlers
	})

	const disposedRef = useRef(false)

	useEffect(() => {
		disposedRef.current = false
		setStatus('CONNECTING')

		let socket: WebSocket | null = null
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null
		let stableTimer: ReturnType<typeof setTimeout> | null = null
		let attempt = 0
		// Gesetzt von `armUnauthorizedRetry` und `armAlternateTokenRetry`, geräumt erst, wenn eine so
		// aufgesetzte Verbindung `STABLE_CONNECTION_MILLIS` übersteht (siehe `onopen` unten). Kein
		// dependency-tracked Ref: wie `attempt` lebt es für diesen Effektlauf und gehört allen
		// `connect()`-Aufrufen darin.
		let deferOpenUntilStable = false
		// Die in DIESER Runde bereits abgewiesenen Tokens. Eine Runde endet, wenn entweder eine
		// Verbindung trägt (alles geräumt) oder alle abgelegten Tokens durch sind — dann wartet
		// `armUnauthorizedRetry` und beginnt von vorn. Ohne das Gedächtnis würde der Wechsel zwischen
		// zwei toten Tokens den Server im Viertelsekundentakt anklopfen.
		let rejectedTokens = new Set<string>()

		/**
		 * Der nächste ungetestete Token. Die Ablage wird bei JEDEM Versuch neu gelesen, damit eine
		 * Anmeldung in einer anderen Ansicht desselben Tabs den Kanal ohne Neuladen zurückholt.
		 */
		const nextToken = (): string | null =>
			timingSocketTokens(eventId, isInAppSurface()).find(
				token => !rejectedTokens.has(token),
			) ?? null

		const clearStableTimer = () => {
			if (stableTimer !== null) {
				clearTimeout(stableTimer)
				stableTimer = null
			}
		}

		const armReconnectTimer = () => {
			// Non-auth failures: clear the flag, since this path means the failure is unrelated to
			// auth — unless a token round is still open: then the next attempt may well carry a token
			// that comes back with 1008 again, and a bare `onopen` must not flash `'OPEN'` in between.
			if (!tokenRoundInProgress(rejectedTokens)) deferOpenUntilStable = false
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
			deferOpenUntilStable = true
			// Alle abgelegten Tokens sind durch: neue Runde nach der Wartezeit, sonst bliebe der
			// Kanal auch nach einer frischen Anmeldung auf den verbrannten Tokens sitzen.
			rejectedTokens = new Set()
			setStatus('UNAUTHORIZED')
			reconnectTimer = setTimeout(connect, UNAUTHORIZED_RETRY_MILLIS)
		}

		/**
		 * Der Server hat einen Token abgewiesen, aber es liegt noch ein anderer im Profil (typisch:
		 * eine tote Helfersitzung neben der lebenden Verwaltungssitzung). Kein Fall für das rote
		 * Banner — hier ist nur die Auswahl schiefgegangen, nicht die Anmeldung.
		 */
		const armAlternateTokenRetry = () => {
			deferOpenUntilStable = true
			setStatus('RECONNECTING')
			reconnectTimer = setTimeout(connect, ALTERNATE_TOKEN_RETRY_MILLIS)
		}

		const connect = () => {
			if (disposedRef.current) return

			// Der Token für den Slot des Subprotokolls: die Sitzung der eigenen Oberfläche zuerst,
			// dann die der anderen, zuletzt das Geräte-Token eines geteilten Posten-Links - der
			// Server prüft alle Deutungen (Sockets.kt). Reihenfolge und Begründung: socketTokens.ts.
			const token = nextToken()
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
				if (!deferOpenUntilStable) {
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
					// Die Verbindung trägt: Runde beendet, abgewiesene Tokens vergessen. Ein späterer
					// Abriss beginnt wieder mit dem Token der eigenen Oberfläche - der kann inzwischen
					// der richtige sein.
					rejectedTokens = new Set()
					// The deferred half of the unauthorized case above: this connection has now stayed
					// open long enough to prove the 1008 isn't coming, so it's a genuine recovery.
					if (deferOpenUntilStable) {
						deferOpenUntilStable = false
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
					// Genau DIESER Token ist abgewiesen - liegt noch ein anderer im Profil, ist er
					// dran, bevor das rote Banner erscheint.
					rejectedTokens.add(token)
					if (nextToken() !== null) {
						armAlternateTokenRetry()
					} else {
						armUnauthorizedRetry()
					}
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

	return { status }
}
