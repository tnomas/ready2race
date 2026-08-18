import {useCallback, useEffect, useRef, useState} from 'react'
import {getOfficialTimes} from '@api/sdk.gen.ts'
import {OfficialTimeDto} from '@api/types.gen.ts'

export type UseOfficialTimesResult = {
    officialTimes: OfficialTimeDto[]
    /** True while a (re)load is in flight. */
    pending: boolean
    /** True when the last load failed — render a banner for this. */
    error: boolean
    /** Re-fetch the event's official times from the server. */
    reload: () => void
    /**
     * Merge the rows of a websocket `officialTimeChanged` message. Stable across renders, so it can be
     * handed to `useTimingBoardState` as its `onOfficialTimeChanged` callback without re-subscribing.
     */
    applyChanged: (changed: OfficialTimeDto[]) => void
}

/** Upsert by team: a changed row replaces the existing one, an unknown row is appended. */
function upsert(previous: OfficialTimeDto[], changed: OfficialTimeDto[]): OfficialTimeDto[] {
    if (changed.length === 0) return previous
    const byTeam = new Map(previous.map(entry => [entry.competitionMatchTeam, entry]))
    for (const entry of changed) {
        byTeam.set(entry.competitionMatchTeam, entry)
    }
    return [...byTeam.values()]
}

/**
 * The event's official times, loaded once per event and then kept current from the websocket's
 * `officialTimeChanged` messages.
 *
 * Mirrors `useTimingBoardState`'s two race guards, for the same reason: a reload and the live feed run
 * concurrently, so a response can describe a state that is already stale when it lands.
 *
 * - *Epoch*: a response whose epoch is no longer current is discarded, so two overlapping reloads
 *   always resolve last-issued-wins regardless of network timing.
 * - *Replay buffer*: messages that arrive while a reload is in flight are applied optimistically *and*
 *   buffered, then re-applied on top of the snapshot in the same state update. Since the server only
 *   pushes after committing, anything received before the request was sent is already in the snapshot —
 *   buffering from the start of the request is exactly the set of changes it can be missing.
 */
export function useOfficialTimes(eventId: string): UseOfficialTimesResult {
    const [officialTimes, setOfficialTimes] = useState<OfficialTimeDto[]>([])
    const [pending, setPending] = useState(false)
    const [error, setError] = useState(false)

    const disposedRef = useRef(false)
    /** Monotonic reload counter — only the newest in-flight reload may apply its response. */
    const epochRef = useRef(0)
    /** True while a reload is in flight, i.e. while websocket rows must also be buffered. */
    const inFlightRef = useRef(false)
    /** Message payloads received since the in-flight reload started, in arrival order. */
    const bufferRef = useRef<OfficialTimeDto[][]>([])

    useEffect(() => {
        disposedRef.current = false
        return () => {
            disposedRef.current = true
        }
    }, [])

    const reload = useCallback(() => {
        const epoch = ++epochRef.current
        inFlightRef.current = true
        bufferRef.current = []
        setPending(true)
        void (async () => {
            try {
                const {data, error: requestError} = await getOfficialTimes({path: {eventId}})
                if (disposedRef.current || epoch !== epochRef.current) return
                inFlightRef.current = false
                const replay = bufferRef.current
                bufferRef.current = []
                setPending(false)
                if (requestError !== undefined || data === undefined) {
                    setError(true)
                    return
                }
                setError(false)
                setOfficialTimes(replay.reduce((acc, changed) => upsert(acc, changed), data))
            } catch {
                if (disposedRef.current || epoch !== epochRef.current) return
                inFlightRef.current = false
                bufferRef.current = []
                setPending(false)
                setError(true)
            }
        })()
    }, [eventId])

    const applyChanged = useCallback((changed: OfficialTimeDto[]) => {
        if (inFlightRef.current) {
            bufferRef.current.push(changed)
        }
        setOfficialTimes(prev => upsert(prev, changed))
    }, [])

    // Switching events must not carry rows (or a pending replay buffer) across; bumping the epoch also
    // invalidates a reload still in flight for the previous event.
    useEffect(() => {
        epochRef.current += 1
        inFlightRef.current = false
        bufferRef.current = []
        setOfficialTimes([])
        setError(false)
        reload()
    }, [reload])

    return {officialTimes, pending, error, reload, applyChanged}
}
