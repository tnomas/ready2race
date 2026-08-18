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
    ToggleButton,
    ToggleButtonGroup,
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
import CaptureButton from '@components/timing/CaptureButton.tsx'
import TeamCaptureGrid from '@components/timing/TeamCaptureGrid.tsx'
import MarkList from '@components/timing/MarkList.tsx'
import SequencePanel from '@components/timing/SequencePanel.tsx'
import {assignCapturedMark, CaptureFn, useCaptureFlow} from '@components/timing/useCaptureFlow.ts'
import {useSequence} from '@utils/timing/useSequence.ts'
import {unlockAudio} from '@utils/timing/feedback.ts'
import {isSpaceOwnedByFocusedControl, isTypingContext} from '@utils/timing/shortcutGuards.ts'
import {createTimeMark, getTimingTeams} from '@api/sdk.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
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
    const feedback = useFeedback()
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
    const sequenceState = useSequence(eventId, stationId)
    const {refetch: refetchSequence} = sequenceState
    const {
        marks,
        stations,
        refetch,
        wsStatus,
        stateError,
        applyLocalMark,
        markSaved,
        markFailed,
        applyLocalAssignment,
    } = useTimingBoardState(eventId, stationId, sequenceState.applySequenceChanged)

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

    // --- Capture view -----------------------------------------------------------------------------
    //
    // Two ways to record a time, switched by the operator: the classic two-step button (bank a time,
    // assign it afterwards from the mark list) and the direct-tap team grid (one gesture does both).
    // Which one is right depends on the post, not on the software — a finish line with 60 teams
    // streaming in wants the button, a split where the operator knows who is coming wants the grid —
    // so this is a toggle rather than a decision baked into the station type.
    //
    // Except on START stations: those own the whole screen with their sequence panel, and their job is
    // to start heats, not to attribute times to individual teams. The toggle is not rendered there.
    const [captureView, setCaptureView] = useState<'TWO_STEP' | 'TEAMS'>('TWO_STEP')
    const teamsViewAvailable = station !== undefined && station.type !== 'START'
    const showTeamsView = teamsViewAvailable && captureView === 'TEAMS'

    /**
     * Teams that are done **at this station**: they have an ACTIVE mark here that is assigned to them.
     * `marks` is already filtered to this station by `useTimingBoardState`, so no station check is
     * needed — and it must stay that way, since a team having finished at the *previous* split says
     * nothing about this one.
     *
     * Optimistic (`pending`) and queued (`failed`) marks count: the capture happened, the server just
     * doesn't know yet, and offering the button again would double-record the team. Retracted marks do
     * not count, so undoing a mis-tap frees the team up again.
     */
    const finishedTeams = useMemo(() => {
        const finished = new Set<string>()
        for (const mark of marks) {
            if (mark.status === 'ACTIVE' && mark.assignedTeam !== undefined) {
                finished.add(mark.assignedTeam)
            }
        }
        return finished
    }, [marks])

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

            // The assignment half of a direct-tap capture (`competitionMatchTeam` is absent on every
            // two-step item, and on every item written before the field existed). Only attempted once
            // the mark itself is stored, since assigning a mark the server doesn't have can only 404.
            //
            // A failed assignment deliberately does **not** change the outcome: the item still counts
            // as drained and leaves the queue. The queue's job is the irreplaceable half — the observed
            // time — and re-POSTing the mark forever to retry an assignment would keep the "not yet
            // transmitted" banner up for a time that is safely stored. The mark simply stays
            // unassigned and the operator attaches the team from the mark list, exactly as in the
            // two-step flow.
            if (outcome === 'ok' && item.competitionMatchTeam !== undefined) {
                const assigned = await assignCapturedMark(
                    item.eventId,
                    item.id,
                    item.competitionMatchTeam,
                )
                if (!assigned) {
                    console.warn(
                        `[timing] Zeitstempel ${item.id} wurde nachträglich übertragen, die Team-Zuordnung schlug jedoch fehl`,
                    )
                    if (item.eventId === eventId && item.station === stationId) {
                        applyLocalAssignment(item.id, null)
                        feedback.error(t('timing.assign.error'))
                    }
                }
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
        [eventId, stationId, handleMarkSaved, markFailed, applyLocalAssignment, feedback, t],
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
     *
     * Skipping is safe precisely because the state is temporary: captures still go into the queue while
     * unauthorized, and the websocket's 30s retry restores `OPEN` on its own once the session is valid
     * again, at which point the (a) transition trigger below drains everything that piled up. Returning
     * to the tab also triggers a drain, for the case where a re-login happened elsewhere.
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
            // The active sequence (Task C) has the same "missed a message while disconnected" gap as
            // marks/stations, so refetch it on the same reconnect transition. See `useSequence`'s docs
            // for why this can't restore a DONE/ABORTED sequence (GET active never returns those).
            refetchSequence()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, runDrain, refetchSequence])

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
    // `online` nor a websocket transition fired while the user was away. Both a drain and a state
    // refetch belong on this one trigger (see the staleness note below for why the refetch is needed
    // here too), so a single listener does both rather than two independent ones fighting for the
    // same event.
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                runDrain()
                refetch()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [runDrain, refetch])

    // --- Staleness safety net -------------------------------------------------------------------
    //
    // The websocket is the board's only push channel, and a subscriber can go quiet without the socket
    // ever closing (a proxy holding a half-open connection, a server-side fanout registration dropped
    // without a close frame). None of the drain triggers above help there — the queue is empty, the
    // status still reads OPEN, and the board silently shows a frozen list. So poll the full state
    // outright: on every return to visibility (handled by the listener above) and once a minute while
    // mounted. The refetch is epoch-guarded and merges rather than replaces (see `useTimingBoardState`),
    // so an extra one is never harmful — just a wasted request in the normal case.
    useEffect(() => {
        const interval = setInterval(refetch, 60000)
        return () => clearInterval(interval)
    }, [refetch])

    const onBuffered = useCallback((id: string, buffered: boolean) => {
        if (buffered) return
        setUnbufferedMarks(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    /**
     * A combined capture+assign whose mark went through but whose assignment did not. The time is
     * safe; only the team is missing, so roll the optimistic assignment back (otherwise the board — and
     * the team grid's "finished" state — would keep showing a team the server never recorded until the
     * next full refetch) and say so, because the mark list looks perfectly healthy otherwise.
     */
    const handleAssignFailed = useCallback(
        (markId: string) => {
            applyLocalAssignment(markId, null)
            feedback.error(t('timing.assign.error'))
        },
        [applyLocalAssignment, feedback, t],
    )

    /**
     * The board's single capture flow, shared by the big two-step button, the Space shortcut and the
     * team grid's taps/keys — see `useCaptureFlow` for the write-ahead protocol. Owning it here (rather
     * than inside each surface) is what keeps "one physical press, one mark" true no matter which
     * surface produced it.
     */
    const capture = useCaptureFlow({
        eventId,
        station,
        now: clock.now,
        applyLocalMark,
        markSaved: handleMarkSaved,
        markFailed,
        onBuffered,
        onQueueChanged: refreshCounts,
        onAssignFailed: handleAssignFailed,
    })
    const captureRef = useRef<CaptureFn>(capture)
    captureRef.current = capture

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

    // Space bar banks an *unassigned* mark, in every capture view — including the team grid, where it
    // is the escape hatch for "someone crossed the line and I don't know who yet". Skipped only while
    // an input/textarea/select has focus (so typing a space in a field doesn't fire a capture), while a
    // MUI dialog is open (the assignment/confirmation dialogs sit on top of the board) — both via
    // `isTypingContext` — or while a focused control owns the Space key itself (`isSpaceOwnedByFocused
    // Control`: the start-sequence panel and the capture-view toggle, where an operator pressing space
    // must activate the button rather than silently record a time mark). Notably *not* skipped while
    // the session is unauthorized: like the button itself, the shortcut still captures, and the mark
    // waits in the offline queue until the operator has logged in again.
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== 'Space' && event.key !== ' ') return
            if (isTypingContext() || isSpaceOwnedByFocusedControl()) return

            event.preventDefault()
            captureRef.current()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return (
        // The board is a full-screen capture surface, not a page inside the app shell: it is rendered
        // through `AppLayout`, whose max-width container, padding and language widget would otherwise
        // box it in and make the page scroll. Taking it out of flow with `position: fixed` + `inset: 0`
        // above the layout chrome (drawer + 1, still below MUI's modal/snackbar layers at 1300/1400, so
        // this board's dialogs and feedback snackbars keep working) is what actually makes it
        // full-screen — `height: 100dvh` only sized the element, it did not cover anything.
        <Box
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: theme => theme.zIndex.drawer + 1,
                bgcolor: 'background.default',
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
                    flexDirection: 'column',
                    gap: 2,
                    p: 2,
                }}>
                {station?.type === 'START' && (
                    <Box sx={{flexGrow: 1, minHeight: 0, display: 'flex'}}>
                        <SequencePanel
                            stationId={stationId}
                            teams={teams}
                            teamsLoading={teamsPending}
                            now={clock.now}
                            sequenceState={sequenceState}
                        />
                    </Box>
                )}
                {teamsViewAvailable && (
                    <ToggleButtonGroup
                        data-capture-view-toggle=""
                        exclusive
                        size="small"
                        value={captureView}
                        // `null` arrives when the already-selected button is pressed again; keeping the
                        // current view then is what makes this a switch rather than a way to end up
                        // with no capture surface at all.
                        onChange={(_, value: 'TWO_STEP' | 'TEAMS' | null) => {
                            if (value !== null) setCaptureView(value)
                        }}
                        sx={{flexShrink: 0, alignSelf: 'flex-start'}}>
                        <ToggleButton value="TWO_STEP">
                            {t('timing.board.teams.viewTwoStep')}
                        </ToggleButton>
                        <ToggleButton value="TEAMS">
                            {t('timing.board.teams.viewTeams')}
                        </ToggleButton>
                    </ToggleButtonGroup>
                )}
                {/* `onPointerDown` unlocks the WebAudio context from a real user gesture (see
                    `unlockAudio`): a board whose operator only ever taps the capture button would
                    otherwise stay mute for the sequence countdown beeps. */}
                <Box
                    onPointerDown={unlockAudio}
                    sx={{
                        flexShrink: showTeamsView ? 1 : 0,
                        minHeight: 0,
                        display: 'flex',
                        flexGrow: station?.type === 'START' ? 0 : 1,
                    }}>
                    {showTeamsView ? (
                        <TeamCaptureGrid
                            teams={teams}
                            teamsLoading={teamsPending}
                            finishedTeams={finishedTeams}
                            capture={capture}
                            disabled={clock.now() === null || station === undefined}
                            disabledReason={
                                clock.now() === null
                                    ? t('timing.board.capture.clockNotSynced')
                                    : t('timing.board.capture.stationLoading')
                            }
                        />
                    ) : (
                        <CaptureButton
                            station={station}
                            now={clock.now}
                            onCapture={capture}
                            compact={station?.type === 'START'}
                        />
                    )}
                </Box>
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
