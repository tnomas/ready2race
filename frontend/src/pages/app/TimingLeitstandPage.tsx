import {Alert, Box, IconButton, Stack, Tab, Tabs, Tooltip} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {getTimingTeams} from '@api/sdk.gen.ts'
import {updateEventGlobal} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {TimingSequenceDto} from '@api/types.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import LeitstandOverviewTab from '@components/timing/leitstand/LeitstandOverviewTab.tsx'
import LeitstandMarksTab from '@components/timing/leitstand/LeitstandMarksTab.tsx'
import LeitstandResultsTab from '@components/timing/leitstand/LeitstandResultsTab.tsx'
import LeitstandDevicesTab from '@components/timing/leitstand/LeitstandDevicesTab.tsx'
import {useOfficialTimes} from '@components/timing/leitstand/useOfficialTimes.ts'
import {useStationSequences} from '@components/timing/leitstand/useStationSequences.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'

type LeitstandTab = 'overview' | 'times' | 'results' | 'devices'

const TABS: LeitstandTab[] = ['overview', 'times', 'results', 'devices']

/**
 * The Leitstand (control desk): one fullscreen board with the event's whole timing state, for the
 * person who owns the results rather than a single station.
 *
 * Three tabs, deliberately in the order the work happens: **Zeiten** (every captured mark across all
 * stations, with assignment/retract corrections and the explicit delete of retracted times),
 * **Ergebnisse** (per-team official times: compute, override/penalty/status, push into the results
 * flow) and **Geräte** (hardware device tokens).
 *
 * Gated on `updateEventGlobal` — unlike the station boards, which run on the broader
 * `updateAppTimingGlobal` operator privilege. Everything here writes into the event's results.
 *
 * Live state comes from the same `useTimingBoardState` the station boards use, with `stationId = null`
 * for the cross-station view, plus `useOfficialTimes` for the result table's own feed
 * (`officialTimeChanged`). The two are separate because they load from separate endpoints and only the
 * marks half is part of `/timing/state`.
 *
 * Route-unabhängig: die Seite hängt seit dem Betrieb-Umbau (22.08.2026) sowohl unter
 * `/app/timing/$eventId/leitstand` als auch kanonisch unter `/event/$eventId/timing/leitstand` —
 * Parameter und Rücksprungziel kommen deshalb als Props von der jeweiligen Route.
 */
export type TimingLeitstandPageProps = {
    eventId: string
    /** Wohin der Zurück-Pfeil führt - je nach Mount die App-Postenwahl oder der Betrieb-Reiter. */
    onBack: () => void
}

