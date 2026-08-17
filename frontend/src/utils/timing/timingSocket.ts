import Config from '../../Config'
import { TimeMarkDto } from '../../api'

/**
 * Discriminated union of messages pushed by the timing websocket channel.
 * Mirrors the backend contract documented alongside `TimingStationType` in the generated API types.
 */
export type TimingWsMessage =
	| { type: 'timeMarkCreated'; mark: TimeMarkDto }
	| { type: 'timeMarkRetracted'; id: string }
	| { type: 'assignmentChanged'; timeMark: string; competitionMatchTeam: string | null }
	| { type: 'stationsChanged' }

const KNOWN_TYPES = new Set<TimingWsMessage['type']>([
	'timeMarkCreated',
	'timeMarkRetracted',
	'assignmentChanged',
	'stationsChanged',
])

/**
 * Build the websocket URL for the timing channel of a given event.
 * Derives host/scheme from `VITE_API_BASE_URL` (e.g. `http://localhost:8080/api`), replacing the
 * http(s) scheme with ws(s) and the trailing `/api` with `/api/ws/event/{eventId}/timing`.
 */
export function buildTimingWsUrl(eventId: string): string {
	const base = Config.api.baseUrl
	const wsBase = base.replace(/^http/, 'ws').replace(/\/?$/, '')
	return `${wsBase}/ws/event/${eventId}/timing`
}

const warnedTypes = new Set<string>()

/**
 * Parse and validate a raw websocket message payload.
 * Returns null for unparseable JSON or an unrecognized/missing `type` discriminator, warning once
 * per distinct type (or once for parse failures) so noisy servers don't spam the console.
 */
export function parseTimingWsMessage(raw: string): TimingWsMessage | null {
	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch {
		if (!warnedTypes.has('__parse_error__')) {
			warnedTypes.add('__parse_error__')
			console.warn('useTimingWebSocket: received unparseable message', raw)
		}
		return null
	}

	if (
		typeof data !== 'object' ||
		data === null ||
		!('type' in data) ||
		typeof (data as { type: unknown }).type !== 'string'
	) {
		if (!warnedTypes.has('__missing_type__')) {
			warnedTypes.add('__missing_type__')
			console.warn('useTimingWebSocket: received message without a valid type field', data)
		}
		return null
	}

	const type = (data as { type: string }).type
	if (!KNOWN_TYPES.has(type as TimingWsMessage['type'])) {
		if (!warnedTypes.has(type)) {
			warnedTypes.add(type)
			console.warn(`useTimingWebSocket: received unknown message type "${type}"`)
		}
		return null
	}

	return data as TimingWsMessage
}
