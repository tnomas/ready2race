import {Alert, Box, Divider, Stack, Typography} from '@mui/material'
import {useEffect, useMemo, useRef} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {getTimingTeams} from '@api/sdk.gen.ts'
import {TimingSequenceEntryDto, TimingStationDto, TimingTeamDto} from '@api/types.gen.ts'
import {
    readEventGlobal,
    updateAppTimingGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useSequence} from '@utils/timing/useSequence.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import {deriveStartDisplay} from '@utils/timing/sequenceDisplay.ts'
import {teamLabel} from '@utils/timing/teamLabel.ts'
import {deviceSessionForEvent} from '@utils/timing/deviceSession.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {unlockAudio} from '@utils/timing/feedback.ts'
import {useAudioUnlocked} from '@utils/timing/useAudioUnlocked.ts'
import {useTouchOnly} from '@utils/touch.ts'

/**
 * Startbildschirm (Zeitnahme): die reine ANZEIGE-Route je START-Posten
 * (`/event/$eventId/timing/$stationId/anzeige`), gedacht für einen Bildschirm, den die Athleten am
 * Start sehen — großer Countdown, wer ist dran, wer folgt. Keine Bedienelemente; bedient wird die
 * Sequenz auf dem Erfassungsboard des Postens oder im Leitstand.
 *
 * NICHT zu verwechseln mit der Athleten-Anzeige des Board-Systems (`/board/...`,
 * `components/event/board/`): die ist eine öffentliche Publikums-Anzeige mit Kachel-Layout. Dieser
 * Screen hier ist Teil des Zeitnahme-Moduls und hängt ausschließlich an der Timing-Mechanik:
 * Startsequenzen (`useSequence`/`deriveStartDisplay`), Server-Uhr (`useServerClock`) und dem
 * Timing-WebSocket (`useTimingBoardState` liefert den `sequenceChanged`-Feed).
 */
export type TimingStartDisplayPageProps = {
    eventId: string
    stationId: string
}

