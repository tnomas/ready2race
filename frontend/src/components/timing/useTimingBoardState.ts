import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {getTimingState, getTimingStations} from '@api/sdk.gen.ts'
import {TimeMarkDto, TimingSequenceDto, TimingStationDto} from '@api/types.gen.ts'
import {TimingWsMessage} from '@utils/timing/timingSocket.ts'
import {TimingWsStatus, useTimingWebSocket} from '@utils/timing/useTimingWebSocket.ts'

/**
 * A time mark as tracked on the board, extended with optimistic-update flags.
 * `pending` marks an entry that was captured locally but not yet confirmed by the server
 * (either via the create response or the websocket echo). `failed` marks a capture whose
 * POST failed (network error / non-2xx) and is not (yet) confirmed either.
 */
export type BoardMark = TimeMarkDto & {
    pending?: boolean
    failed?: boolean
}

export type UseTimingBoardStateResult = {
    /** This station's marks, in the order the server/websocket delivered them. */
    marks: BoardMark[]
    /** All stations of the event (used e.g. to resolve the current station's name/type). */
    stations: TimingStationDto[]
    /** Re-fetch the full timing state (stations + time marks) from the server. */
    refetch: () => void
    /** Current websocket connection status. */
    wsStatus: TimingWsStatus
    /** True while the last state load failed and a retry is pending — render a banner for this. */
    stateError: boolean
    /** Insert an optimistic local mark (flagged `pending: true`) — used by the capture flow. */
    applyLocalMark: (mark: TimeMarkDto) => void
    /** Clear the pending/failed flags of a local mark once its POST succeeded. */
    markSaved: (id: string) => void
    /** Flag a local mark as failed (its POST did not succeed — candidate for the offline queue). */
    markFailed: (id: string) => void
}

const RETRY_BASE_MILLIS = 2000
const RETRY_MAX_MILLIS = 15000

/**
 * Pure reducer applying a single websocket message to a list of board marks.
 *
 * Extracted so the live message path and the post-refetch replay path share exactly one
 * implementation — a buffered message replayed on top of a fresh server snapshot must have the same
 * effect it had when it was first applied optimistically.
 */
export function applyWsMessage(marks: BoardMark[], message: TimingWsMessage): BoardMark[] {
    switch (message.type) {
        case 'timeMarkCreated': {
            const idx = marks.findIndex(m => m.id === message.mark.id)
            if (idx === -1) {
                return [...marks, {...message.mark}]
            }
            // Already present locally as an optimistic entry — this is the server's confirmation of
            // our own capture, not a new mark: clear pending/failed and adopt the authoritative
            // fields instead of duplicating.
            const next = [...marks]
            next[idx] = {...next[idx], ...message.mark, pending: false, failed: false}
            return next
        }
        case 'timeMarkRetracted':
            return marks.map(m => (m.id === message.id ? {...m, status: 'RETRACTED'} : m))
        case 'assignmentChanged':
            return marks.map(m =>
                m.id === message.timeMark
                    ? {...m, assignedTeam: message.competitionMatchTeam ?? undefined}
                    : m,
            )
        case 'stationsChanged':
            // Only affects `stations`, handled as a side effect by the caller.
            return marks
        case 'sequenceChanged':
            // Not mark data at all — handled by the optional `onSequenceChanged` callback in
            // `useTimingBoardState`, not by this reducer. Present here only so the switch stays
            // exhaustive over `TimingWsMessage`.
            return marks
    }
}

