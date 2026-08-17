import { useEffect, useRef, useState } from 'react'
import { buildTimingWsUrl, parseTimingWsMessage, TimingWsMessage } from './timingSocket'

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
 * session token is invalid/expired, so `onopen` still fires once before the close. To avoid a 1 Hz
 * handshake+refetch loop in that case: the reconnect `attempt` counter is only reset once a
 * connection has stayed open for `STABLE_CONNECTION_MILLIS` (a bare `onopen` never resets it), and a
 * close with code 1008 is treated as terminal — status becomes `'UNAUTHORIZED'` and no further
 * reconnect is scheduled. If there's no session token at all, no socket is created and the status
 * goes straight to `'UNAUTHORIZED'`.
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

		const clearStableTimer = () => {
			if (stableTimer !== null) {
				clearTimeout(stableTimer)
				stableTimer = null
			}
		}

		const armReconnectTimer = () => {
			setStatus('RECONNECTING')
			const delay = backoffMillis(attempt)
			attempt += 1
			reconnectTimer = setTimeout(connect, delay)
		}

		const connect = () => {
			if (disposedRef.current) return

			const token = sessionStorage.getItem('session')
			if (token === null) {
				setStatus('UNAUTHORIZED')
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
				setStatus('OPEN')
				handlersRef.current.onConnect()
				// Do NOT reset `attempt` here: the backend closes with 1008 *after* the upgrade on
				// auth failure, so a bare `onopen` fires every cycle even when auth is broken. Only
				// treat the connection as healthy - and reset the backoff - once it has stayed open
				// for a while.
				clearStableTimer()
				stableTimer = setTimeout(() => {
					attempt = 0
					stableTimer = null
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
					setStatus('UNAUTHORIZED')
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