const TimingStartDisplayPage = ({eventId, stationId}: TimingStartDisplayPageProps) => {
    const {t} = useTranslation()
    const user = useUser()
    const navigate = useNavigate()

    useEffect(() => {
        // Geteilte Anzeige-Geräte tragen das Geräte-Token der Veranstaltung statt einer Sitzung;
        // lesend reicht die Veranstaltungs-Bindung (der Server prüft dasselbe).
        if (deviceSessionForEvent(eventId) !== null) return
        if (
            !user.checkPrivilege(updateAppTimingGlobal) &&
            !user.checkPrivilege(updateEventGlobal) &&
            !user.checkPrivilege(readEventGlobal)
        ) {
            void navigate({to: '/app/forbidden'})
        }
    }, [user, navigate, eventId])

    const clock = useServerClock()
    // Die Route akzeptiert START-Posten (Startbildschirm direkt am Posten) UND ANZEIGE-Posten:
    // Letztere spiegeln über `linkedStation` einen fremden START-Posten — oder, unverknüpft,
    // jede Startsequenz der Veranstaltung. `GET /sequences/active?stationId=<anzeige>` löst das
    // serverseitig auf; das Prädikat hier lässt die passenden WebSocket-Sequenzen durch. Es
    // liest die async geladenen Posten über eine Ref, weil useSequence VOR useTimingBoardState
    // aufgerufen werden muss (der Board-State braucht applySequenceChanged als Argument).
    const stationsRef = useRef<TimingStationDto[]>([])
    const sequenceState = useSequence(eventId, stationId, {
        acceptsStation: sequenceStation => {
            const own = stationsRef.current.find(s => s.id === stationId)
            // Posten noch nicht geladen: der Server hat die Anfrage bereits nach stationId
            // aufgelöst, also nichts verwerfen — der Refetch unten korrigiert notfalls nach.
            if (own === undefined) return true
            if (own.type !== 'ANZEIGE') return sequenceStation === stationId
            if (own.linkedStation != null) return sequenceStation === own.linkedStation
            return true
        },
    })
    const {refetch: refetchSequence} = sequenceState
    const {stations, refetch, wsStatus, stateError} = useTimingBoardState(
        eventId,
        stationId,
        sequenceState.applySequenceChanged,
    )
    useEffect(() => {
        stationsRef.current = stations
    }, [stations])

    const {data: teamsData} = useFetch(signal => getTimingTeams({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const teamsById = useMemo(() => {
        const map = new Map<string, TimingTeamDto>()
        for (const team of teamsData ?? []) map.set(team.competitionMatchTeam, team)
        return map
    }, [teamsData])
    const label = (entry: TimingSequenceEntryDto) =>
        teamLabel(teamsById.get(entry.competitionMatchTeam), entry.competitionMatchTeam)

    // Dieselben Nachhol-Trigger wie Board und Leitstand: Reconnect des WebSockets und Rückkehr in
    // die Sichtbarkeit laden die aktive Sequenz neu (verpasste Nachrichten, gedrosselte Timer).
    const prevWsStatusRef = useRef(wsStatus)
    useEffect(() => {
        if (prevWsStatusRef.current !== 'OPEN' && wsStatus === 'OPEN') {
            refetchSequence()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, refetchSequence])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                refetch()
                refetchSequence()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [refetch, refetchSequence])

    const station = stations.find(s => s.id === stationId)

    // Tab-Titel „<Postenname> · Startbildschirm · Ready2Race" — bei mehreren offenen
    // Posten-Fenstern sind die Tabs sonst nicht auseinanderzuhalten; der Hook stellt beim
    // Verlassen den vorherigen Titel wieder her.
    useDocumentTitle(station?.name, t('timing.startDisplay.title'))

    // Sobald der eigene Posten bekannt ist, die aktive Sequenz erneut laden: Der allererste GET
    // lief evtl. gegen das noch postenlose Prädikat; für einen ANZEIGE-Posten kommt die richtige
    // (gespiegelte) Sequenz sicher erst jetzt konsistent an.
    const stationKnownRef = useRef(false)
    useEffect(() => {
        if (station !== undefined && !stationKnownRef.current) {
            stationKnownRef.current = true
            refetchSequence()
        }
    }, [station, refetchSequence])

    const view = deriveStartDisplay(sequenceState.sequence)

    // WebAudio wartet auf die erste Geste (iOS) — eine reine Anzeige wird womöglich nie
    // angetippt, deshalb sagt ihr ein sichtbarer Hinweis, dass genau ein Tipp fehlt.
    const touchOnly = useTouchOnly()
    const audioUnlocked = useAudioUnlocked()

    /** Zentrale Botschaft ohne Countdown (kein Lauf, vorbereitet, fertig, abgebrochen). */
    const bigMessage = (text: string, entries?: TimingSequenceEntryDto[]) => (
        <Stack spacing={4} alignItems="center" sx={{width: 1}}>
            {/* Auf Telefon-Breite kleiner, sonst bricht schon „Keine laufende Startsequenz"
                unschön mehrzeilig um. */}
            <Typography
                variant="h2"
                textAlign="center"
                sx={{fontSize: {xs: '2rem', sm: '3rem', md: '3.75rem'}}}>
                {text}
            </Typography>
            {entries !== undefined && entries.length > 0 && (
                <Stack divider={<Divider />} sx={{width: 1, maxWidth: 640, overflowY: 'auto'}}>
                    {entries.map(entry => (
                        <Typography
                            key={entry.id}
                            variant="h5"
                            noWrap
                            sx={{
                                py: 1,
                                textDecoration:
                                    entry.status === 'SKIPPED' ? 'line-through' : undefined,
                                color: entry.status === 'SKIPPED' ? 'text.disabled' : undefined,
                            }}>
                            {entry.position + 1}. {label(entry)}
                        </Typography>
                    ))}
                </Stack>
            )}
        </Stack>
    )

    return (
        // Gleiche Vollbild-Behandlung wie die anderen Timing-Boards: aus dem Layoutfluss genommen,
        // damit weder App- noch Hauptlayout die Anzeige einschnüren.
        <Box
            onPointerDown={unlockAudio}
            sx={{
                position: 'fixed',
                inset: 0,
                zIndex: theme => theme.zIndex.drawer + 1,
                bgcolor: 'background.default',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                // Sichere Zonen (Notch/Home-Indicator): die Anzeige läuft auch auf iPhones am
                // Start — quer säße der Countdown sonst teilweise hinter der Aussparung.
                pt: 'env(safe-area-inset-top)',
                pb: 'env(safe-area-inset-bottom)',
                pl: 'env(safe-area-inset-left)',
                pr: 'env(safe-area-inset-right)',
            }}>
            <BoardHeader
                stationName={
                    station !== undefined
                        ? `${station.name} · ${t('timing.startDisplay.title')}`
                        : t('timing.startDisplay.title')
                }
                wsStatus={wsStatus}
                clockQuality={clock.quality}
                now={clock.now}
            />

            {stateError && (
                <Alert severity="error" sx={{flexShrink: 0}}>
                    {t('timing.board.stateError')}
                </Alert>
            )}
            {/* Nur auf reinen Touch-Geräten, solange noch keine Geste den Ton entsperrt hat —
                der Tipp irgendwo auf die Anzeige genügt (onPointerDown oben). */}
            {touchOnly && !audioUnlocked && (
                <Alert severity="info" sx={{flexShrink: 0}}>
                    {t('timing.board.audioHint')}
                </Alert>
            )}
            {station !== undefined &&
                station.type !== 'START' &&
                station.type !== 'ANZEIGE' && (
                    <Alert severity="warning" sx={{flexShrink: 0}}>
                        {t('timing.startDisplay.notStart')}
                    </Alert>
                )}

            <Box
                sx={{
                    flexGrow: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 3,
                    gap: 3,
                }}>
                {view.kind === 'IDLE' && bigMessage(t('timing.startDisplay.idle'))}
                {view.kind === 'ARMED' &&
                    bigMessage(t('timing.startDisplay.armed'), view.entries)}
                {view.kind === 'FINISHING' && bigMessage(t('timing.startDisplay.finishing'))}
                {view.kind === 'SETTLED' &&
                    bigMessage(
                        view.state === 'DONE'
                            ? t('timing.startDisplay.done')
                            : t('timing.startDisplay.aborted'),
                        view.entries,
                    )}
                {view.kind === 'RUNNING' && (
                    <>
                        {view.targetMillis !== undefined && (
                            <SequenceCountdown
                                targetMillis={view.targetMillis}
                                now={clock.now}
                                overdueLabel={t('timing.sequence.running.overdue')}
                                sx={{fontSize: 'clamp(4rem, 24vmin, 18rem)', lineHeight: 1.1}}
                            />
                        )}
                        <Stack spacing={1} alignItems="center" sx={{width: 1, minHeight: 0}}>
                            <Typography variant="h6" color="text.secondary">
                                {t('timing.startDisplay.next')}
                            </Typography>
                            <Typography
                                variant="h3"
                                textAlign="center"
                                noWrap
                                sx={{maxWidth: 1}}>
                                {label(view.next)}
                            </Typography>
                        </Stack>
                        {view.following.length > 0 && (
                            <Stack
                                spacing={1}
                                sx={{width: 1, maxWidth: 640, minHeight: 0, overflowY: 'auto'}}>
                                <Typography variant="h6" color="text.secondary" textAlign="center">
                                    {t('timing.startDisplay.following')}
                                </Typography>
                                <Stack divider={<Divider />}>
                                    {view.following.map(entry => (
                                        <Typography
                                            key={entry.id}
                                            variant="h5"
                                            noWrap
                                            textAlign="center"
                                            sx={{py: 1}}>
                                            {label(entry)}
                                        </Typography>
                                    ))}
                                </Stack>
                            </Stack>
                        )}
                    </>
                )}
            </Box>
        </Box>
    )
}

export default TimingStartDisplayPage
