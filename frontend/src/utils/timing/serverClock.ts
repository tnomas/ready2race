export type ClockQuality = 'SYNCING' | 'OK' | 'DEGRADED'

export type ClockSample = {
	// serverMillis measured at the midpoint of the request
	offset: number // serverMillis - clientMillis
	latency: number // full roundtrip millis
}

type TimedSample = ClockSample & {at: number}

/** So viele Proben zählen höchstens — ältere fallen aus dem Fenster, egal wie schnell sie waren. */
const WINDOW_SIZE = 8
/** Nach dieser Zeit (monotone Uhr) zählt eine Probe nicht mehr — die Geräteuhr driftet weiter. */
const WINDOW_AGE_MILLIS = 10 * 60_000
/** Über so viele der jüngsten Proben wird der Median gebildet, der eine Drift erkennt. */
const DRIFT_MEDIAN_SAMPLES = 5
/** Liegt der Median der jüngsten Versätze weiter als dies vom Anker entfernt, wird neu verankert. */
const DRIFT_REANCHOR_THRESHOLD = 40

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b)
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Pure clock synchronization logic.
 *
 * Der Versatz zur Serveruhr ist die Probe mit der geringsten Latenz — aber nur unter den jüngsten
 * Proben (höchstens [WINDOW_SIZE], höchstens [WINDOW_AGE_MILLIS] alt). Eine einzelne traumhaft
 * schnelle Probe vom Morgen darf den Versatz nicht den ganzen Tag festhalten, während die
 * Geräteuhr davonläuft. Läuft der Median der letzten [DRIFT_MEDIAN_SAMPLES] Versätze mehr als
 * [DRIFT_REANCHOR_THRESHOLD] ms vom Anker weg, wird auf die Median-Probe neu verankert — ein
 * einzelner Ausreißer (hohe Latenz, unsinniger Versatz) bewegt den Median nicht und gewinnt auch
 * nicht über die Latenz.
 *
 * Der Anker überlebt ein leeres Fenster: ohne frische Proben bleibt der letzte Versatz nutzbar,
 * nur die Güte fällt auf DEGRADED.
 */
export class ClockSync {
	private best: TimedSample | null = null
	private window: TimedSample[] = []
	private lastSampleAt: number | null = null

	/**
	 * Ingest a new time sample.
	 * @param sample Contains offset and latency
	 * @param nowMonotonic High-resolution monotonic timestamp (e.g., performance.now())
	 */
	ingest(sample: ClockSample, nowMonotonic: number) {
		this.window.push({...sample, at: nowMonotonic})
		this.window = this.window
			.filter(entry => nowMonotonic - entry.at <= WINDOW_AGE_MILLIS)
			.slice(-WINDOW_SIZE)

		// Bestprobe: geringste Latenz im Fenster. Ein Anker außerhalb des Fensters verliert seinen
		// Vorrang — er ist zu alt, um noch gegen frische Proben anzutreten.
		const fastest = this.window.reduce((acc, entry) =>
			entry.latency < acc.latency ? entry : acc,
		)
		if (this.best === null || !this.window.includes(this.best) || fastest.latency < this.best.latency) {
			this.best = fastest
		}

		// Drift: Der Median der jüngsten Versätze ist robust gegen einen Ausreißer, folgt aber
		// einer echten Verschiebung der Geräteuhr innerhalb weniger Proben.
		const recent = this.window.slice(-DRIFT_MEDIAN_SAMPLES)
		const recentMedian = median(recent.map(entry => entry.offset))
		if (Math.abs(recentMedian - this.best.offset) > DRIFT_REANCHOR_THRESHOLD) {
			const anchor = recent.reduce((acc, entry) =>
				Math.abs(entry.offset - recentMedian) < Math.abs(acc.offset - recentMedian)
					? entry
					: acc,
			)
			this.best = anchor
		}
		this.lastSampleAt = nowMonotonic
	}

	/**
	 * Einen früher gemessenen Versatz vorgeben (aus der Ablage, siehe [restoreClockOffset]). Er
	 * trägt sofort — ein Neustart ohne Netz hat sonst keine Uhr und dürfte nicht erfassen —, gilt
	 * aber nur als DEGRADED, bis die erste echte Probe ihn ablöst: unendliche Latenz verliert gegen
	 * jede gemessene, und ohne `lastSampleAt` bleibt die Güte unter OK.
	 */
	seed(offset: number) {
		if (this.best !== null) return
		this.best = {offset, latency: Number.POSITIVE_INFINITY, at: Number.NEGATIVE_INFINITY}
	}

	/**
	 * Get the current time offset in milliseconds.
	 * @returns offset or null if no valid sample yet
	 */
	offset(): number | null {
		return this.best?.offset ?? null
	}

	/**
	 * Assess synchronization quality.
	 * @param nowMonotonic High-resolution monotonic timestamp
	 * @returns Quality indicator: SYNCING (no sample yet), OK (recent sample), DEGRADED (stale sample >30s)
	 */
	quality(nowMonotonic: number): ClockQuality {
		if (this.best === null) return 'SYNCING'
		if (this.lastSampleAt === null || nowMonotonic - this.lastSampleAt > 30_000)
			return 'DEGRADED'
		return 'OK'
	}
}

// --- Ablage des Versatzes über einen Neustart hinweg ---------------------------------------------

/** `localStorage`-Schlüssel des zuletzt gemessenen Versatzes. */
export const CLOCK_OFFSET_STORAGE_KEY = 'timing.clockOffset'
/** Älter darf die Sicherung nicht sein — danach hat die Geräteuhr zu lange ungeprüft gelaufen. */
export const CLOCK_OFFSET_MAX_AGE_MILLIS = 12 * 60 * 60_000

type StoredClockOffset = {
	offset: number
	/** Wanduhr des Geräts (`Date.now()`) zum Zeitpunkt der Sicherung. */
	sampledAt: number
}

/** Der Versatz als Ablagewert, zusammen mit der Geräte-Wanduhr des Messzeitpunkts. */
export function serializeClockOffset(offset: number, sampledAt: number): string {
	return JSON.stringify({offset, sampledAt} satisfies StoredClockOffset)
}

/**
 * Den gesicherten Versatz zurücklesen, sofern die Sicherung brauchbar ist: gültiges JSON, Zahlen,
 * nicht älter als [CLOCK_OFFSET_MAX_AGE_MILLIS] und nicht aus der Zukunft (eine zurückgestellte
 * Geräteuhr macht jede Altersrechnung wertlos). Sonst `null` — wirft nie.
 */
export function restoreClockOffset(
	raw: string | null,
	now: number,
	maxAgeMillis: number = CLOCK_OFFSET_MAX_AGE_MILLIS,
): number | null {
	if (raw === null) return null
	try {
		const parsed: unknown = JSON.parse(raw)
		if (parsed === null || typeof parsed !== 'object') return null
		const {offset, sampledAt} = parsed as Partial<Record<keyof StoredClockOffset, unknown>>
		if (typeof offset !== 'number' || !Number.isFinite(offset)) return null
		if (typeof sampledAt !== 'number' || !Number.isFinite(sampledAt)) return null
		const age = now - sampledAt
		if (age < 0 || age > maxAgeMillis) return null
		return offset
	} catch {
		return null
	}
}