/**
 * Single state store for one station's timing board. Loads the full timing state on mount and on
 * every websocket (re)connect, then keeps itself current from the live websocket feed. Also holds
 * the optimistic local-capture flow used by the capture UI (Tasks 8-10): `applyLocalMark` /
 * `markSaved` / `markFailed`.
 *
 * **Refetch / live-feed race.** A state refetch and the websocket feed run concurrently, so a
 * response can describe a state that is already stale by the time it lands (e.g. a retraction that
 * arrived over the socket while the request was in flight would be reverted by the older snapshot).
 * Two mechanisms prevent that:
 *
 * - *Epoch*: every refetch takes `epoch = ++epochRef.current`; a response whose epoch is no longer
 *   the current one is discarded outright, so two overlapping refetches can never resolve out of
 *   order (the newest one always wins, regardless of network timing).
 * - *Replay buffer*: while a refetch is in flight, websocket messages are both applied optimistically
 *   *and* appended to `bufferRef`. When the snapshot lands it is merged in (server wins, local
 *   `pending`/`failed` marks the server doesn't know yet are preserved) and the buffered messages are
 *   then replayed on top, in arrival order, inside the same state update. Because the server only
 *   pushes a message after committing it, any message received *before* the request was sent is
 *   already contained in the snapshot — buffering from the moment the request starts is therefore
 *   exactly the set of changes the snapshot can be missing.
 *
 * **Load path.** The initial load runs from a mount effect rather than only from the websocket's
 * `onConnect`, so a blocked websocket upgrade still yields a board over plain HTTP. A failed load
 * sets `stateError` and schedules a retry with backoff (2s/4s/8s, capped at 15s) for as long as the
 * hook is mounted; any successful load clears both. While the websocket status is `UNAUTHORIZED`,
 * `stateError` is forced to `false` and no retry is scheduled — the websocket's own banner already
 * covers it, and a retry can never succeed anyway.
 *
 * **Stations.** `stationsChanged` triggers a `getTimingStations`-only refetch (`refetchStations`),
 * guarded the same way as `refetchState` (own epoch, last-issued-wins, dropped if superseded or
 * disposed). Because the full-state snapshot also writes `stations` and its request can have started
 * before a `stationsChanged` that a concurrent `refetchStations` already applied, `stationsVersionRef`
 * (bumped on every `stationsChanged`) is captured when the snapshot's request starts; if it changed by
 * the time the snapshot lands, `refetchStations` is called once more to self-heal.
 *
 * **Locally-created marks.** `preservedLocal` in `applyServerState` keeps marks the snapshot doesn't
 * know about yet. Filtering on `pending || failed` alone has a gap: a mark can be durably confirmed
 * (both flags cleared, via the POST response or a websocket echo) while an in-flight snapshot that
 * predates that confirmation is still on the wire, in which case it has neither flag and isn't in the
 * snapshot — and would be dropped. `locallyCreatedIdsRef` tracks every id ever passed to
 * `applyLocalMark` for the current event and is also treated as preservable, closing that gap; an id
 * is dropped from the set once a snapshot actually contains it, and the set is reset on event change.
 */
