import {useCallback, useEffect, useRef, useState} from 'react'
import {getTimingResults} from '@api/sdk.gen.ts'
import {TimingResultDto} from '@api/types.gen.ts'

export type UseTimingResultsResult = {
    results: TimingResultDto[]
    /** True while a (re)load is in flight. */
    pending: boolean
    /** True when the last load failed — render a banner for this. */
    error: boolean
    /** Re-fetch the event's result rows from the server. */
    reload: () => void
    /**
     * Merge the rows of a websocket `resultChanged` message. Stable across renders, so it can be
     * handed to `useTimingBoardState` as its `onResultChanged` callback without re-subscribing.
     */
    applyChanged: (changed: TimingResultDto[]) => void
}

/** Upsert by team: a changed row replaces the existing one, an unknown row is appended. */
function upsert(previous: TimingResultDto[], changed: TimingResultDto[]): TimingResultDto[] {
    if (changed.length === 0) return previous
    const byTeam = new Map(previous.map(entry => [entry.competitionMatchTeam, entry]))
    for (const entry of changed) {
        byTeam.set(entry.competitionMatchTeam, entry)
    }
    return [...byTeam.values()]
}

/**
 * The event's result rows, loaded once per event and then kept current from the websocket's
 * `resultChanged` messages.
 *
 * Nothing in a row is stored as such — start/finish are resolved from the team's assigned marks on
 * every read and the final time is derived from them plus the penalty — so a *mark* change is a
 * result change too. The backend broadcasts `resultChanged` for both, which is why this hook does not
 * try to recompute anything locally from the marks feed: it only ever mirrors what the server sends.
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
export function useTimingResults(eventId: string): UseTimingResultsResult {
    const [results, setResults] = useState<TimingResultDto[]>([])
    const [pending, setPending] = useState(false)
    const [error, setError] = useState(false)

    const disposedRef = useRef(false)
    /** Monotonic reload counter — only the newest in-flight reload may apply its response. */
    const epochRef = useRef(0)
    /** True while a reload is in flight, i.e. while websocket rows must also be buffered. */
    const inFlightRef = useRef(false)
    /** Message payloads received since the in-flight reload started, in arrival order. */
    const bufferRef = useRef<TimingResultDto[][]>([])

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
                const {data, error: requestError} = await getTimingResults({path: {eventId}})
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
                setResults(replay.reduce((acc, changed) => upsert(acc, changed), data))
            } catch {
                if (disposedRef.current || epoch !== epochRef.current) return
                inFlightRef.current = false
                bufferRef.current = []
                setPending(false)
                setError(true)
            }
        })()
    }, [eventId])

    const applyChanged = useCallback((changed: TimingResultDto[]) => {
        if (inFlightRef.current) {
            bufferRef.current.push(changed)
        }
        setResults(prev => upsert(prev, changed))
    }, [])

    // Switching events must not carry rows (or a pending replay buffer) across; bumping the epoch also
    // invalidates a reload still in flight for the previous event.
    useEffect(() => {
        epochRef.current += 1
        inFlightRef.current = false
        bufferRef.current = []
        setResults([])
        setError(false)
        reload()
    }, [reload])

    return {results, pending, error, reload, applyChanged}
}
