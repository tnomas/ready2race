import Config from '../../Config'
import { OfficialTimeDto, TimeMarkDto, TimingSequenceDto, TimingSettingsDto } from '../../api'

/**
 * Discriminated union of messages pushed by the timing websocket channel.
 * Mirrors the backend contract documented alongside `TimingStationType` in the generated API types.
 *
 * `officialTimeChanged` carries a *list* (`officialTimes`) and `timesDeleted` a *list* of mark ids
 * (`timeMarks`) — both exactly as the backend's `TimingWsMessage.OfficialTimeChanged` /
 * `.TimesDeleted` jackson subtypes declare them, since a recompute or a batch push changes many rows
 * at once and one message per row would flood every connected board.
 */
export type TimingWsMessage =
	| { type: 'timeMarkCreated'; mark: TimeMarkDto }
	| { type: 'timeMarkRetracted'; id: string }
	| { type: 'timeMarkReactivated'; id: string }
	| { type: 'assignmentChanged'; timeMark: string; competitionMatchTeam: string | null }
	| { type: 'stationsChanged' }
	// Die Partienmenge der Posten-Startliste hat sich geändert: ein Lauf ist dazugekommen,
	// weggefallen oder verschoben worden, oder sein Zeitnahmetyp löst sich anders auf. Reiner
	// Auslöser ohne Rumpf wie stationsChanged — die Startliste ist eine gerechnete Sicht, die
	// sich die Boards über `GET /timing/matches` holen.
	| { type: 'matchesChanged' }
	| { type: 'sequenceChanged'; sequence: TimingSequenceDto }
	| { type: 'officialTimeChanged'; officialTimes: OfficialTimeDto[] }
	| { type: 'timesDeleted'; timeMarks: string[] }
	| { type: 'settingsChanged'; settings: TimingSettingsDto }
	// Ein GANZER Versuch wurde zurückgenommen („Start zurücknehmen") — das Fehlstart-Signal der
	// Boards, zusätzlich zu den einzelnen timeMarkRetracted-Echos (die feuern auch bei der
	// harmlosen Einzelmarken-Korrektur und taugen deshalb nicht als Auslöser).
	| { type: 'attemptRetracted'; competitionSetupMatch: string; competitionMatchTeams: string[] }
	// Der AUSDRÜCKLICHE Fehlstart (Rückruf) einer Partie — vom Startposten ausgelöst. Bewusst
	// eine eigene Nachricht neben `attemptRetracted`: die feuert auch beim stillen Aufräumen
	// („Start zurücknehmen und neu starten" nach einer verpatzten Erfassung), und ein Aufräumen
	// darf die Athletenanzeige am Steg nicht rot blinken lassen. Ein Fehlstart schickt beide, die
	// bestehenden Verbraucher von `attemptRetracted` merken davon also nichts. Trägt nur die
	// Partie — die Anzeige beantwortet damit „bin ich gemeint?", und das ist eine Partie-Frage.
	| { type: 'falseStart'; competitionSetupMatch: string }

const KNOWN_TYPES = new Set<TimingWsMessage['type']>([
	'timeMarkCreated',
	'timeMarkRetracted',
	'timeMarkReactivated',
	'assignmentChanged',
	'stationsChanged',
	'matchesChanged',
	'sequenceChanged',
	'officialTimeChanged',
	'timesDeleted',
	'settingsChanged',
	'attemptRetracted',
	'falseStart',
])

/**
 * Build the websocket URL for the timing channel of a given event.
 * Derives host/scheme from `VITE_API_BASE_URL` (e.g. `http://localhost:8080/api`), resolving it
 * against the current page URL first so both an absolute base and a relative one (e.g. `/api`)
 * work, then swapping the http(s) scheme for ws(s) and appending `/ws/event/{eventId}/timing`.
 */
export function buildTimingWsUrl(eventId: string): string {
	const base = Config.api.baseUrl
	const abs = new URL(base, window.location.href)
	abs.protocol = abs.protocol === 'https:' ? 'wss:' : 'ws:'
	const path = abs.pathname.replace(/\/$/, '')
	return `${abs.origin}${path}/ws/event/${eventId}/timing`
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
