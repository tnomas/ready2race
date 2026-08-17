import {Alert, Box} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute, timingStationRoute} from '@routes'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import CaptureButton, {CaptureButtonHandle} from '@components/timing/CaptureButton.tsx'
import MarkList from '@components/timing/MarkList.tsx'
import {createTimeMark} from '@api/sdk.gen.ts'
import {count as countQueue, drain as drainQueue, PendingTimeMark} from '@utils/timing/offlineQueue.ts'

const TimingBoardPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()
    const {eventId} = timingEventRoute.useParams()
    const {stationId} = timingStationRoute.useParams()

    useEffect(() => {
        if (!user.checkPrivilege(updateAppTimingGlobal)) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate])

    const clock = useServerClock()
    const {marks, stations, wsStatus, stateError, applyLocalMark, markSaved, markFailed} =
        useTimingBoardState(eventId, stationId)

    const station = stations.find(s => s.id === stationId)

    const showReconnectBanner = wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'
    const showUnauthorizedBanner = wsStatus === 'UNAUTHORIZED'
    const showClockDegradedBanner = clock.quality === 'DEGRADED'

    const captureButtonRef = useRef<CaptureButtonHandle>(null)

    // --- Offline queue: drain triggers + status banner -----------------------------------------
    //
    // The queue is global (marks from other events/stations captured on this device belong in it
    // too), so `drain` always attempts every queued item regardless of the board currently shown.
    // Per-item success is only turned into a `markSaved` call here when the item belongs to THIS
    // board (same event + station) — an item for a different board is still posted (and removed
    // from the queue on success) but must not touch this board's mark list.
    const [queueCount, setQueueCount] = useState(0)
    const queueCountRef = useRef(0)

    const setQueueCountState = useCallback((next: number) => {
        queueCountRef.current = next
        setQueueCount(next)
    }, [])

    const postQueuedItem = useCallback(
        async (item: PendingTimeMark): Promise<boolean> => {
            let success: boolean
            try {
                const {error} = await createTimeMark({
                    path: {eventId: item.eventId},
                    body: {id: item.id, station: item.station, timestampMillis: item.timestampMillis},
                })
                success = error === undefined
            } catch {
                success = false
            }
            if (success && item.eventId === eventId && item.station === stationId) {
                markSaved(item.id)
            }
            return success
        },
        [eventId, stationId, markSaved],
    )
    // Kept in a ref so the drain triggers below don't need `postQueuedItem` (and therefore
    // `eventId`/`stationId`/`markSaved`) as an effect dependency — only the latest version is ever
    // used, on the next drain that actually runs.
    const postQueuedItemRef = useRef(postQueuedItem)
    useEffect(() => {
        postQueuedItemRef.current = postQueuedItem
    }, [postQueuedItem])

    // `offlineQueue.drain` itself refuses to run two passes concurrently (a no-op returns the
    // current count instead), so it's safe to call this from several independent triggers below
    // without any additional coordination here.
    const runDrain = useCallback(() => {
        void drainQueue(item => postQueuedItemRef.current(item)).then(setQueueCountState)
    }, [setQueueCountState])

    // (d) Board mount: also refresh the count immediately so the banner doesn't wait for the drain
    // to resolve, and drain right away — this covers "reload while offline, then reload online".
    useEffect(() => {
        void countQueue().then(setQueueCountState)
        runDrain()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // (b) Regained connectivity.
    useEffect(() => {
        const handleOnline = () => runDrain()
        window.addEventListener('online', handleOnline)
        return () => window.removeEventListener('online', handleOnline)
    }, [runDrain])

    // (a) Websocket (re)connect — trigger only on the CONNECTING/RECONNECTING → OPEN transition, not
    // on every render where `wsStatus` happens to already be `OPEN`.
    const prevWsStatusRef = useRef(wsStatus)
    useEffect(() => {
        if (prevWsStatusRef.current !== 'OPEN' && wsStatus === 'OPEN') {
            runDrain()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, runDrain])

    // (c) Every 15s while the queue is non-empty (checked against the latest count via the ref, so
    // the interval itself never needs to be recreated).
    useEffect(() => {
        const interval = setInterval(() => {
            if (queueCountRef.current > 0) {
                runDrain()
            }
        }, 15000)
        return () => clearInterval(interval)
    }, [runDrain])

    const onQueued = useCallback(() => {
        void countQueue().then(setQueueCountState)
    }, [setQueueCountState])

    // Space bar triggers the same capture flow as the button — skipped while an input/textarea/select
    // has focus (so typing a space in a field doesn't fire a capture), while a MUI dialog is open
    // (e.g. a future assignment/confirmation dialog sits on top of the board), or while the session is
    // unauthorized (mirrors CaptureButton's own `disabled` condition — that button also guards this
    // internally, but the shortcut short-circuits here too so it never even calls into it).
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space' && event.key !== ' ') return

            const active = document.activeElement
            const tag = active?.tagName
            const isFormField =
                tag === 'INPUT' ||
                tag === 'TEXTAREA' ||
                tag === 'SELECT' ||
                (active instanceof HTMLElement && active.isContentEditable)
            const isDialogOpen = document.querySelector('[role="dialog"]') !== null

            if (isFormField || isDialogOpen || showUnauthorizedBanner) return

            event.preventDefault()
            captureButtonRef.current?.capture()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [showUnauthorizedBanner])

    return (
        <Box
            sx={{
                width: 1,
                height: '100dvh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
            <BoardHeader
                stationName={station?.name}
                wsStatus={wsStatus}
                clockQuality={clock.quality}
                now={clock.now}
            />

            {showUnauthorizedBanner && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.unauthorized')}
                </Alert>
            )}
            {!showUnauthorizedBanner && showReconnectBanner && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.reconnecting')}
                </Alert>
            )}
            {showClockDegradedBanner && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.clockDegraded')}
                </Alert>
            )}
            {stateError && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.stateError')}
                </Alert>
            )}
            {queueCount > 0 && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.queuedMarks', {count: queueCount})}
                </Alert>
            )}

            <Box
                sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    p: 2,
                }}>
                <CaptureButton
                    ref={captureButtonRef}
                    eventId={eventId}
                    station={station}
                    now={clock.now}
                    unauthorized={showUnauthorizedBanner}
                    applyLocalMark={applyLocalMark}
                    markSaved={markSaved}
                    markFailed={markFailed}
                    onQueued={onQueued}
                />
            </Box>

            <Box
                sx={{
                    flex: '0 0 33%',
                    minHeight: 0,
                    overflowY: 'auto',
                    borderTop: 1,
                    borderColor: 'divider',
                    px: 2,
                    py: 1,
                }}>
                <MarkList eventId={eventId} stationId={stationId} marks={marks} />
            </Box>
        </Box>
    )
}

export default TimingBoardPage
