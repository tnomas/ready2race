import {useCallback, useEffect, useRef, useState} from 'react'
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
 *
 * **Refetch / live-feed race.** Same shape as `useTimingBoardState`'s, and guarded the same way:
 *
 * - *Epoch*: every `refetch` takes `epoch = ++epochRef.current`; a response whose epoch is no longer
 *   the current one is discarded, so two overlapping GETs always resolve last-issued-wins regardless
 *   of network timing.
 * - *Websocket wins*: `applySequenceChanged` bumps `wsVersionRef`. A GET captures that version when
 *   its request starts and drops its own (older) snapshot if a push landed meanwhile — a
 *   `sequenceChanged` is by definition newer than any request already on the wire, and would
 *   otherwise be overwritten by e.g. an ABORTED → "nothing active" snapshot.
 * - *Station*: a snapshot (like a push) is ignored unless it is for this station, so a station switch
 *   with a GET still in flight can't show the previous station's sequence.
 *
 * **Dismissal.** `reset` ("Neue Sequenz") records the id it dismissed in `dismissedSequenceIdRef`,
 * and both `refetch` and `applySequenceChanged` ignore that id from then on — otherwise a late
 * websocket echo or the next reconnect refetch would resurrect the summary the operator just closed.
 * Dismissal is deliberately per-mount: a *fresh* mount still shows a recent terminal sequence, which
 * is how an operator who reloaded the board gets the summary back.
 */
export function useSequence(eventId: string, stationId: string): UseSequenceResult {
    const [sequence, setSequence] = useState<TimingSequenceDto | undefined>(undefined)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)
    const [busy, setBusy] = useState(false)

    /** Monotonic GET counter — only the newest in-flight refetch may apply its response. */
    const epochRef = useRef(0)
    /** Bumped on every applied `sequenceChanged`; an in-flight GET that sees it change stands down. */
    const wsVersionRef = useRef(0)
    /** Id of the sequence the operator explicitly dismissed via `reset`, if any. */
    const dismissedSequenceIdRef = useRef<string | undefined>(undefined)

    const refetch = useCallback(() => {
        const epoch = ++epochRef.current
        const wsVersion = wsVersionRef.current
        setLoading(true)
        void getActiveTimingSequence({path: {eventId}, query: {stationId}})
            .then(({data, error: err}) => {
                // Superseded by a newer refetch (or by an event/station switch).
                if (epoch !== epochRef.current) return
                if (err !== undefined) {
                    setError(true)
                    return
                }
                setError(false)
                // A `sequenceChanged` arrived while this GET was in flight — it is newer than this
                // snapshot, so keep what the push wrote.
                if (wsVersion !== wsVersionRef.current) return
                // `sequence` is nullable in the contract (`null` == nothing active), while the
                // hook's own state uses `undefined` for that - normalize once, here.
                const next = data?.sequence ?? undefined
                if (next !== undefined) {
                    if (next.station !== stationId) return
                    if (next.id === dismissedSequenceIdRef.current) return
                }
                setSequence(next)
            })
            .catch(() => {
                if (epoch !== epochRef.current) return
                setError(true)
            })
            .finally(() => {
                if (epoch !== epochRef.current) return
                setLoading(false)
            })
    }, [eventId, stationId])

    useEffect(() => {
        setSequence(undefined)
        dismissedSequenceIdRef.current = undefined
        refetch()
    }, [refetch])

    const applySequenceChanged = useCallback(
        (next: TimingSequenceDto) => {
            if (next.station !== stationId) return
            if (next.id === dismissedSequenceIdRef.current) return
            wsVersionRef.current++
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
                // A brand-new sequence has a new id, so a previous dismissal can never suppress it.
                dismissedSequenceIdRef.current = undefined
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

    const reset = useCallback(() => {
        // Only ever reachable from the terminal summary view; remembering the id is what keeps a late
        // websocket echo or the next reconnect refetch from re-opening it.
        if (sequence !== undefined) {
            dismissedSequenceIdRef.current = sequence.id
        }
        setSequence(undefined)
    }, [sequence])

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
