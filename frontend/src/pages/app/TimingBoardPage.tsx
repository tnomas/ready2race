import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Stack,
    Typography,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext'
import {updateAppTimingGlobal} from '@authorization/privileges.ts'
import {timingEventRoute, timingStationRoute} from '@routes'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import CaptureButton, {CaptureButtonHandle} from '@components/timing/CaptureButton.tsx'
import MarkList from '@components/timing/MarkList.tsx'
import {createTimeMark, getTimingTeams} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import {
    classifyStatus,
    counts as queueCounts,
    discardDead,
    drain as drainQueue,
    listDead,
    PendingTimeMark,
    PostOutcome,
    PostResult,
    QueueCounts,
    requeueDead,
} from '@utils/timing/offlineQueue.ts'

/** Time of day at 1s precision — enough for an operator to recognise which capture a dead letter is. */
function formatTimeOfDay(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
}

const TimingBoardPage = () => {
    const {t} = useTranslation()
    const user = useUser()
    const {confirmAction} = useConfirmation()
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

    // Teams for the assignment dialog: loaded once per board mount (not re-fetched on every
    // websocket reconnect like the time marks/stations are — the team roster for an event does not
    // change during a running board session), sorted client-side by start number so the picker lists
    // them in the order operators expect. Teams without a start number sort last.
    const {data: teamsData, pending: teamsPending, error: teamsError} = useFetch(signal =>
        getTimingTeams({signal, path: {eventId}}),
    )
    const teams = useMemo(
        () =>
            [...(teamsData ?? [])].sort(
                (a, b) => (a.startNumber ?? Infinity) - (b.startNumber ?? Infinity),
            ),
        [teamsData],
    )

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
    /**
     * Ids of captures that never reached the durable queue — they exist only in this tab's memory and
     * are lost on reload.
     *
     * A *set*, not a boolean: the condition belongs to individual marks, and a single flag gets both
     * ends of its lifetime wrong. It was raised by one capture and then cleared by the *next* capture's
     * successful enqueue (which says nothing about the earlier, still-unbuffered mark), while the one
     * event that genuinely resolves it — the affected mark's own POST coming back ok — never cleared it
     * at all. So the banner lied in both directions. With a set, an id goes in when its enqueue fails
     * and comes out only when that same id reaches `handleMarkSaved`; the banner is simply "set
     * non-empty".
     */
    const [unbufferedMarks, setUnbufferedMarks] = useState<Set<string>>(new Set())
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

    /**
     * `markSaved` plus the one thing that resolves an unbuffered capture: the server now has the mark,
     * so losing the in-memory copy on reload no longer loses data. Used everywhere `markSaved` would
     * be — the direct capture POST and the drain alike — so it doesn't matter which of the two
     * confirms the mark first.
     */
    const handleMarkSaved = useCallback(
        (id: string) => {
            markSaved(id)
            setUnbufferedMarks(prev => {
                if (!prev.has(id)) return prev
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        },
        [markSaved],
    )

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
                    handleMarkSaved(item.id)
                } else if (outcome === 'permanent') {
                    markFailed(item.id)
                }
            }
            return {outcome, status}
        },
        [eventId, stationId, handleMarkSaved, markFailed],
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

    const onBuffered = useCallback((id: string, buffered: boolean) => {
        if (buffered) return
        setUnbufferedMarks(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    // --- Dead-letter recovery ------------------------------------------------------------------
    //
    // A dead letter is a captured time the server refused for good; dropping it silently would be data
    // loss, but leaving it in a store nobody can reach is only marginally better. The error banner is
    // therefore a way in: it opens a dialog listing what is stuck, from which the operator either
    // requeues everything (the usual case — the cause was fixed in the meantime) or explicitly throws
    // it away.
    const [deadDialogOpen, setDeadDialogOpen] = useState(false)
    const [deadItems, setDeadItems] = useState<PendingTimeMark[]>([])
    const [deadBusy, setDeadBusy] = useState(false)

    /** Re-read the dead store; also refreshes the banner counts so the two can't disagree. */
    const refreshDead = useCallback(() => {
        void listDead()
            .then(items =>
                setDeadItems([...items].sort((a, b) => b.timestampMillis - a.timestampMillis)),
            )
            .catch((error: unknown) => console.warn('[timing] dead letter list failed', error))
    }, [])

    const openDeadDialog = useCallback(() => {
        refreshDead()
        setDeadDialogOpen(true)
    }, [refreshDead])

    const handleRequeueDead = useCallback(() => {
        setDeadBusy(true)
        void requeueDead()
            .then(() => {
                setDeadDialogOpen(false)
                setDeadItems([])
                // Straight into a drain: the operator pressed "retry", so retry now rather than at the
                // next 15s tick.
                runDrain()
                refreshCounts()
            })
            .catch((error: unknown) => console.warn('[timing] dead letter requeue failed', error))
            .finally(() => setDeadBusy(false))
    }, [runDrain, refreshCounts])

    const handleDiscardDead = useCallback(() => {
        confirmAction(
            () => {
                setDeadBusy(true)
                void discardDead()
                    .then(() => {
                        setDeadDialogOpen(false)
                        setDeadItems([])
                        refreshCounts()
                    })
                    .catch((error: unknown) =>
                        console.warn('[timing] dead letter discard failed', error),
                    )
                    .finally(() => setDeadBusy(false))
            },
            {
                title: t('timing.board.deadDialog.discardConfirm.title'),
                content: t('timing.board.deadDialog.discardConfirm.content'),
                okText: t('timing.board.deadDialog.discard'),
            },
        )
    }, [confirmAction, refreshCounts, t])

    // The store can empty out underneath an open dialog (a requeued-elsewhere item, or a drain that
    // resolved things), so follow the count down to zero rather than showing a stale empty list.
    useEffect(() => {
        if (deadDialogOpen && deadCount === 0) setDeadDialogOpen(false)
    }, [deadDialogOpen, deadCount])

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
            {teamsError && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.assign.loadError')}
                </Alert>
            )}
            {queueCount > 0 && (
                <Alert severity="warning" sx={{flexShrink: 0}}>
                    {t('timing.board.banner.queuedMarks', {count: queueCount})}
                </Alert>
            )}
            {deadCount > 0 && (
                <Alert
                    severity="error"
                    sx={{flexShrink: 0, cursor: 'pointer'}}
                    onClick={openDeadDialog}
                    action={
                        <Button color="inherit" size="small" onClick={openDeadDialog}>
                            {t('timing.board.deadDialog.open')}
                        </Button>
                    }>
                    {t('timing.board.banner.deadMarks', {count: deadCount})}
                </Alert>
            )}
            {unbufferedMarks.size > 0 && (
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
                    markSaved={handleMarkSaved}
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
                <MarkList
                    eventId={eventId}
                    stationId={stationId}
                    marks={marks}
                    teams={teams}
                    teamsLoading={teamsPending}
                />
            </Box>

            <Dialog
                open={deadDialogOpen}
                onClose={() => setDeadDialogOpen(false)}
                fullWidth
                maxWidth="xs">
                <DialogTitle>{t('timing.board.deadDialog.title')}</DialogTitle>
                <DialogContent>
                    <DialogContentText sx={{mb: 2}}>
                        {t('timing.board.deadDialog.description')}
                    </DialogContentText>
                    <Stack
                        divider={<Box sx={{borderBottom: 1, borderColor: 'divider'}} />}
                        sx={{width: 1}}>
                        {deadItems.map(item => (
                            <Stack key={item.id} sx={{py: 0.75}}>
                                <Typography
                                    variant="body1"
                                    sx={{
                                        fontFamily: 'monospace',
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                    {formatTimeOfDay(item.timestampMillis)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('timing.board.deadDialog.item', {
                                        station:
                                            stations.find(s => s.id === item.station)?.name ??
                                            item.station,
                                        status: item.lastStatus ?? '–',
                                    })}
                                </Typography>
                            </Stack>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeadDialogOpen(false)} disabled={deadBusy}>
                        {t('common.close')}
                    </Button>
                    <Button color="error" onClick={handleDiscardDead} disabled={deadBusy}>
                        {t('timing.board.deadDialog.discard')}
                    </Button>
                    <Button variant="contained" onClick={handleRequeueDead} disabled={deadBusy}>
                        {t('timing.board.deadDialog.requeue')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}

export default TimingBoardPage
