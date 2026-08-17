import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {getTimingState, getTimingStations} from '@api/sdk.gen.ts'
import {TimeMarkDto, TimingStationDto} from '@api/types.gen.ts'
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
 * hook is mounted; any successful load clears both.
 */
export function useTimingBoardState(eventId: string, stationId: string): UseTimingBoardStateResult {
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

    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const retryAttemptRef = useRef(0)
    /** Latest `refetchState`, so the retry timer can call it without a callback dependency cycle. */
    const refetchStateRef = useRef<() => void>(() => {})

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
        const delay = Math.min(RETRY_BASE_MILLIS * 2 ** retryAttemptRef.current, RETRY_MAX_MILLIS)
        retryAttemptRef.current += 1
        retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null
            refetchStateRef.current()
        }, delay)
    }, [])

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
        ) => {
            if (disposedRef.current) return
            setStations(serverStations)
            setAllMarks(prev => {
                const serverIds = new Set(serverMarks.map(m => m.id))
                // Preserve local-only marks the server doesn't know about yet (still
                // pending/failed), so an optimistic capture never disappears just because a
                // refetch raced it.
                const preservedLocal = prev.filter(m => (m.pending || m.failed) && !serverIds.has(m.id))
                const merged: BoardMark[] = [
                    ...serverMarks.map((m): BoardMark => ({...m})),
                    ...preservedLocal,
                ]
                return replay.reduce(applyWsMessage, merged)
            })
        },
        [],
    )

    const refetchState = useCallback(() => {
        const epoch = ++epochRef.current
        inFlightRef.current = true
        bufferRef.current = []
        void (async () => {
            try {
                const {data, error} = await getTimingState({path: {eventId}})
                if (disposedRef.current) return
                // Superseded by a newer refetch — that one owns the buffer and the in-flight flag.
                if (epoch !== epochRef.current) return
                if (error !== undefined || data === undefined) {
                    inFlightRef.current = false
                    bufferRef.current = []
                    setStateError(true)
                    scheduleRetry()
                    return
                }
                const replay = bufferRef.current
                inFlightRef.current = false
                bufferRef.current = []
                applyServerState(data.stations, data.timeMarks, replay)
                retryAttemptRef.current = 0
                clearRetryTimer()
                setStateError(false)
            } catch {
                if (disposedRef.current || epoch !== epochRef.current) return
                inFlightRef.current = false
                bufferRef.current = []
                setStateError(true)
                scheduleRetry()
            }
        })()
    }, [eventId, applyServerState, scheduleRetry, clearRetryTimer])

    useEffect(() => {
        refetchStateRef.current = refetchState
    })

    const refetchStations = useCallback(() => {
        void (async () => {
            try {
                const {data} = await getTimingStations({path: {eventId}})
                if (data !== undefined && !disposedRef.current) {
                    setStations(data)
                }
            } catch {
                // Stations are a secondary concern: the next `stationsChanged` or full state
                // refetch will pick them up again.
            }
        })()
    }, [eventId])

    // Switching events must not carry marks/stations (or a pending replay buffer) across, and the
    // new event's state has to be loaded even if the websocket never connects. Bumping the epoch
    // also invalidates any refetch still in flight for the previous event.
    useEffect(() => {
        epochRef.current += 1
        inFlightRef.current = false
        bufferRef.current = []
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
                refetchStations()
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

    const applyLocalMark = useCallback((mark: TimeMarkDto) => {
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
