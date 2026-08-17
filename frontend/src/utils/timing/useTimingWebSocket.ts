import { useEffect, useRef, useState } from 'react'
import { buildTimingWsUrl, parseTimingWsMessage, TimingWsMessage } from './timingSocket'

export type TimingWsStatus = 'CONNECTING' | 'OPEN' | 'RECONNECTING'

export type UseTimingWebSocketHandlers = {
	onMessage: (message: TimingWsMessage) => void
	onConnect: () => void
}

const BASE_BACKOFF_MILLIS = 1000
const MAX_BACKOFF_MILLIS = 10000
const JITTER_RATIO = 0.2

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
 * `handlers` is kept in a ref so reconnecting never resubscribes per render.
 */
export function useTimingWebSocket(
	eventId: string,
	handlers: UseTimingWebSocketHandlers,
): { status: TimingWsStatus } {
	const [status, setStatus] = useState<TimingWsStatus>('CONNECTING')
	const handlersRef = useRef(handlers)
	handlersRef.current = handlers

	const disposedRef = useRef(false)

	useEffect(() => {
		disposedRef.current = false
		let socket: WebSocket | null = null
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null
		let attempt = 0

		const connect = () => {
			if (disposedRef.current) return

			const token = sessionStorage.getItem('session')
			const url = buildTimingWsUrl(eventId)
			const ws = new WebSocket(url, token ? ['r2r', token] : ['r2r'])
			socket = ws
			// A connection failure fires both `onerror` and `onclose` (error always precedes
			// close per the WebSocket spec) - guard so we only ever schedule one reconnect per
			// broken connection.
			let reconnectScheduled = false

			ws.onopen = () => {
				if (disposedRef.current) return
				attempt = 0
				setStatus('OPEN')
				handlersRef.current.onConnect()
			}

			ws.onmessage = event => {
				if (disposedRef.current) return
				if (typeof event.data !== 'string') return
				const message = parseTimingWsMessage(event.data)
				if (message !== null) {
					handlersRef.current.onMessage(message)
				}
			}

			const scheduleReconnect = () => {
				if (disposedRef.current || reconnectScheduled) return
				reconnectScheduled = true
				setStatus('RECONNECTING')
				const delay = backoffMillis(attempt)
				attempt += 1
				reconnectTimer = setTimeout(connect, delay)
			}

			ws.onclose = scheduleReconnect
			ws.onerror = scheduleReconnect
		}

		connect()

		return () => {
			disposedRef.current = true
			if (reconnectTimer !== null) {
				clearTimeout(reconnectTimer)
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
