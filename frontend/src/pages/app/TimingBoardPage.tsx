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
import {
    classifyStatus,
    counts as queueCounts,
    drain as drainQueue,
    PendingTimeMark,
    PostOutcome,
    PostResult,
    QueueCounts,
} from '@utils/timing/offlineQueue.ts'

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
    const [deadCount, setDeadCount] = useState(0)
    /** True once a capture failed to reach the durable queue — that mark exists only in memory. */
    const [bufferFailed, setBufferFailed] = useState(false)
    const queueCountRef = useRef(0)
    /**
     * True while we don't know the real queue size — before the first successful count, or after one
     * failed. The 15s tick must still fire in that case, otherwise a single failed `count()` on mount
     * would gate every future drain for the lifetime of the board.
     */
    const countUnknownRef = useRef(true)

    const applyCounts = useCallback((next: QueueCounts) => {
        countUnknownRef.current = false
        queueCountRef.current = next.pending
        setQueueCount(next.pending)
        setDeadCount(next.dead)
    }, [])

    /** Never rejects: a failed count leaves the last known numbers and re-arms the tick. */
    const refreshCounts = useCallback(() => {
        void queueCounts()
            .then(applyCounts)
            .catch((error: unknown) => {
                countUnknownRef.current = true
                console.warn('[timing] offline queue count failed', error)
            })
    }, [applyCounts])

    const postQueuedItem = useCallback(
        async (item: PendingTimeMark): Promise<PostResult> => {
            let outcome: PostOutcome
            let status: number | undefined
            try {
                const {error, response} = await createTimeMark({
                    path: {eventId: item.eventId},
                    body: {
                        id: item.id,
                        station: item.station,
                        timestampMillis: item.timestampMillis,
                    },
                })
                status = response.status
                outcome = error === undefined ? 'ok' : classifyStatus(status)
            } catch {
                // No response at all — network/DNS/offline. Always worth retrying.
                outcome = 'retryable'
            }
            // Only this board's own marks may be touched; items for other events/stations are
            // posted (and cleaned up by `drain`) without ever appearing in this mark list.
            if (item.eventId === eventId && item.station === stationId) {
                if (outcome === 'ok') {
                    markSaved(item.id)
                } else if (outcome === 'permanent') {
                    markFailed(item.id)
                }
            }
            return {outcome, status}
        },
        [eventId, stationId, markSaved, markFailed],
    )
    // Kept in a ref so the drain triggers below don't need `postQueuedItem` (and therefore
    // `eventId`/`stationId`/`markSaved`) as an effect dependency — only the latest version is ever
    // used, on the next drain that actually runs.
    const postQueuedItemRef = useRef(postQueuedItem)
    useEffect(() => {
        postQueuedItemRef.current = postQueuedItem
    }, [postQueuedItem])

    /**
     * Latest websocket status, mirrored so `runDrain` can consult it without becoming a dependency of
     * every trigger effect. Mirrors `useTimingBoardState`'s own guard: while `UNAUTHORIZED`, every
     * POST would just come back unauthorized too, so draining is pure noise (and would burn through
     * `attempts` on items that are perfectly fine).
     */
    const wsStatusRef = useRef(wsStatus)

    // `offlineQueue.drain` itself refuses to run two passes concurrently (a no-op returns the
    // current counts instead), so it's safe to call this from several independent triggers below
    // without any additional coordination here. Never rejects — an unhandled rejection here would
    // otherwise take out the whole drain-trigger chain.
    const runDrain = useCallback(() => {
        if (wsStatusRef.current === 'UNAUTHORIZED') return
        void drainQueue(item => postQueuedItemRef.current(item))
            .then(applyCounts)
            .catch((error: unknown) => {
                countUnknownRef.current = true
                console.warn('[timing] offline queue drain failed', error)
            })
    }, [applyCounts])

    // (d) Board mount: also refresh the counts immediately so the banner doesn't wait for the drain
    // to resolve, and drain right away — this covers "reload while offline, then reload online".
    useEffect(() => {
        refreshCounts()
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
    // on every render where `wsStatus` happens to already be `OPEN`. Owns the `wsStatusRef` mirror,
    // which it updates *before* the transition drain so the guard inside `runDrain` sees the new value.
    const prevWsStatusRef = useRef(wsStatus)
    useEffect(() => {
        wsStatusRef.current = wsStatus
        if (prevWsStatusRef.current !== 'OPEN' && wsStatus === 'OPEN') {
            runDrain()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, runDrain])

    // (c) Every 15s while the queue is non-empty — or while its size is unknown, so a failed count
    // can never permanently silence the tick. Checked against the latest values via refs, so the
    // interval itself never needs to be recreated.
    useEffect(() => {
        const interval = setInterval(() => {
            if (queueCountRef.current > 0 || countUnknownRef.current) {
                runDrain()
            }
        }, 15000)
        return () => clearInterval(interval)
    }, [runDrain])

    // (e) Tab became visible again. Covers the very common phone case where the screen was locked (or
    // the board backgrounded) across the connectivity change, so timers were throttled and neither
    // `online` nor a websocket transition fired while the user was away.
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') runDrain()
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [runDrain])

    const onBuffered = useCallback((buffered: boolean) => {
        setBufferFailed(!buffered)
    }, [])

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
            {deadCount > 0 && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.deadMarks', {count: deadCount})}
                </Alert>
            )}
            {bufferFailed && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.bufferFailed')}
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
                    onBuffered={onBuffered}
                    onQueueChanged={refreshCounts}
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
