import { useEffect, useRef, useState } from 'react'
import { getServerTime } from '../../api/sdk.gen'
import { ClockQuality, ClockSync } from './serverClock'

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
 * Hook for server clock synchronization.
 * Samples server time immediately on mount and every 5 seconds.
 * Tracks the lowest-latency sample to estimate server-client offset.
 * Returns a function to query server time and quality indicators.
 */
export function useServerClock(): UseServerClockResult {
	const syncRef = useRef(new ClockSync())
	const [, setTrigger] = useState(0)

	useEffect(() => {
		const sync = syncRef.current

		// Sample immediately on mount
		const sampleNow = async () => {
			try {
				const t0 = Date.now()
				const res = await getServerTime({})
				const t1 = Date.now()

				if (!res.data) {
					// No data in response, skip this sample
					return
				}

				const latency = t1 - t0
				const midpoint = t0 + latency / 2
				const offset = res.data.serverTimeMillis - midpoint

				sync.ingest({ offset, latency }, performance.now())
				// Trigger a re-render to update the quality state
				setTrigger((prev) => prev + 1)
			} catch {
				// Network error or parse failure — skip this sample
				// quality will degrade automatically after 30s
			}
		}

		// Fire immediately
		sampleNow()

		// Set up interval for every 5 seconds
		const interval = setInterval(sampleNow, 5000)

		// Cleanup on unmount
		return () => clearInterval(interval)
	}, [])

	const offset = syncRef.current.offset()
	const quality = syncRef.current.quality(performance.now())

	return {
		now: () => {
			const off = syncRef.current.offset()
			return off === null ? null : Date.now() + off
		},
		quality,
		offsetMillis: offset,
	}
}
