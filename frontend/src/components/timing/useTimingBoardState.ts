import {useCallback, useEffect, useRef, useState} from 'react'
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
    /** Insert an optimistic local mark (flagged `pending: true`) — used by the capture flow. */
    applyLocalMark: (mark: TimeMarkDto) => void
    /** Clear the pending/failed flags of a local mark once its POST succeeded. */
    markSaved: (id: string) => void
    /** Flag a local mark as failed (its POST did not succeed — candidate for the offline queue). */
    markFailed: (id: string) => void
}

/**
 * Single state store for one station's timing board. Loads the full timing state on mount and on
 * every websocket (re)connect (server wins, but local marks that are still `pending`/`failed` and
 * not yet known to the server are preserved across that merge), then keeps itself current from the
 * live websocket feed. Also holds the optimistic local-capture flow used by the capture UI
 * (Tasks 8-10): `applyLocalMark` / `markSaved` / `markFailed`.
 */
export function useTimingBoardState(eventId: string, stationId: string): UseTimingBoardStateResult {
    const [allMarks, setAllMarks] = useState<BoardMark[]>([])
    const [stations, setStations] = useState<TimingStationDto[]>([])
    const disposedRef = useRef(false)

    useEffect(() => {
        disposedRef.current = false
        return () => {
            disposedRef.current = true
        }
    }, [])

    const applyServerState = useCallback((serverStations: TimingStationDto[], serverMarks: TimeMarkDto[]) => {
        if (disposedRef.current) return
        setStations(serverStations)
        setAllMarks(prev => {
            const serverIds = new Set(serverMarks.map(m => m.id))
            // Preserve local-only marks the server doesn't know about yet (still pending/failed),
            // so an optimistic capture never disappears just because a refetch raced it.
            const preservedLocal = prev.filter(m => (m.pending || m.failed) && !serverIds.has(m.id))
            return [...serverMarks.map((m): BoardMark => ({...m})), ...preservedLocal]
        })
    }, [])

    const refetchState = useCallback(() => {
        void (async () => {
            const {data} = await getTimingState({path: {eventId}})
            if (data && !disposedRef.current) {
                applyServerState(data.stations, data.timeMarks)
            }
        })()
    }, [eventId, applyServerState])

    const refetchStations = useCallback(() => {
        void (async () => {
            const {data} = await getTimingStations({path: {eventId}})
            if (data && !disposedRef.current) {
                setStations(data)
            }
        })()
    }, [eventId])

    const onMessage = useCallback((message: TimingWsMessage) => {
        switch (message.type) {
            case 'timeMarkCreated':
                setAllMarks(prev => {
                    const idx = prev.findIndex(m => m.id === message.mark.id)
                    if (idx === -1) {
                        return [...prev, {...message.mark}]
                    }
                    // Already present locally as an optimistic entry — this is the server's
                    // confirmation of our own capture, not a new mark: clear pending/failed and
                    // adopt the authoritative fields instead of duplicating.
                    const next = [...prev]
                    next[idx] = {...next[idx], ...message.mark, pending: false, failed: false}
                    return next
                })
                break
            case 'timeMarkRetracted':
                setAllMarks(prev =>
                    prev.map(m => (m.id === message.id ? {...m, status: 'RETRACTED'} : m)),
                )
                break
            case 'assignmentChanged':
                setAllMarks(prev =>
                    prev.map(m =>
                        m.id === message.timeMark
                            ? {...m, assignedTeam: message.competitionMatchTeam ?? undefined}
                            : m,
                    ),
                )
                break
            case 'stationsChanged':
                refetchStations()
                break
        }
    }, [refetchStations])

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

    return {
        marks: allMarks.filter(m => m.station === stationId),
        stations,
        refetch: refetchState,
        wsStatus,
        applyLocalMark,
        markSaved,
        markFailed,
    }
}
