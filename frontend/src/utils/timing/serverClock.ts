export type ClockQuality = 'SYNCING' | 'OK' | 'DEGRADED'

export type ClockSample = {
	// serverMillis measured at the midpoint of the request
	offset: number // serverMillis - clientMillis
	latency: number // full roundtrip millis
}

const DRIFT_RESET_THRESHOLD = 300

/**
 * Pure clock synchronization logic.
 * Tracks server time offset from client clock by maintaining the lowest-latency sample.
 * Resets on large drift (>300ms) to handle device clock adjustments.
 */
export class ClockSync {
	private best: ClockSample | null = null
	private lastSampleAt: number | null = null

	/**
	 * Ingest a new time sample.
	 * @param sample Contains offset and latency
	 * @param nowMonotonic High-resolution monotonic timestamp (e.g., performance.now())
	 */
	ingest(sample: ClockSample, nowMonotonic: number) {
		if (
			this.best !== null &&
			Math.abs(sample.offset - this.best.offset) >= DRIFT_RESET_THRESHOLD
		) {
			// device clock jumped or drifted — recalibrate from scratch
			this.best = sample
		} else if (this.best === null || sample.latency < this.best.latency) {
			this.best = sample
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
