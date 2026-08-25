import {
    Alert,
    Box,
    Button,
    ButtonBase,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Drawer,
    Menu,
    MenuItem,
    Stack,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ListAltIcon from '@mui/icons-material/ListAlt'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext'
import {updateAppTimingGlobal, updateEventGlobal} from '@authorization/privileges.ts'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {deviceSessionForStation} from '@utils/timing/deviceSession.ts'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import CaptureButton from '@components/timing/CaptureButton.tsx'
import MarkList from '@components/timing/MarkList.tsx'
import MatchCaptureView from '@components/timing/MatchCaptureView.tsx'
import ArmSwitch from '@components/timing/ArmSwitch.tsx'
import DayScheduleColumn, {
    initialScheduleCollapsed,
    persistScheduleCollapsed,
} from '@components/timing/DayScheduleColumn.tsx'
import StartBoardPanel from '@components/timing/StartBoardPanel.tsx'
import {matchTitle} from '@components/timing/matchDisplay.tsx'
import {useOfficialTimes} from '@components/timing/leitstand/useOfficialTimes.ts'
import {useTimingSettings} from '@utils/timing/useTimingSettings.ts'
import {assignCapturedMark, CaptureFn, useCaptureFlow} from '@components/timing/useCaptureFlow.ts'
import {useSequence} from '@utils/timing/useSequence.ts'
import {unlockAudio} from '@utils/timing/feedback.ts'
import {useFalseStartTone} from '@utils/timing/useFalseStartTone.ts'
import {isSpaceOwnedByFocusedControl, isTypingContext} from '@utils/timing/shortcutGuards.ts'
import {orderTeamsForBoard} from '@utils/timing/teamOrder.ts'
import {teamLabel} from '@utils/timing/teamLabel.ts'
import {useTimingMatches} from '@utils/timing/useTimingMatches.ts'
import {resolveStartSelection} from '@utils/timing/matchBoard.ts'
import {resolveFinishFocus} from '@utils/timing/boardFocus.ts'
import {armedGateApplies, captureAllowed} from '@utils/timing/armed.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {TimingMatchDto} from '@api/types.gen.ts'
import {createTimeMark, falseStartMatch, getTimingTeams, retractMatchAttempt} from '@api/sdk.gen.ts'
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

/**
 * Route-unabhängig: hängt unter `/app/timing/$eventId/$stationId` (App-Welt) und kanonisch unter
 * `/event/$eventId/timing/$stationId` (Betrieb-Reiter, geteilte Posten-Links) — Parameter kommen
 * als Props von der jeweiligen Route.
 */
export type TimingBoardPageProps = {
    eventId: string
    stationId: string
}

const TimingBoardPage = ({eventId, stationId}: TimingBoardPageProps) => {
    const {t} = useTranslation()
    const user = useUser()
    const feedback = useFeedback()
    const {confirmAction} = useConfirmation()
    const navigate = useNavigate()

    useEffect(() => {
        // Ein geteiltes Gerät hat keine Sitzung, sondern das Geräte-Token dieses Postens - dann
        // greift die Privilegien-Prüfung nicht (die Lese- und Erfassungswege authentifiziert der
        // Server über das Token). updateEventGlobal zählt wie serverseitig ebenfalls.
        if (deviceSessionForStation(eventId, stationId) !== null) return
        if (
            !user.checkPrivilege(updateAppTimingGlobal) &&
            !user.checkPrivilege(updateEventGlobal)
        ) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate, eventId, stationId])

    const clock = useServerClock()
    const sequenceState = useSequence(eventId, stationId)
    const {refetch: refetchSequence} = sequenceState
    // Offizielle Zeiten für die Live-Anzeige am Boot (Zielposten): initialer Stand per GET, danach
    // aus den officialTimeChanged-Nachrichten des Boards — beides läuft auch mit Geräte-Token.
    const {officialTimes, applyChanged: applyOfficialTimes, reload: reloadOfficialTimes} =
        useOfficialTimes(eventId)
    const officialTimesByTeam = useMemo(
        () => new Map(officialTimes.map(entry => [entry.competitionMatchTeam, entry])),
        [officialTimes],
    )
    // Genauigkeit der Veranstaltung für die Zeit-Anzeige am Boot: initial per GET (läuft auch mit
    // Geräte-Token), live über settingsChanged.
    const {settings, applyChanged: applySettingsChanged, reload: reloadSettings} =
        useTimingSettings(eventId)

    // Die Partie-Startliste der intern gezeiteten Wettkämpfe (leer ohne INTERN-Wettkampf). Zwei
    // Auffrischungswege, beide entprellt über denselben `bump`: `matchesChanged` meldet, dass die
    // Partienmenge selbst eine andere ist (neuer Lauf, gelöschte Runde, verschobener Slot,
    // nachgetragener Zeitnahmetyp), Marken-, Zuordnungs- und Sequenz-Nachrichten melden nur den
    // Fortschritt an bestehenden Partien (siehe Effekt unten). VOR dem Board-State aufgerufen,
    // weil der Fehlstart-Hook darunter die Startliste braucht und sein Callback in den
    // Board-State hineingereicht wird.
    const {
        matches,
        loading: matchesLoading,
        error: matchesError,
        refetch: refetchMatches,
        bump: bumpMatches,
    } = useTimingMatches(eventId, stationId)

    // Fehlstart-Ton (Startposten): RUNNING→ABORTED der eigenen Sequenz und attemptRetracted der
    // gerade geführten Partie — Bedingungen in `falseStart.ts`. Auf Zielposten läuft der Hook
    // faktisch leer, weil `useSequence` dort nie eine Sequenz führt.
    const {onAttemptRetracted} = useFalseStartTone(
        sequenceState.sequence,
        matches,
        settings.falseStartTone,
    )

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
    } = useTimingBoardState(
        eventId,
        stationId,
        sequenceState.applySequenceChanged,
        applyOfficialTimes,
        applySettingsChanged,
        onAttemptRetracted,
        bumpMatches,
    )

    // Teams for the assignment dialog: loaded once per board mount (not re-fetched on every
    // websocket reconnect like the time marks/stations are — the team roster for an event does not
    // change during a running board session), ordered client-side so the currently expected teams
    // (active matches) come first — see orderTeamsForBoard.
    const {data: teamsData, pending: teamsPending, error: teamsError} = useFetch(signal =>
        getTimingTeams({signal, path: {eventId}}),
    )
    const teams = useMemo(() => orderTeamsForBoard(teamsData ?? []), [teamsData])

    // `marks` ändert seine Identität bei jeder timeMarkCreated/assignmentChanged-Nachricht, die
    // Sequenz bei jeder sequenceChanged — genau die Ereignisse, die `progress` und die
    // Team-Häkchen der Partien verschieben. Der bump ist entprellt, ein Nachrichtenschub am
    // Wellenstart löst also eine einzige Anfrage aus.
    useEffect(() => {
        bumpMatches()
    }, [marks, sequenceState.sequence, bumpMatches])

    const station = stations.find(s => s.id === stationId)
    const isStart = station?.type === 'START'

    // --- Scharfschaltung ------------------------------------------------------------------------
    //
    // Der Zustand gehört dem Server; `stationsChanged` lädt die Postenliste neu, sobald geschaltet
    // wurde. Bis dieses Echo ankommt — oder falls die Verbindung gerade hängt — gilt der zuletzt vom
    // Server BESTÄTIGTE eigene Schaltvorgang: Wer eben scharf geschaltet hat, muss sofort erfassen
    // können und nicht auf eine Nachricht warten. Sobald die Liste denselben Wert liefert, fällt der
    // Vorgriff wieder weg und der Server hat wieder allein das Wort.
    const [switchedArmed, setSwitchedArmed] = useState<boolean | undefined>(undefined)
    useEffect(() => {
        if (switchedArmed !== undefined && station?.armed === switchedArmed) {
            setSwitchedArmed(undefined)
        }
    }, [station?.armed, switchedArmed])
    // Solange der Posten noch lädt, gilt ONETOUCH — im Zweifel erfassen, nicht verweigern (erfassen
    // kann man dann ohnehin nicht, der Knopf hängt am geladenen Posten).
    const captureMode = station?.captureMode ?? 'ONETOUCH'
    const armed = switchedArmed ?? station?.armed ?? false
    // Die Sperre greift nur dort, wo es überhaupt eine Erfassung MIT Zuordnung gibt: am Ziel- und
    // am Zwischenzeit-Posten, die das Boots-Raster tragen (die Begründung je Typ steht bei
    // `armedGateApplies`). Die Bedingung selbst liegt in `armed.ts`, weil der Leitstand sie für
    // sein Abzeichen ebenfalls braucht: Liefen die beiden auseinander, meldete er dort eine Sperre,
    // die es auf diesem Bildschirm gar nicht gibt.
    //
    // Solange der Posten noch lädt, greift sie nicht — im Zweifel erfassen, nicht verweigern.
    const gateApplies = station !== undefined && armedGateApplies(station.type, captureMode)
    const mayCaptureAssigned = !gateApplies || captureAllowed(captureMode, armed)
    // Der Leertasten-Zuhörer registriert sich einmal; ohne Spiegel im Ref sähe er ewig den Zustand
    // vom ersten Rendern.
    const mayCaptureRef = useRef(mayCaptureAssigned)
    mayCaptureRef.current = mayCaptureAssigned

    // Tab-Titel „<Postenname> · Ready2Race" — am Renntag sind mehrere Posten-Boards offen, ohne
    // Postennamen im Tab sind sie nicht auseinanderzuhalten. Der Hook stellt beim Verlassen den
    // vorherigen Titel wieder her.
    useDocumentTitle(station?.name)

    // Ein ANZEIGE-Posten hat kein Erfassungsboard — wer seine Board-Adresse öffnet (alter Link,
    // Tippfehler), landet auf der Anzeige, die dieser Posten IST.
    useEffect(() => {
        if (station?.type === 'ANZEIGE') {
            void navigate({
                to: '/event/$eventId/timing/$stationId/anzeige',
                params: {eventId, stationId},
                replace: true,
            })
        }
    }, [station?.type, navigate, eventId, stationId])

    const showReconnectBanner = wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'
    const showUnauthorizedBanner = wsStatus === 'UNAUTHORIZED'
    const showClockDegradedBanner = clock.quality === 'DEGRADED'

    // --- Fokus und Tagesablauf -------------------------------------------------------------------
    //
    // EINE Ansicht je Posten-Typ (die früheren Reiter „Zwei-Schritt" und „Teams" sind ersatzlos
    // weg): der Startposten startet die fokussierte Partie mit einem Griff, der Zielposten nimmt
    // Zeiten per Boots-Knopf oder Taste auf die fokussierte Partie. Der Fokus gehört der Seite,
    // weil Tagesablauf-Spalte und Arbeitsfläche denselben Zustand teilen — die Auflösung
    // (Vorrücken nach Start bzw. Zieleinlauf) übernimmt je Posten-Typ die passende reine Logik.
    // (`isStart` steht weiter oben, die Scharfschaltung braucht es schon dort.)
    const [selectedMatchId, setSelectedMatchId] = useState<string | undefined>(undefined)
    const focusedMatchId = isStart
        ? resolveStartSelection(matches, selectedMatchId)
        : resolveFinishFocus(matches, selectedMatchId)
    const focusedMatch = matches.find(match => match.competitionSetupMatch === focusedMatchId)

    // Eingeklappt merken (geräteweit): auf schmalen Bildschirmen startet die Spalte eingeklappt.
    const [scheduleCollapsed, setScheduleCollapsed] = useState(initialScheduleCollapsed)
    const toggleScheduleCollapsed = useCallback(() => {
        setScheduleCollapsed(prev => {
            persistScheduleCollapsed(!prev)
            return !prev
        })
    }, [])

    // Telefon-Layout (< sm): die Tagesablauf-Spalte würde die Erfassungsfläche erdrücken — sie
    // wird zur überlagernden Schublade mit eigenem Öffner, und die Zeitenliste zu einem
    // aufklappbaren Bodenpaneel, damit die Erfassung im Daumenbereich bleibt.
    const theme = useTheme()
    const isPhone = useMediaQuery(theme.breakpoints.down('sm'))
    const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false)
    const [markListOpen, setMarkListOpen] = useState(false)

    const matchesAvailable = matches.length > 0

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
            if (mark.status === 'ACTIVE' && mark.assignedTeam != null) {
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
            // Die Partie-Startliste hat dieselbe Lücke (verpasste Trigger-Nachrichten).
            refetchMatches()
            // Und die offiziellen Zeiten ebenso — verpasste officialTimeChanged-Nachrichten.
            reloadOfficialTimes()
            // Genauigkeit/Schalter: verpasste settingsChanged-Nachrichten.
            reloadSettings()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, runDrain, refetchSequence, refetchMatches, reloadOfficialTimes, reloadSettings])

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
                refetchMatches()
                reloadOfficialTimes()
                reloadSettings()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [runDrain, refetch, refetchMatches, reloadOfficialTimes, reloadSettings])

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
        // Erfassungston je Postentyp aus den Zeitnahme-Einstellungen (live via settingsChanged).
        // Andere Postentypen (START-Handmarken) behalten den eingebauten Standardton.
        captureTone:
            station?.type === 'FINISH'
                ? settings.finishTone
                : station?.type === 'SPLIT'
                  ? settings.splitTone
                  : undefined,
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

    // --- Startposten: Sequenz-Aktionen und Partie-Menü ------------------------------------------
    //
    // Abbruch und Neustart hängen am Menü JEDER Partie (Tagesablauf-Spalte und Arbeitsfläche),
    // nicht nur an der laufenden Sequenz — „auch nach Start" ist die Anforderung. Beide Wege
    // bestätigen mit eindeutigen Knopftexten: nie zweimal „Abbrechen" in einem Dialog.
    const {sequence} = sequenceState
    // PAUSED gehört dazu: angehalten heißt unterbrochen, nicht beendet — die Sequenz belegt ihren
    // Posten weiter und deckt weiterhin die Partien ab, die in ihr stehen.
    const sequenceLive =
        sequence !== undefined &&
        (sequence.state === 'ARMED' ||
            sequence.state === 'RUNNING' ||
            sequence.state === 'PAUSED')

    /** Läuft/steht die Sequenz dieses Postens für Teams genau dieser Partie? */
    const sequenceCoversMatch = useCallback(
        (match: TimingMatchDto) =>
            sequenceLive &&
            sequence !== undefined &&
            sequence.entries.some(entry =>
                match.teams.some(
                    team => team.competitionMatchTeam === entry.competitionMatchTeam,
                ),
            ),
        [sequence, sequenceLive],
    )

    const handleAbortSequence = useCallback(() => {
        confirmAction(
            () => {
                void sequenceState.abort().then(ok => {
                    if (!ok) feedback.error(t('timing.sequence.error.abort'))
                })
            },
            {
                title: t('timing.sequence.abortConfirm.title'),
                content: t('timing.sequence.abortConfirm.content'),
                // Eindeutig statt zweimal „Abbrechen": weiterlaufen lassen vs. Sequenz abbrechen.
                okText: t('timing.sequence.abort'),
                cancelText: t('timing.sequence.abortConfirm.keep'),
            },
        )
    }, [confirmAction, sequenceState, feedback, t])

    // Anhalten und Fortsetzen sind beide folgenlos umkehrbar (die Kette bleibt vollständig
    // stehen) — deshalb ohne Rückfrage, ein Griff genügt. Das ist der ganze Punkt der Funktion:
    // wenn ein Boot unverschuldet zu spät kommt, muss das Anhalten schneller gehen als das
    // Nachdenken über einen Bestätigungsdialog.
    const handlePauseSequence = useCallback(() => {
        void sequenceState.pause().then(ok => {
            if (!ok) feedback.error(t('timing.sequence.error.pause'))
        })
    }, [sequenceState, feedback, t])

    const handleResumeSequence = useCallback(() => {
        void sequenceState.resume().then(ok => {
            if (!ok) feedback.error(t('timing.sequence.error.resume'))
        })
    }, [sequenceState, feedback, t])

    // Das Zurücksetzen dagegen nimmt eine bereits gefeuerte Startmarke zurück — es greift also in
    // die Ergebnisse ein und wird wie das Überspringen bestätigt, mit dem Boot im Text, damit der
    // Posten sieht, wessen Start er gerade zurückholt.
    const handleRewindSequence = useCallback(() => {
        const lastStarted = [...(sequence?.entries ?? [])]
            .filter(entry => entry.status === 'STARTED')
            .sort((a, b) => a.position - b.position)
            .pop()
        if (lastStarted === undefined) return
        const team = teams.find(
            candidate => candidate.competitionMatchTeam === lastStarted.competitionMatchTeam,
        )
        confirmAction(
            () => {
                void sequenceState.rewind().then(ok => {
                    if (!ok) feedback.error(t('timing.sequence.error.rewind'))
                })
            },
            {
                title: t('timing.sequence.rewindConfirm.title'),
                content: t('timing.sequence.rewindConfirm.content', {
                    team: teamLabel(team, lastStarted.competitionMatchTeam),
                }),
                okText: t('timing.sequence.rewind'),
            },
        )
    }, [confirmAction, sequence, sequenceState, teams, feedback, t])

    // Überspringen ist unumkehrbar und sitzt neben dem Countdown auf einem Touchscreen — deshalb
    // immer mit Bestätigung, die das Team nennt (unverändert vom bisherigen Panel übernommen).
    const handleSkipEntry = useCallback(
        (entryId: string, teamName: string) => {
            confirmAction(
                () => {
                    void sequenceState.skip(entryId).then(ok => {
                        if (!ok) feedback.error(t('timing.sequence.error.skip'))
                    })
                },
                {
                    title: t('timing.sequence.entry.skipConfirm.title'),
                    content: t('timing.sequence.entry.skipConfirm.content', {team: teamName}),
                    okText: t('timing.sequence.entry.skip'),
                },
            )
        },
        [confirmAction, sequenceState, feedback, t],
    )

    const handleRestartMatch = useCallback(
        (match: TimingMatchDto) => {
            confirmAction(
                () => {
                    void (async () => {
                        // Läuft die eigene Sequenz noch für diese Partie, zuerst abbrechen —
                        // sonst feuerte sie weitere Startmarken, während die alten zurückgehen.
                        if (sequenceCoversMatch(match)) {
                            const aborted = await sequenceState.abort()
                            if (!aborted) {
                                feedback.error(t('timing.sequence.error.abort'))
                                return
                            }
                        }
                        try {
                            // Der Bündel-Weg verwirft den GANZEN Versuch (auch Ziel- und
                            // Rundenmarken): alte Zielzeiten würden sich sonst durch die
                            // Echtzeit-Übernahme sofort mit den neuen Startmarken zu falschen
                            // offiziellen Zeiten verrechnen. Einzelne Startzeiten korrigiert
                            // die Einzelmarken-Rücknahme in der Zeitenliste — dort bleibt das
                            // Ziel unberührt.
                            const {error} = await retractMatchAttempt({
                                path: {eventId, matchId: match.competitionSetupMatch},
                            })
                            if (error !== undefined) {
                                feedback.error(t('timing.matches.error.restart'))
                                return
                            }
                            // Die Rückschreibung räumt die Läufe serverseitig selbst; die
                            // WebSocket-Echos ziehen Markenliste und Startliste nach.
                            feedback.success(t('timing.matches.restartDone'))
                        } catch {
                            feedback.error(t('timing.matches.error.restart'))
                        }
                    })()
                },
                {
                    title: t('timing.matches.restartConfirm.title'),
                    content: t('timing.matches.restartConfirm.content', {
                        match: matchTitle(match),
                    }),
                    okText: t('timing.matches.restartConfirm.ok'),
                    cancelText: t('timing.matches.restartConfirm.keep'),
                },
            )
        },
        [confirmAction, sequenceCoversMatch, sequenceState, eventId, feedback, t],
    )

    /**
     * Darf für diese Partie ein Fehlstart ausgelöst werden?
     *
     * Zwei Bedingungen, beide bewusst: Nur am START-Posten — der Rückruf ist eine Startgeste, und
     * der Startbildschirm selbst bleibt bedienelementfrei, deshalb sitzt der Knopf hier am
     * Erfassungsboard. Und nur, wenn der wirksame Zeitnahmetyp der Partie ihn erlaubt: Timetrials
     * im Rudersport ahnden einen Fehlstart mit Strafzeit statt mit Rückruf, dort wäre der Knopf
     * schlicht falsch. `=== true` statt eines Wahrheitswert-Tests, weil eine Partie ganz ohne
     * aufgelösten Typ (`timingMode` fehlt) ebenfalls keinen Rückruf bekommt — der Server lehnt
     * beide Fälle gleich ab.
     */
    const falseStartAllowed = useCallback(
        (match: TimingMatchDto) => isStart && match.timingMode?.falseStartEnabled === true,
        [isStart],
    )

    /**
     * Der Fehlstart-Rückruf: bricht serverseitig die laufende Startsequenz der Partie ab, nimmt
     * den Versuch zurück und meldet den Rückruf zusätzlich als eigenes Signal an die Anzeigen
     * (die daraufhin rot blinken). Ein Aufruf, kein Klickpfad — die Reihenfolge (erst abbrechen,
     * dann zurücknehmen) gehört auf den Server, sonst könnte ein halber Rückruf entstehen, wenn
     * das Board zwischendurch die Verbindung verliert.
     *
     * Immer mit Bestätigung, die den Lauf beim Namen nennt: der Knopf sitzt am Startposten neben
     * der Erfassung, auf einem Touchscreen, und ein versehentlicher Rückruf holt ein ganzes Feld
     * zurück. Eindeutige Knopftexte statt zweimal „Abbrechen“ — dieselbe Regel wie beim
     * Sequenz-Abbruch.
     */
    const handleFalseStart = useCallback(
        (match: TimingMatchDto) => {
            confirmAction(
                () => {
                    void (async () => {
                        try {
                            const {error} = await falseStartMatch({
                                path: {eventId, matchId: match.competitionSetupMatch},
                            })
                            if (error !== undefined) {
                                feedback.error(t('timing.matches.error.falseStart'))
                                return
                            }
                            // Sequenz-Abbruch, Rücknahme und Rückruf-Signal ziehen über die
                            // WebSocket-Echos nach — hier bleibt nur die Rückmeldung an den
                            // Posten, dass der Rückruf raus ist.
                            feedback.success(t('timing.matches.falseStartDone'))
                        } catch {
                            feedback.error(t('timing.matches.error.falseStart'))
                        }
                    })()
                },
                {
                    title: t('timing.matches.falseStartConfirm.title'),
                    content: t('timing.matches.falseStartConfirm.content', {
                        match: matchTitle(match),
                    }),
                    okText: t('timing.matches.falseStartConfirm.ok'),
                    cancelText: t('timing.matches.falseStartConfirm.keep'),
                },
            )
        },
        [confirmAction, eventId, feedback, t],
    )

    const [matchMenu, setMatchMenu] = useState<{
        match: TimingMatchDto
        anchor: HTMLElement
    } | null>(null)
    const openMatchMenu = useCallback(
        (match: TimingMatchDto, anchor: HTMLElement) => setMatchMenu({match, anchor}),
        [],
    )
    const closeMatchMenu = useCallback(() => setMatchMenu(null), [])

    /** Ob das Partie-Menü etwas anzubieten hat (sonst erscheint gar kein Menü-Knopf). */
    const matchMenuAvailable = useCallback(
        (match: TimingMatchDto) =>
            sequenceCoversMatch(match) ||
            match.teams.some(team => team.started) ||
            // Der Rückruf hängt an keinem Fortschritt: er ist gerade dann gefragt, wenn noch
            // nichts passiert ist (Boot zu früh los, bevor die erste Marke fiel).
            falseStartAllowed(match),
        [sequenceCoversMatch, falseStartAllowed],
    )

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
            if (event.repeat) return
            if (isTypingContext() || isSpaceOwnedByFocusedControl()) return
            // Sperrstelle 3: Entschärft tut die Leertaste nichts. Sie bankt technisch OHNE
            // Zuordnung, täte also dasselbe wie der große Knopf — die Regel folgt hier nicht der
            // Wirkung, sondern der Unfallfläche: TASTEN sind das, was versehentlich getroffen wird.
            // Ein Ärmel trifft eine Tastatur, nicht einen bestimmten Knopf auf dem Bildschirm. Der
            // Notausgang soll ein absichtlicher Griff sein, und der bleibt der große Knopf — der
            // wird nie gesperrt. Kein `preventDefault`, damit der Browser eine Taste, die hier
            // nichts mehr tut, wieder normal behandelt.
            //
            // Am Startposten greift das nicht (siehe `gateApplies`): Dort ist die Leertaste
            // der Kurzweg zum manuellen Stempel und die einzige Taste überhaupt — sie zu sperren
            // nähme einen Bedienweg, ohne eine Zuordnung zu verhindern, die es dort nicht gibt.
            if (!mayCaptureRef.current) return

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
                // Notch und Home-Indicator (iPhone): das Board füllt den ganzen Bildschirm,
                // seine Ränder müssen deshalb selbst aus den sicheren Zonen herausbleiben.
                pt: 'env(safe-area-inset-top)',
                pb: 'env(safe-area-inset-bottom)',
                pl: 'env(safe-area-inset-left)',
                pr: 'env(safe-area-inset-right)',
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

            {/* Mittelteil: links die einklappbare Tagesablauf-Spalte (gemeinsames Gerüst beider
                Posten), rechts die Arbeitsfläche des Posten-Typs. Die Spalte erscheint nur, wenn
                es überhaupt intern gezeitete Partien gibt — ohne sie wäre sie eine leere Leiste.
                Auf dem Telefon wird die Spalte zur überlagernden Schublade (Öffner in der
                Arbeitsfläche), damit sie keine Erfassungsfläche frisst. */}
            <Box sx={{flexGrow: 1, minHeight: 0, display: 'flex', alignItems: 'stretch'}}>
                {matchesAvailable && !isPhone && (
                    <DayScheduleColumn
                        matches={matches}
                        focusedId={focusedMatchId}
                        onFocus={setSelectedMatchId}
                        collapsed={scheduleCollapsed}
                        onToggleCollapsed={toggleScheduleCollapsed}
                        onOpenMenu={isStart ? openMatchMenu : undefined}
                        menuAvailable={matchMenuAvailable}
                    />
                )}
                {matchesAvailable && isPhone && (
                    <Drawer
                        open={scheduleDrawerOpen}
                        onClose={() => setScheduleDrawerOpen(false)}
                        // Das Board selbst liegt über dem Layout (drawer + 1) — die Schublade
                        // muss also noch eine Ebene höher, sonst bliebe sie unsichtbar dahinter.
                        sx={{zIndex: theme.zIndex.drawer + 2}}>
                        <DayScheduleColumn
                            matches={matches}
                            focusedId={focusedMatchId}
                            onFocus={matchId => {
                                setSelectedMatchId(matchId)
                                // Fokussieren ist auf dem Telefon der Abschluss der Auswahl —
                                // die Schublade schließt, die Erfassung liegt wieder frei.
                                setScheduleDrawerOpen(false)
                            }}
                            collapsed={false}
                            onToggleCollapsed={() => setScheduleDrawerOpen(false)}
                            onOpenMenu={isStart ? openMatchMenu : undefined}
                            menuAvailable={matchMenuAvailable}
                            inDrawer
                        />
                    </Drawer>
                )}
                <Box
                    sx={{
                        flexGrow: 1,
                        minWidth: 0,
                        minHeight: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        p: 2,
                    }}>
                    {/* Öffner der Tagesablauf-Schublade (nur Telefon): oben, wo er die
                        Erfassungsflächen im Daumenbereich nicht verdeckt. */}
                    {isPhone && matchesAvailable && (
                        <Button
                            variant="outlined"
                            startIcon={<ListAltIcon />}
                            onClick={() => setScheduleDrawerOpen(true)}
                            sx={{alignSelf: 'flex-start', minHeight: 44, flexShrink: 0}}>
                            {t('timing.schedule.title')}
                        </Button>
                    )}
                    {/* `onPointerDown` unlocks the WebAudio context from a real user gesture (see
                        `unlockAudio`): a board whose operator only ever taps the capture button
                        would otherwise stay mute for the sequence countdown beeps. */}
                    <Box
                        onPointerDown={unlockAudio}
                        sx={{
                            flexGrow: 1,
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1.5,
                        }}>
                        {gateApplies && (
                            // Nur wo die Sperre auch greift: Im Onetouch-Betrieb gibt es nichts zu
                            // schalten, am Startposten nichts zu sperren — dort erscheint hier
                            // weder Schalter noch Balken.
                            <Stack spacing={1} sx={{flexShrink: 0}}>
                                {!mayCaptureAssigned && (
                                    // Der Warnbalken. Er muss aus drei Metern lesbar sein — ein
                                    // Zeitnehmer schaut aufs Wasser, nicht auf den Schirm — und er
                                    // sagt beides: dass nicht erfasst wird UND was zu tun ist.
                                    <Box
                                        sx={{
                                            bgcolor: 'warning.main',
                                            color: 'warning.contrastText',
                                            borderRadius: 2,
                                            px: 2,
                                            py: 1.5,
                                            textAlign: 'center',
                                        }}>
                                        <Typography
                                            variant="h4"
                                            sx={{fontWeight: 800, lineHeight: 1.15}}>
                                            {t('timing.board.armed.blockedTitle')}
                                        </Typography>
                                        <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                                            {t('timing.board.armed.blockedHint')}
                                        </Typography>
                                    </Box>
                                )}
                                <ArmSwitch
                                    eventId={eventId}
                                    stationId={stationId}
                                    armed={armed}
                                    onSwitched={setSwitchedArmed}
                                />
                            </Stack>
                        )}
                        {isStart ? (
                            <>
                                <StartBoardPanel
                                    stationId={stationId}
                                    matches={matches}
                                    matchesLoading={matchesLoading}
                                    matchesError={matchesError}
                                    teams={teams}
                                    now={clock.now}
                                    sequenceState={sequenceState}
                                    focusedMatch={focusedMatch}
                                    onOpenMenu={openMatchMenu}
                                    menuAvailable={matchMenuAvailable}
                                    onPause={handlePauseSequence}
                                    onResume={handleResumeSequence}
                                    onRewind={handleRewindSequence}
                                    onAbort={handleAbortSequence}
                                    onSkip={handleSkipEntry}
                                />
                                {/* Der manuelle Stempel als kompakter Zweitweg: eine Zeit ohne
                                    Boot banken (Fehlstart-Protokoll, Sonderfälle). Nur auf
                                    Wunsch der Veranstaltung (`showManualCapture`, Vorgabe aus):
                                    sonst stehen hier zwei grüne Flächen übereinander — der große
                                    Sequenz-Knopf und darunter derselbe Farbton mit „Start" —,
                                    und am Wasser ist das eine offene Verwechslung. Ein
                                    versehentlicher Stempel schreibt eine Startmarke, die niemand
                                    bestellt hat. Veranstaltungen, die ohne Sequenz starten,
                                    schalten ihn in den Zeitnahme-Einstellungen ein; das Board
                                    folgt live über `settingsChanged`. Eingeblendet unterliegt er
                                    derselben Scharfschaltung wie jede andere Erfassung. */}
                                {settings.showManualCapture && (
                                    <Box sx={{flex: '0 0 12vh', minHeight: 72, display: 'flex'}}>
                                        <CaptureButton
                                            station={station}
                                            now={clock.now}
                                            onCapture={capture}
                                            compact
                                            disarmed={!mayCaptureAssigned}
                                        />
                                    </Box>
                                )}
                            </>
                        ) : matchesAvailable || matchesLoading ? (
                            // Die eine Zielposten-Ansicht: die große Erfassungsfläche (Zeit ohne
                            // Boot banken — sie erscheint sofort als „zuordnen"-Banner) und die
                            // erwarteten Partien mit ihren Boots-Knöpfen und Tasten. Am Laptop
                            // steht die Fläche oben; auf dem Telefon unten, wo der Daumen sie im
                            // Moment der Ziellinie ohne Umgreifen trifft.
                            <Stack sx={{width: 1, minHeight: 0, flexGrow: 1}} spacing={1.5}>
                                {!isPhone && (
                                    <Box sx={{flex: '0 0 30%', minHeight: 96, display: 'flex'}}>
                                        <CaptureButton
                                            station={station}
                                            now={clock.now}
                                            onCapture={capture}
                                            compact
                                            disarmed={!mayCaptureAssigned}
                                        />
                                    </Box>
                                )}
                                <MatchCaptureView
                                    eventId={eventId}
                                    matches={matches}
                                    matchesLoading={matchesLoading}
                                    marks={marks}
                                    finishedTeams={finishedTeams}
                                    capture={capture}
                                    disabled={clock.now() === null || station === undefined}
                                    disabledReason={
                                        clock.now() === null
                                            ? t('timing.board.capture.clockNotSynced')
                                            : t('timing.board.capture.stationLoading')
                                    }
                                    applyLocalAssignment={applyLocalAssignment}
                                    focusedId={focusedMatchId}
                                    onFocus={setSelectedMatchId}
                                    officialTimes={officialTimesByTeam}
                                    precision={settings.precision}
                                    captureMode={captureMode}
                                    armed={armed}
                                />
                                {isPhone && (
                                    <Box sx={{flex: '0 0 18%', minHeight: 96, display: 'flex'}}>
                                        <CaptureButton
                                            station={station}
                                            now={clock.now}
                                            onCapture={capture}
                                            compact
                                            disarmed={!mayCaptureAssigned}
                                        />
                                    </Box>
                                )}
                            </Stack>
                        ) : (
                            // Ohne intern gezeitete Partien bleibt der Zwei-Schritt-Weg: Zeit
                            // banken, Team danach in der Zeitenliste zuordnen.
                            <Stack sx={{width: 1, minHeight: 0, flexGrow: 1}} spacing={1.5}>
                                {/* Ein Zwischenzeit-Posten sieht nur die Wettkaempfe, auf deren
                                    Strecke er steht. Steht er nirgends, ist die Liste leer -- und
                                    ohne diesen Hinweis haelt ein Zeitnehmer den Bildschirm fuer
                                    kaputt und erfasst weiter, obwohl seine Marke nirgends
                                    ankaeme. Der Erfassungsknopf bleibt trotzdem: Zeit banken und
                                    spaeter von Hand zuordnen geht nach wie vor. */}
                                {station?.type === 'SPLIT' && !matchesLoading && (
                                    <Alert severity={'info'} variant={'outlined'}>
                                        {t('timing.board.noCourseAssignment')}
                                    </Alert>
                                )}
                                <CaptureButton
                                    station={station}
                                    now={clock.now}
                                    onCapture={capture}
                                    disarmed={!mayCaptureAssigned}
                                />
                            </Stack>
                        )}
                    </Box>
                </Box>
            </Box>

            {isPhone ? (
                // Telefon: die Zeitenliste als aufklappbares Bodenpaneel — zugeklappt bleibt nur
                // die schmale Kopfzeile stehen, die Erfassung behält den Platz im Daumenbereich.
                <Stack
                    sx={{
                        flexShrink: 0,
                        maxHeight: '45%',
                        minHeight: 0,
                        borderTop: 1,
                        borderColor: 'divider',
                    }}>
                    <ButtonBase
                        onClick={() => setMarkListOpen(prev => !prev)}
                        sx={{
                            width: 1,
                            justifyContent: 'space-between',
                            px: 2,
                            py: 1,
                            minHeight: 44,
                            flexShrink: 0,
                        }}>
                        <Typography variant="subtitle2">
                            {t('timing.board.markList.toggle', {count: marks.length})}
                        </Typography>
                        {markListOpen ? (
                            <ExpandMoreIcon fontSize="small" />
                        ) : (
                            <ExpandLessIcon fontSize="small" />
                        )}
                    </ButtonBase>
                    {markListOpen && (
                        <Box sx={{minHeight: 0, overflowY: 'auto', px: 2, pb: 1}}>
                            <MarkList
                                eventId={eventId}
                                stationId={stationId}
                                marks={marks}
                                teams={teams}
                                teamsLoading={teamsPending}
                                matches={matches}
                            />
                        </Box>
                    )}
                </Stack>
            ) : (
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
                        matches={matches}
                    />
                </Box>
            )}

            {/* Aktionsmenü einer Partie (nur Startposten): Sequenz abbrechen, Start zurücknehmen
                und neu starten. Die Einträge erscheinen nur, wenn sie gerade anwendbar sind. */}
            <Menu
                open={matchMenu !== null}
                anchorEl={matchMenu?.anchor}
                onClose={closeMatchMenu}>
                {matchMenu !== null && sequenceCoversMatch(matchMenu.match) && (
                    <MenuItem
                        onClick={() => {
                            closeMatchMenu()
                            handleAbortSequence()
                        }}>
                        {t('timing.matches.abortSequence')}
                    </MenuItem>
                )}
                {matchMenu !== null && matchMenu.match.teams.some(team => team.started) && (
                    <MenuItem
                        onClick={() => {
                            closeMatchMenu()
                            handleRestartMatch(matchMenu.match)
                        }}>
                        {t('timing.matches.restart')}
                    </MenuItem>
                )}
                {/* Der Fehlstart steht bewusst unten und farblich abgesetzt: er ist die
                    folgenreichste Geste des Menüs (Sequenz weg, Versuch weg, Anzeigen rot) und
                    darf nicht als Nachbar des Abbruchs versehentlich getroffen werden. */}
                {matchMenu !== null && falseStartAllowed(matchMenu.match) && (
                    <MenuItem
                        onClick={() => {
                            closeMatchMenu()
                            handleFalseStart(matchMenu.match)
                        }}
                        sx={{color: 'error.main', fontWeight: 600}}>
                        {t('timing.matches.falseStart')}
                    </MenuItem>
                )}
            </Menu>

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