const TimingLeitstandPage = ({eventId, onBack}: TimingLeitstandPageProps) => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()

    useEffect(() => {
        if (!user.checkPrivilege(updateEventGlobal)) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate])

    // Die Übersicht ist die Standardansicht: Posten-Streifen plus die zuletzt aktiven Läufe -
    // die Detail-Reiter (Zeiten, Ergebnisse, Geräte) bleiben dahinter bestehen.
    const [tab, setTab] = useState<LeitstandTab>('overview')

    const clock = useServerClock()
    const officialTimesState = useOfficialTimes(eventId)
    const {applyChanged, reload: reloadOfficialTimes} = officialTimesState
    // Henne-Ei zwischen den beiden Hooks: useStationSequences braucht die Stationen aus
    // useTimingBoardState, das seinerseits den Sequenz-Callback entgegennimmt. Der Ref-Umweg
    // löst das auf; useTimingBoardState spiegelt den Callback intern ohnehin in einen Ref, die
    // Inline-Funktion löst also kein Neu-Abonnieren aus.
    const sequenceChangedRef = useRef<(sequence: TimingSequenceDto) => void>(() => {})
    const {marks, stations, refetch, wsStatus, stateError} = useTimingBoardState(
        eventId,
        null,
        sequence => sequenceChangedRef.current(sequence),
        applyChanged,
    )
    const {sequences, applyChanged: applySequenceChanged} = useStationSequences(eventId, stations)
    useEffect(() => {
        sequenceChangedRef.current = applySequenceChanged
    }, [applySequenceChanged])

    // Teams are loaded once per board mount (the roster does not change during a running event) and
    // sorted by start number, so every table and picker lists them in the order operators expect.
    const {
        data: teamsData,
        pending: teamsPending,
        error: teamsError,
    } = useFetch(signal => getTimingTeams({signal, path: {eventId}}), {deps: [eventId]})
    const teams = useMemo(
        () =>
            [...(teamsData ?? [])].sort(
                (a, b) => (a.startNumber ?? Infinity) - (b.startNumber ?? Infinity),
            ),
        [teamsData],
    )

    // Official times have no equivalent of the marks' snapshot-on-reconnect, so re-sync them on the
    // same triggers the station boards use for their state: the websocket's transition back to OPEN
    // (messages missed while disconnected) and a return to visibility (a phone whose screen was locked
    // across the gap, where timers were throttled and no transition fired while the user was away).
    const prevWsStatusRef = useRef(wsStatus)
    useEffect(() => {
        if (prevWsStatusRef.current !== 'OPEN' && wsStatus === 'OPEN') {
            reloadOfficialTimes()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, reloadOfficialTimes])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                refetch()
                reloadOfficialTimes()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [refetch, reloadOfficialTimes])

    const showUnauthorizedBanner = wsStatus === 'UNAUTHORIZED'
    const showReconnectBanner = wsStatus === 'CONNECTING' || wsStatus === 'RECONNECTING'

    return (
        // Same fullscreen treatment as the station board: rendered through `AppLayout`, whose
        // max-width container and padding would otherwise box a wide table in, so the board is taken
        // out of flow with `position: fixed` + `inset: 0` above the layout chrome (and below MUI's
        // modal/snackbar layers, so dialogs and feedback still work).
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
                stationName={t('timing.leitstand.title')}
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
            {stateError && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.stateError')}
                </Alert>
            )}
            {teamsError !== null && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.assign.loadError')}
                </Alert>
            )}
            {officialTimesState.error && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.leitstand.results.loadError')}
                </Alert>
            )}

            <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{flexShrink: 0, borderBottom: 1, borderColor: 'divider', px: 1}}>
                <Tooltip title={t('common.back')}>
                    <IconButton aria-label={t('common.back')} onClick={onBack}>
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>
                <Tabs
                    value={tab}
                    onChange={(_, value: LeitstandTab) => setTab(value)}
                    variant="scrollable"
                    allowScrollButtonsMobile>
                    {TABS.map(value => (
                        <Tab key={value} value={value} label={t(`timing.leitstand.tab.${value}`)} />
                    ))}
                </Tabs>
            </Stack>

            <Box sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto', p: 2}}>
                {tab === 'overview' && (
                    <LeitstandOverviewTab
                        eventId={eventId}
                        stations={stations}
                        marks={marks}
                        teams={teams}
                        officialTimes={officialTimesState.officialTimes}
                        sequences={sequences}
                        reloadOfficialTimes={reloadOfficialTimes}
                    />
                )}
                {tab === 'times' && (
                    <LeitstandMarksTab
                        eventId={eventId}
                        marks={marks}
                        stations={stations}
                        teams={teams}
                        teamsLoading={teamsPending}
                        refetch={refetch}
                    />
                )}
                {tab === 'results' && (
                    <LeitstandResultsTab
                        eventId={eventId}
                        teams={teams}
                        officialTimes={officialTimesState.officialTimes}
                        officialTimesPending={officialTimesState.pending}
                        reloadOfficialTimes={reloadOfficialTimes}
                    />
                )}
                {tab === 'devices' && <LeitstandDevicesTab eventId={eventId} stations={stations} />}
            </Box>
        </Box>
    )
}

export default TimingLeitstandPage
