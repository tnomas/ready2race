import { useEffect, useRef, useState } from 'react'
import { getServerTime } from '../../api/sdk.gen'
import { rememberServerZoneOffset } from './serverTime'
import {
	CLOCK_OFFSET_STORAGE_KEY,
	ClockQuality,
	ClockSync,
	restoreClockOffset,
	serializeClockOffset,
} from './serverClock'

export interface UseServerClockResult {
	/**
	 * Get the current server time in milliseconds since epoch, or null while syncing.
	 */
	now: () => number | null
	/**
	 * Synchronization quality: SYNCING, OK, or DEGRADED.
	 */
	quality: ClockQuality
	/**
	 * Current time offset in milliseconds (server - client), or null if not synced.
	 */
	offsetMillis: number | null
}

/**
 * Der zuletzt gemessene Versatz aus der Ablage — oder `null`, wenn keiner (mehr) trägt oder die
 * Ablage nicht erreichbar ist (privater Modus, gesperrter Speicher). Wirft nie.
 */
function readPersistedOffset(): number | null {
	try {
		return restoreClockOffset(localStorage.getItem(CLOCK_OFFSET_STORAGE_KEY), Date.now())
	} catch {
		return null
	}
}

/** Den aktuellen Versatz sichern; ein voller oder gesperrter Speicher darf nichts aufhalten. */
function persistOffset(offset: number): void {
	try {
		localStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, serializeClockOffset(offset, Date.now()))
	} catch {
		// Ablage nicht verfügbar — dann eben ohne Sicherung
	}
}

/**
 * Hook for server clock synchronization.
 * Samples server time immediately on mount and every 5 seconds.
 * Tracks the lowest-latency sample to estimate server-client offset.
 * Returns a function to query server time and quality indicators.
 *
 * Der Versatz wird nach jeder Probe in `localStorage` gesichert und beim Start wieder übernommen
 * (jünger als zwölf Stunden), als DEGRADED: Ein Handy, das nach einem Neustart keinen Server
 * erreicht, kann so trotzdem erfassen — die Marke landet in der Offline-Warteschlange, und das
 * Banner der Uhr-Güte sagt dem Bediener, dass die Zeit aus dem letzten bekannten Versatz stammt.
 */
export function useServerClock(): UseServerClockResult {
	const syncRef = useRef<ClockSync | null>(null)
	if (syncRef.current === null) {
		const sync = new ClockSync()
		const persisted = readPersistedOffset()
		if (persisted !== null) sync.seed(persisted)
		syncRef.current = sync
	}
	const sync = syncRef.current
	const [quality, setQuality] = useState<ClockQuality>(() => sync.quality(performance.now()))
	const disposedRef = useRef(false)

	useEffect(() => {
		disposedRef.current = false

		// Sample immediately on mount
		const sampleNow = async () => {
			if (disposedRef.current) return

			try {
				const t0 = Date.now()
				const res = await getServerTime({})
				const t1 = Date.now()

				if (disposedRef.current) return

				if (res.error) {
					// Error in response, skip this sample
					return
				}

				if (!res.data) {
					// No data in response, skip this sample
					return
				}

				const latency = t1 - t0
				const midpoint = t0 + latency / 2
				const offset = res.data.serverTimeMillis - midpoint
				rememberServerZoneOffset(res.data.serverLocalTime, res.data.serverTimeMillis)

				sync.ingest({ offset, latency }, performance.now())
				const current = sync.offset()
				if (current !== null) persistOffset(current)
			} catch {
				// Network error or parse failure — skip this sample
				// quality will degrade automatically after 30s
			}
		}

		// Fire immediately
		sampleNow()

		// Set up interval for every 5 seconds
		const sampleInterval = setInterval(sampleNow, 5000)

		// Independent 1-second ticker to keep quality live during outages
		const qualityTicker = setInterval(() => {
			if (disposedRef.current) return
			const q = sync.quality(performance.now())
			setQuality((prev) => (prev === q ? prev : q))
		}, 1000)

		// Cleanup on unmount
		return () => {
			disposedRef.current = true
			clearInterval(sampleInterval)
			clearInterval(qualityTicker)
		}
	}, [sync])

	const offset = sync.offset()

	return {
		now: () => {
			const off = sync.offset()
			return off === null ? null : Date.now() + off
		},
		quality,
		offsetMillis: offset,
	}
}