export function useTimingBoardState(
    eventId: string,
    stationId: string,
    onSequenceChanged?: (sequence: TimingSequenceDto) => void,
): UseTimingBoardStateResult {
    const [allMarks, setAllMarks] = useState<BoardMark[]>([])
    const [stations, setStations] = useState<TimingStationDto[]>([])
    const [stateError, setStateError] = useState(false)
    const disposedRef = useRef(false)

    /** Monotonic refetch counter — only the newest in-flight refetch may apply its response. */
    const epochRef = useRef(0)
    /** True while a state refetch is in flight, i.e. while websocket messages must be buffered. */
    const inFlightRef = useRef(false)
    /** Websocket messages received since the in-flight refetch was started, in arrival order. */
    const bufferRef = useRef<TimingWsMessage[]>([])

    /** Monotonic counter — only the newest in-flight stations GET may apply its response. */
    const stationsEpochRef = useRef(0)
    /**
     * Bumped on every `stationsChanged` event. Captured at the start of a state/stations refetch so
     * that, once the response lands, we can tell whether a `stationsChanged` arrived mid-flight —
     * meaning the response may already be stale — and self-heal with one more stations fetch.
     */
    const stationsVersionRef = useRef(0)
    /**
     * Ids ever passed to `applyLocalMark` for the current event. Used to preserve a locally-created
     * mark across a snapshot merge even after its pending/failed flags have been cleared (see
     * `applyServerState`), since a mark can be durably confirmed (flags cleared via `markSaved` or a
     * websocket echo) before an in-flight snapshot that predates the confirmation lands. An id is
     * dropped once a snapshot actually contains it, and the whole set is reset on event change.
     */
    const locallyCreatedIdsRef = useRef<Set<string>>(new Set())

    /** Latest `onSequenceChanged`, mirrored so `onMessage` doesn't need it as a dependency. */
    const onSequenceChangedRef = useRef(onSequenceChanged)
    useEffect(() => {
        onSequenceChangedRef.current = onSequenceChanged
    })

    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const retryAttemptRef = useRef(0)
    /** Latest `refetchState`, so the retry timer can call it without a callback dependency cycle. */
    const refetchStateRef = useRef<() => void>(() => {})
    /**
     * Latest websocket status, mirrored from the `useTimingWebSocket` state via an effect so the
     * refetch/retry logic (which runs outside render) can read it without becoming a callback
     * dependency. Used to suppress the `stateError` banner and retry scheduling while unauthenticated
     * — the server will never let an unauthorized load succeed, so retrying it is just noise on top
     * of the websocket's own `UNAUTHORIZED` banner.
     */
    const wsStatusRef = useRef<TimingWsStatus>('CONNECTING')

    useEffect(() => {
        disposedRef.current = false
        return () => {
            disposedRef.current = true
            if (retryTimerRef.current !== null) {
                clearTimeout(retryTimerRef.current)
                retryTimerRef.current = null
            }
        }
    }, [])

    const clearRetryTimer = useCallback(() => {
        if (retryTimerRef.current !== null) {
            clearTimeout(retryTimerRef.current)
            retryTimerRef.current = null
        }
    }, [])

    const scheduleRetry = useCallback(() => {
        if (disposedRef.current || retryTimerRef.current !== null) return
        // Unauthorized loads never succeed on retry — the websocket's own `UNAUTHORIZED` banner
        // already tells the user what's wrong, so don't also spin the backoff loop.
        if (wsStatusRef.current === 'UNAUTHORIZED') return
        const delay = Math.min(RETRY_BASE_MILLIS * 2 ** retryAttemptRef.current, RETRY_MAX_MILLIS)
        retryAttemptRef.current += 1
        retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            refetchStateRef.current()
        }, delay)
    }, [])

    // Guarded the same way `refetchState` is (own epoch, dropped if superseded or disposed) so two
    // overlapping stations GETs — e.g. two `stationsChanged` events in quick succession — resolve
    // last-issued-wins instead of racing.
    const refetchStations = useCallback(() => {
        const epoch = ++stationsEpochRef.current
        void (async () => {
            try {
                const {data} = await getTimingStations({path: {eventId}})
                if (disposedRef.current) return
                // Superseded by a newer stations GET (another `stationsChanged`) or an event switch.
                if (epoch !== stationsEpochRef.current) return
                if (data !== undefined) {
                    setStations(data)
                }
            } catch {
                // Stations are a secondary concern: the next `stationsChanged` or full state
                // refetch will pick them up again.
            }
        })()
    }, [eventId])

    /**
     * Merge a server snapshot and then replay the messages that arrived while it was in flight.
     * Both happen in one functional update so no render can ever observe the snapshot without the
     * replay applied on top.
     */
    const applyServerState = useCallback(
        (
            serverStations: TimingStationDto[],
            serverMarks: TimeMarkDto[],
            replay: TimingWsMessage[],
            stationsVersionAtStart: number,
        ) => {
            if (disposedRef.current) return
            setStations(serverStations)
            if (stationsVersionRef.current !== stationsVersionAtStart) {
                // A `stationsChanged` landed while this snapshot was in flight, so the snapshot
                // predates it — the `setStations` above may just have reverted a fresher list that a
                // concurrent `refetchStations` already applied. Self-heal with one more fetch rather
                // than trying to reconcile in place.
                refetchStations()
            }
            setAllMarks(prev => {
                const serverIds = new Set(serverMarks.map(m => m.id))
                // The server has now durably confirmed these ids — stop tracking them as
                // locally-created so the set doesn't grow forever.
                for (const id of serverIds) {
                    locallyCreatedIdsRef.current.delete(id)
                }
                // Preserve local marks the server doesn't know about yet: still-pending/failed ones
                // (an optimistic capture the snapshot raced), and also any id we ever created locally
                // for this event — a mark can be durably confirmed (pending/failed cleared) by the
                // POST response or a websocket echo while an in-flight snapshot that predates the
                // confirmation is still on the wire; without the locally-created check, such a mark
                // has neither flag set and isn't in `serverIds`, so it would silently be dropped.
                const preservedLocal = prev.filter(
                    m =>
                        !serverIds.has(m.id) &&
                        (m.pending || m.failed || locallyCreatedIdsRef.current.has(m.id)),
                )
                const merged: BoardMark[] = [
                    ...serverMarks.map((m): BoardMark => ({...m})),
                    ...preservedLocal,
                ]
                return replay.reduce(applyWsMessage, merged)
            })
        },
        [refetchStations],
    )

    const refetchState = useCallback(() => {
        const epoch = ++epochRef.current
        inFlightRef.current = true
        bufferRef.current = []
        const stationsVersionAtStart = stationsVersionRef.current
        void (async () => {
            try {
                const {data, error} = await getTimingState({path: {eventId}})
                if (disposedRef.current) return
                // Superseded by a newer refetch — that one owns the buffer and the in-flight flag.
                if (epoch !== epochRef.current) return
                if (error !== undefined || data === undefined) {
                    inFlightRef.current = false
                    bufferRef.current = []
                    if (wsStatusRef.current !== 'UNAUTHORIZED') {
                        setStateError(true)
                        scheduleRetry()
                    }
                    return
                }
                const replay = bufferRef.current
                inFlightRef.current = false
                bufferRef.current = []
                applyServerState(data.stations, data.timeMarks, replay, stationsVersionAtStart)
                retryAttemptRef.current = 0
                clearRetryTimer()
                setStateError(false)
            } catch {
                if (disposedRef.current || epoch !== epochRef.current) return
                inFlightRef.current = false
                bufferRef.current = []
                if (wsStatusRef.current !== 'UNAUTHORIZED') {
                    setStateError(true)
                    scheduleRetry()
                }
            }
        })()
    }, [eventId, applyServerState, scheduleRetry, clearRetryTimer])

    useEffect(() => {
        refetchStateRef.current = refetchState
    })

    // Switching events must not carry marks/stations (or a pending replay buffer) across, and the
    // new event's state has to be loaded even if the websocket never connects. Bumping the epochs
    // also invalidates any state/stations refetch still in flight for the previous event.
    useEffect(() => {
        epochRef.current += 1
        stationsEpochRef.current += 1
        inFlightRef.current = false
        bufferRef.current = []
        stationsVersionRef.current = 0
        locallyCreatedIdsRef.current = new Set()
        retryAttemptRef.current = 0
        clearRetryTimer()
        setAllMarks([])
        setStations([])
        setStateError(false)
        refetchState()
    }, [eventId, refetchState, clearRetryTimer])

    const onMessage = useCallback(
        (message: TimingWsMessage) => {
            // Apply optimistically for immediate feedback, and buffer for replay so an in-flight
            // (pre-message) snapshot can't silently revert this change when it lands.
            if (inFlightRef.current) {
                bufferRef.current.push(message)
            }
            if (message.type === 'stationsChanged') {
                stationsVersionRef.current += 1
                refetchStations()
                return
            }
            if (message.type === 'sequenceChanged') {
                onSequenceChangedRef.current?.(message.sequence)
                return
            }
            setAllMarks(prev => applyWsMessage(prev, message))
        },
        [refetchStations],
    )

    const {status: wsStatus} = useTimingWebSocket(eventId, {
        onMessage,
        onConnect: refetchState,
    })

    useEffect(() => {
        wsStatusRef.current = wsStatus
        if (wsStatus === 'UNAUTHORIZED') {
            // The websocket's own banner already covers this — drop any pending state-error retry
            // and clear the banner so the two don't stack.
            clearRetryTimer()
            setStateError(false)
        }
    }, [wsStatus, clearRetryTimer])

    const applyLocalMark = useCallback((mark: TimeMarkDto) => {
        locallyCreatedIdsRef.current.add(mark.id)
        setAllMarks(prev => [...prev, {...mark, pending: true, failed: false}])
    }, [])

    const markSaved = useCallback((id: string) => {
        setAllMarks(prev => prev.map(m => (m.id === id ? {...m, pending: false, failed: false} : m)))
    }, [])

    const markFailed = useCallback((id: string) => {
        setAllMarks(prev => prev.map(m => (m.id === id ? {...m, pending: false, failed: true} : m)))
    }, [])

    const marks = useMemo(() => allMarks.filter(m => m.station === stationId), [allMarks, stationId])

    return {
        marks,
        stations,
        refetch: refetchState,
        wsStatus,
        stateError,
        applyLocalMark,
        markSaved,
        markFailed,
    }
}
