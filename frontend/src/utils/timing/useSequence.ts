import {useCallback, useEffect, useState} from 'react'
import {
    abortTimingSequence,
    createTimingSequence,
    getActiveTimingSequence,
    skipTimingSequenceEntry,
    startTimingSequence,
} from '@api/sdk.gen.ts'
import {CreateSequenceRequest, TimingSequenceDto} from '@api/types.gen.ts'

export type UseSequenceResult = {
    /** The active (or last-known) sequence for this station, or `undefined` before it loads / once
     *  reset. Note that GET-active only ever returns ARMED/RUNNING sequences — DONE/ABORTED states
     *  are only ever seen here via `applySequenceChanged` (the websocket echo), never via `refetch`. */
    sequence: TimingSequenceDto | undefined
    loading: boolean
    error: boolean
    /** True while a create/start/abort/skip request is in flight. */
    busy: boolean
    refetch: () => void
    /** Feed a `sequenceChanged` websocket message in — pass this to `useTimingBoardState`. */
    applySequenceChanged: (sequence: TimingSequenceDto) => void
    create: (request: CreateSequenceRequest) => Promise<boolean>
    start: () => Promise<boolean>
    abort: () => Promise<boolean>
    skip: (entryId: string) => Promise<boolean>
    /** Clear the local sequence so the setup form reappears (the "Neue Sequenz" action). */
    reset: () => void
}

/**
 * Active start-sequence state for one (event, station).
 *
 * Loads the currently active sequence on mount and whenever `eventId`/`stationId` change. From then
 * on it is kept current primarily by the caller feeding `sequenceChanged` websocket messages into
 * `applySequenceChanged` (wired through `useTimingBoardState`'s matching parameter) — the board page
 * also calls `refetch` again on every websocket reconnect, mirroring the full-state refetch it
 * already does for marks/stations.
 *
 * `refetch` (GET active) only ever finds ARMED/RUNNING sequences by design — a DONE/ABORTED sequence
 * is no longer "active". So `create` (whose response is just an id) refetches to load the full ARMED
 * dto, but `start`/`abort`/`skip` deliberately do *not* refetch on success: an abort right after a
 * refetch would immediately "lose" the ABORTED summary (refetch would find nothing active and the
 * panel would jump straight back to the setup form). Those three rely entirely on the
 * `sequenceChanged` broadcast — which the backend sends for every mutation — to deliver the
 * terminal-state dto.
 */
export function useSequence(eventId: string, stationId: string): UseSequenceResult {
    const [sequence, setSequence] = useState<TimingSequenceDto | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const [busy, setBusy] = useState(false)

    const refetch = useCallback(() => {
        setLoading(true)
        void getActiveTimingSequence({path: {eventId}, query: {stationId}})
            .then(({data, error: err}) => {
                if (err !== undefined) {
                    setError(true)
                    return
                }
                setSequence(data?.sequence)
                setError(false)
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false))
    }, [eventId, stationId])

    useEffect(() => {
        setSequence(undefined)
        refetch()
    }, [refetch])

    const applySequenceChanged = useCallback(
        (next: TimingSequenceDto) => {
            if (next.station !== stationId) return
            setSequence(next)
        },
        [stationId],
    )

    const create = useCallback(
        async (request: CreateSequenceRequest) => {
            setBusy(true)
            try {
                const {error: err} = await createTimingSequence({path: {eventId}, body: request})
                if (err !== undefined) return false
                refetch()
                return true
            } catch {
                return false
            } finally {
                setBusy(false)
            }
        },
        [eventId, refetch],
    )

    const start = useCallback(async () => {
        if (sequence === undefined) return false
        setBusy(true)
        try {
            const {error: err} = await startTimingSequence({
                path: {eventId, sequenceId: sequence.id},
            })
            return err === undefined
        } catch {
            return false
        } finally {
            setBusy(false)
        }
    }, [eventId, sequence])

    const abort = useCallback(async () => {
        if (sequence === undefined) return false
        setBusy(true)
        try {
            const {error: err} = await abortTimingSequence({
                path: {eventId, sequenceId: sequence.id},
            })
            return err === undefined
        } catch {
            return false
        } finally {
            setBusy(false)
        }
    }, [eventId, sequence])

    const skip = useCallback(
        async (entryId: string) => {
            if (sequence === undefined) return false
            setBusy(true)
            try {
                const {error: err} = await skipTimingSequenceEntry({
                    path: {eventId, sequenceId: sequence.id, entryId},
                })
                return err === undefined
            } catch {
                return false
            } finally {
                setBusy(false)
            }
        },
        [eventId, sequence],
    )

    const reset = useCallback(() => setSequence(undefined), [])

    return {
        sequence,
        loading,
        error,
        busy,
        refetch,
        applySequenceChanged,
        create,
        start,
        abort,
        skip,
        reset,
    }
}
