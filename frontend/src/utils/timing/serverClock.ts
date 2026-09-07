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
