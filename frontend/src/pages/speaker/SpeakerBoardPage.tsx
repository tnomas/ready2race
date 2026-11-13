import {Box, ButtonBase, Collapse, IconButton, Stack, Typography} from '@mui/material'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import RefreshIcon from '@mui/icons-material/Refresh'
import SettingsIcon from '@mui/icons-material/Settings'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import {
    getEvent,
    getLatestMatchResults,
    getRunningMatches,
    getUpcomingMatches,
} from '@api/sdk.gen.ts'
import SpeakerMatchPanel from '@components/speaker/SpeakerMatchPanel.tsx'
import SpeakerParticipantPanel from '@components/speaker/SpeakerParticipantPanel.tsx'
import SpeakerProgramPanel from '@components/speaker/SpeakerProgramPanel.tsx'
import SpeakerSettingsDialog from '@components/speaker/SpeakerSettingsDialog.tsx'
import SpeakerTimeline from '@components/speaker/SpeakerTimeline.tsx'
import SpeakerTimingPanel from '@components/speaker/SpeakerTimingPanel.tsx'
import {
    computeSpeakerBadges,
    isLiveOnWater,
    liveFollowCandidate,
    matchLabel,
    mergeSpeakerMatches,
    nextUpcomingSpeakerMatch,
    SpeakerMatch,
} from '@components/speaker/speakerData.ts'
import {summarizeFeeds} from '@components/speaker/speakerFeeds.ts'
import {useSpeakerTiming} from '@components/speaker/speakerTiming.ts'
import {
    loadSpeakerSettings,
    resolveSpeakerColors,
    saveSpeakerSettings,
    SpeakerSettings,
    SpeakerSettingsContext,
} from '@components/speaker/speakerSettings.ts'
import Throbber from '@components/Throbber.tsx'
import {useFetch} from '@utils/hooks.ts'
import {stretchedPollMs} from '@utils/eventChange/eventChangePush.ts'
import {useEventChangeSocket} from '@utils/eventChange/useEventChangeSocket.ts'
import {useParams} from '@tanstack/react-router'
import {IconButtonLink} from '@components/ui/links.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {readEventGlobal} from '@authorization/privileges.ts'
import {format} from 'date-fns'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'

const FETCH_LIMIT = 500

/**
 * Fester Basis-Takt des Sicherheitsnetz-Pollings. Kein Nutzer-Regler mehr: Das Board hängt am
 * Event-Push (jede relevante Schreibaktion bumpt den EventChangeMarker, auch Klärung und
 * Zeitnahme) und am Timing-Kanal — der Poll fängt nur noch stumm gestorbene Verbindungen ab.
 * Bei stehendem Push streckt stretchedPollMs die 30 s auf 4 min; nur ohne Socket wird wirklich
 * alle 30 s geladen.
 */
const POLL_BASE_MS = 30_000

/**
 * Das Sprecher-Board als Dashboard: Programm links, Details des gewählten Laufs in der Mitte,
 * rechts die Echtzeit-Lage der Zeitnahme und das Athlet:innen-Panel. Alles steht nebeneinander
 * statt in verschachtelten Dialogen — eine Sprecherin will Dinge stehen lassen können, während
 * sie weiterklickt. Der Zeitstrahl bleibt als einklappbarer Streifen darüber erhalten.
 */
const SpeakerBoardPage = () => {
    const {t} = useTranslation()
    const {eventId} = useParams({from: '/speaker/event/$eventId'})
    const canReadEvent = useUser().checkPrivilege(readEventGlobal)

    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [fullscreen, setFullscreen] = useState(false)
    const [now, setNow] = useState(new Date())

    const [settings, setSettings] = useState<SpeakerSettings>(loadSpeakerSettings)
    const colors = useMemo(() => resolveSpeakerColors(settings), [settings])
    const updateSettings = (update: Partial<SpeakerSettings>) =>
        setSettings(previous => {
            const next = {...previous, ...update}
            saveSpeakerSettings(next)
            return next
        })

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 15000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        const onFullscreenChange = () => setFullscreen(document.fullscreenElement != null)
        document.addEventListener('fullscreenchange', onFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
    }, [])

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        } else {
            document.documentElement.requestFullscreen().catch(() => {})
        }
    }

    const {data: eventData} = useFetch(signal => getEvent({signal, path: {eventId}}), {
        deps: [eventId],
    })

    // Push-Kanal der Veranstaltung: Änderungen laden alle drei Listen sofort (entprellt) nach.
    // Der Rückruf hängt an einer Ref, weil reloadAll erst unterhalb der drei Abrufe entsteht.
    const reloadAllRef = useRef<() => void>(() => {})
    const {connected: pushConnected} = useEventChangeSocket(eventId, () => reloadAllRef.current())
    // Solange der Kanal steht, wird der eingestellte Takt zum trägen Sicherheitsnetz gestreckt —
    // reißt er ab, gilt unverändert der eingestellte Takt.
    const reloadInterval = stretchedPollMs(POLL_BASE_MS, pushConnected)

    const {
        data: upcomingData,
        error: upcomingError,
        reload: reloadUpcoming,
    } = useFetch(
        signal => getUpcomingMatches({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    // includeClarification: strittige Läufe fliegen aus den öffentlichen Anzeigen, aber die
    // Sprecherin muss sie sehen und als "in Klärung" ansagen können.
    const {
        data: runningData,
        error: runningError,
        reload: reloadRunning,
    } = useFetch(
        signal =>
            getRunningMatches({
                signal,
                path: {eventId},
                query: {limit: FETCH_LIMIT, includeClarification: true},
            }),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    const {
        data: resultsData,
        error: resultsError,
        reload: reloadResults,
    } = useFetch(
        signal => getLatestMatchResults({signal, path: {eventId}, query: {limit: FETCH_LIMIT}}),
        {deps: [eventId, reloadInterval], autoReloadInterval: reloadInterval},
    )

    // Geladen, sobald ein Feed da ist - oder alle drei gescheitert sind: dann zeigt das Board
    // den Banner statt ewig den Wartekreis. Ein gescheiterter Feed bei stehenden anderen ist
    // ein leiser Fehler, den die Sprecherin sonst nie sähe (die Listen wären nur unvollständig).
    const feeds = summarizeFeeds([
        {data: upcomingData, error: upcomingError},
        {data: runningData, error: runningError},
        {data: resultsData, error: resultsError},
    ])
    const loaded = feeds.loaded

    const matches = useMemo(
        () => mergeSpeakerMatches(upcomingData ?? [], runningData ?? [], resultsData ?? []),
        [upcomingData, runningData, resultsData],
    )

    const badges = useMemo(() => computeSpeakerBadges(matches), [matches])

    const reloadAll = () => {
        reloadUpcoming()
        reloadRunning()
        reloadResults()
    }
    reloadAllRef.current = reloadAll

    // Strittige Läufe zählen nicht als "live" — sie laufen gerade eben nicht, sie werden geklärt.
    // Ebenso wenig die nur an den Start gerufenen (In Vorbereitung).
    const runningCount = matches.filter(isLiveOnWater).length

    // Echtzeit-Zeitnahme (Sequenzen, Fehlstärte, Zieleinläufe) über denselben Kanal wie der
    // Leitstand — rein lesend, ohne Berechtigung degradiert das Panel zu einem Hinweis.
    const timing = useSpeakerTiming(eventId, settings.timingTickerLimit)

    // Zeitnahme-Aktivität lädt die Sprecher-Listen nach: Das Scharfstellen einer Sequenz oder ein
    // Zieleinlauf verschiebt einen Lauf sofort zwischen den drei Info-Feeds. Der Event-Push deckt
    // diese Schreibpfade zwar auch ab (jede Sequenz-Mutation bumpt den EventChangeMarker), aber er
    // stellt im verdeckten Tab zu und lebt auf einer eigenen Verbindung — der Timing-Kanal ist der
    // zweite, unabhängige Signalweg, damit ein montiertes Sprecher-Display nicht an genau einer
    // Socket-Gesundheit hängt. Der Schlüssel fasst alles zusammen, was einen Feed-Wechsel anzeigt;
    // entprellt, weil eine Startwelle viele Nachrichten in kurzer Folge bringt. Ein Fehlstart
    // gehört nicht hinein: Er verschiebt keinen Lauf zwischen den Feeds, und sein Banner kommt
    // und geht (Wegklicken, Ablauf) - jedes Mal ein Nachladen ohne neuen Stand.
    const timingActivityKey = [
        [...timing.sequences.values()]
            .map(
                sequence =>
                    `${sequence.id}:${sequence.state}:${
                        sequence.entries.filter(entry => entry.status === 'STARTED').length
                    }`,
            )
            .join('|'),
        timing.finishTicker[0]?.markId ?? '',
    ].join('·')
    const activityReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const seenActivityKey = useRef<string | null>(null)
    useEffect(() => {
        // Erstlauf: Die drei Feeds laden gerade ohnehin - ein zweiter Schwung 1,2 s später
        // brächte nur dieselben Daten noch einmal.
        if (seenActivityKey.current === null) {
            seenActivityKey.current = timingActivityKey
            return
        }
        seenActivityKey.current = timingActivityKey
        if (activityReloadTimer.current !== null) clearTimeout(activityReloadTimer.current)
        activityReloadTimer.current = setTimeout(() => {
            activityReloadTimer.current = null
            reloadAllRef.current()
        }, 1200)
        return () => {
            if (activityReloadTimer.current !== null) {
                clearTimeout(activityReloadTimer.current)
                activityReloadTimer.current = null
            }
        }
    }, [timingActivityKey])

    // Partien, die gerade in einer scharfen/laufenden/pausierten Startsequenz stecken.
    const startingMatchIds = useMemo(() => {
        const ids = new Set<string>()
        for (const sequence of timing.sequences.values()) {
            if (
                sequence.state !== 'ARMED' &&
                sequence.state !== 'RUNNING' &&
                sequence.state !== 'PAUSED'
            )
                continue
            sequence.entries.forEach(entry => {
                const ref = timing.index.byTeam.get(entry.competitionMatchTeam)
                if (ref) ids.add(ref.match.competitionSetupMatch)
            })
        }
        return ids
    }, [timing.sequences, timing.index])

    const falseStartMatchIds = useMemo(
        () => new Set(timing.falseStarts.map(event => event.matchId)),
        [timing.falseStarts],
    )

    // „Live folgen": der Lauf, den die Mitte von selbst zeigen soll — bevorzugt der Lauf in einer
    // laufenden Startsequenz, sonst der zuletzt gestartete laufende, sonst der nächste anstehende.
    const liveMatchId = useMemo(() => {
        for (const sequence of timing.sequences.values()) {
            if (sequence.state !== 'RUNNING' && sequence.state !== 'ARMED') continue
            const nextEntry = [...sequence.entries]
                .sort((a, b) => a.position - b.position)
                .find(entry => entry.status === 'PENDING')
            const ref = nextEntry
                ? timing.index.byTeam.get(nextEntry.competitionMatchTeam)
                : undefined
            if (ref) return ref.match.competitionSetupMatch
        }
        // Ein strittiger Lauf ist nicht "das Live-Geschehen auf dem Wasser" — er bleibt sichtbar,
        // aber die Automatik springt nicht auf ihn.
        return liveFollowCandidate(matches, now.getTime())
    }, [timing.sequences, timing.index, matches, now])

    useEffect(() => {
        if (settings.followLive && liveMatchId != null) {
            setSelectedMatchId(liveMatchId)
        }
    }, [settings.followLive, liveMatchId])

    // „Als Nächstes" in der Kopfzeile: derselbe Lauf, auf den „Live folgen" zurückfällt, wenn
    // nichts läuft — ein Tipp springt hin, ohne durchs Programm zu scrollen.
    const nextMatch = useMemo(
        () => nextUpcomingSpeakerMatch(matches, now.getTime()),
        [matches, now],
    )

    const selectedMatch = useMemo(
        () => matches.find(match => match.matchId === selectedMatchId) ?? null,
        [matches, selectedMatchId],
    )

    // Ein Handgriff wählt den Lauf UND löst das Live-Folgen — sonst spränge die Mitte beim
    // nächsten Datenstand sofort wieder weg von der bewussten Auswahl.
    const selectMatchManually = (match: SpeakerMatch) => {
        setSelectedMatchId(match.matchId)
        if (settings.followLive) updateSettings({followLive: false})
    }

    const selectMatchById = (matchId: string) => {
        const match = matches.find(candidate => candidate.matchId === matchId)
        if (match) selectMatchManually(match)
    }

    const matchLabelOf = (matchId: string): string | null => {
        const match = matches.find(candidate => candidate.matchId === matchId)
        return match ? matchLabel(match) : null
    }

    return (
        <SpeakerSettingsContext.Provider value={{settings, colors, updateSettings}}>
            <Box
                sx={{
                    height: '100vh',
                    bgcolor: colors.background,
                    color: colors.text,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: {xs: 'auto', lg: 'hidden'},
                }}>
                {/*
                    Kopfzeile (13.11.2026): Zurück, Veranstaltung, Verbindung in Worten, „Als
                    Nächstes" zum Antippen, Uhr und Werkzeuge. Schmal bricht sie in zwei Zeilen
                    um, statt den Titel Wort für Wort zu stapeln; die Knöpfe haben 48 px.
                */}
                <Stack
                    direction={'row'}
                    alignItems={'center'}
                    flexWrap={'wrap'}
                    useFlexGap
                    columnGap={1.5}
                    rowGap={0.5}
                    sx={{
                        px: {xs: 1, sm: 2},
                        py: 1,
                        borderBottom: `1px solid ${colors.border}`,
                        position: 'sticky',
                        top: 0,
                        bgcolor: colors.background,
                        zIndex: 10,
                        flexShrink: 0,
                        '& .MuiIconButton-root': {width: 48, height: 48},
                    }}>
                    {/* Zurück zum fachlichen Elternteil: wer die Veranstaltung lesen darf, in
                        deren Betrieb; sonst wie bisher zur Auswahl der Sprecher-Boards. */}
                    {canReadEvent ? (
                        <IconButtonLink
                            to={'/event/$eventId'}
                            params={{eventId}}
                            search={{tab: 'betrieb'}}
                            aria-label={t('common.back')}
                            sx={{color: colors.textSecondary}}>
                            <ArrowBackIcon />
                        </IconButtonLink>
                    ) : (
                        <IconButtonLink
                            to={'/speaker'}
                            aria-label={t('common.back')}
                            sx={{color: colors.textSecondary}}>
                            <ArrowBackIcon />
                        </IconButtonLink>
                    )}
                    <Box sx={{minWidth: 0, flex: '1 1 200px'}}>
                        <Typography component={'h1'} variant={'h6'} noWrap fontWeight={'bold'}>
                            🎙️ {eventData?.name ?? t('speaker.title')}
                        </Typography>
                        <Typography
                            variant={'caption'}
                            noWrap
                            sx={{color: colors.textSecondary, display: 'block'}}>
                            {t('speaker.title')}
                            {/* Verbindung des Push-Kanals in Worten: ohne ihn lädt das Board nur
                                im 30-s-Takt nach (siehe POLL_BASE_MS). */}
                            {' · '}
                            <Typography
                                component={'span'}
                                variant={'caption'}
                                fontWeight={'bold'}
                                sx={{color: pushConnected ? colors.running : colors.now}}>
                                {pushConnected
                                    ? t('speaker.connection.live')
                                    : t('speaker.connection.polling')}
                            </Typography>
                            {runningCount > 0 && (
                                <Typography
                                    component={'span'}
                                    variant={'caption'}
                                    fontWeight={'bold'}
                                    sx={{color: colors.running}}>
                                    {' '}
                                    · ● {t('speaker.liveCount', {count: runningCount})}
                                </Typography>
                            )}
                        </Typography>
                    </Box>
                    {nextMatch && (
                        <ButtonBase
                            onClick={() => selectMatchManually(nextMatch)}
                            sx={{
                                minHeight: 48,
                                px: 1.5,
                                borderRadius: 1,
                                border: `1px solid ${colors.border}`,
                                textAlign: 'left',
                                display: 'block',
                                maxWidth: {xs: '100%', md: 360},
                                order: {xs: 3, md: 0},
                                flex: {xs: '1 1 100%', md: '0 1 auto'},
                                cursor: 'pointer',
                                '&:hover': {borderColor: colors.upcoming},
                            }}>
                            <Typography
                                variant={'caption'}
                                sx={{color: colors.upcoming, display: 'block', fontWeight: 'bold'}}>
                                {t('speaker.nextUp')}
                                {nextMatch.startTime &&
                                    ` · ${format(nextMatch.startTime, t('format.time'))}`}
                            </Typography>
                            <Typography variant={'body2'} noWrap sx={{color: colors.text}}>
                                {matchLabel(nextMatch)}
                            </Typography>
                        </ButtonBase>
                    )}
                    <Stack direction={'row'} alignItems={'center'} spacing={0.5}>
                        <Typography
                            variant={'h6'}
                            fontWeight={'bold'}
                            sx={{fontVariantNumeric: 'tabular-nums', mx: 1}}>
                            {format(now, t('format.time'))}
                        </Typography>
                        <IconButton
                            onClick={() => updateSettings({showTimeline: !settings.showTimeline})}
                            title={t('speaker.tabs.timeline')}
                            aria-label={t('speaker.tabs.timeline')}
                            aria-pressed={settings.showTimeline}
                            sx={{
                                color: settings.showTimeline
                                    ? colors.upcoming
                                    : colors.textSecondary,
                            }}>
                            <ViewTimelineIcon />
                        </IconButton>
                        <IconButton
                            onClick={reloadAll}
                            aria-label={t('common.reload')}
                            sx={{color: colors.textSecondary}}>
                            <RefreshIcon />
                        </IconButton>
                        <IconButton
                            onClick={() => setSettingsOpen(true)}
                            aria-label={t('common.settings')}
                            sx={{color: colors.textSecondary}}>
                            <SettingsIcon />
                        </IconButton>
                        <IconButton
                            onClick={toggleFullscreen}
                            aria-label={t('common.fullscreen')}
                            aria-pressed={fullscreen}
                            sx={{color: colors.textSecondary}}>
                            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                        </IconButton>
                    </Stack>
                </Stack>
                {feeds.failed > 0 && (
                    <Box
                        role={'alert'}
                        sx={{
                            mx: 2,
                            mt: 2,
                            px: 1.5,
                            py: 1,
                            borderRadius: 1,
                            border: `1px solid ${colors.now}`,
                            bgcolor: `${colors.now}1f`,
                            flexShrink: 0,
                        }}>
                        <Typography variant={'body2'} fontWeight={'bold'} sx={{color: colors.now}}>
                            ⚠ {t('speaker.error.feed', {count: feeds.failed})}
                        </Typography>
                    </Box>
                )}
                {!loaded ? (
                    <Throbber />
                ) : (
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            zoom: settings.scalePercent / 100,
                        }}>
                        <Collapse in={settings.showTimeline}>
                            <Box sx={{px: 2, pt: 2, maxHeight: '38vh', overflowY: 'auto'}}>
                                <SpeakerTimeline
                                    matches={matches}
                                    badges={badges}
                                    now={now}
                                    onSelectMatch={selectMatchManually}
                                />
                            </Box>
                        </Collapse>
                        <Box
                            sx={{
                                flex: 1,
                                minHeight: 0,
                                p: 2,
                                display: 'grid',
                                gap: 2,
                                gridTemplateColumns: {
                                    xs: 'minmax(0, 1fr)',
                                    lg: 'minmax(320px, 3fr) minmax(400px, 4.5fr) minmax(300px, 3fr)',
                                },
                                alignItems: 'stretch',
                            }}>
                            {/* Schmal (unter lg) steht der gewählte Lauf zuerst: aktueller Lauf und
                                Ergebnis ohne Scrollen, das Programm darunter. */}
                            <Box sx={{minHeight: {xs: 320, lg: 0}, order: {xs: 2, lg: 0}}}>
                                <SpeakerProgramPanel
                                    matches={matches}
                                    badges={badges}
                                    selectedMatchId={selectedMatchId}
                                    onSelectMatch={selectMatchManually}
                                    startingMatchIds={startingMatchIds}
                                    falseStartMatchIds={falseStartMatchIds}
                                />
                            </Box>
                            <Box sx={{minHeight: {xs: 320, lg: 0}, order: {xs: 1, lg: 0}}}>
                                <SpeakerMatchPanel
                                    match={selectedMatch}
                                    badges={badges}
                                    timing={timing}
                                    followLive={settings.followLive}
                                    onToggleFollowLive={follow =>
                                        updateSettings({followLive: follow})
                                    }
                                    onSelectParticipant={setSelectedParticipantId}
                                />
                            </Box>
                            <Box
                                sx={{
                                    minHeight: {xs: 320, lg: 0},
                                    order: {xs: 3, lg: 0},
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                }}>
                                <Box sx={{flex: 1, minHeight: 0}}>
                                    <SpeakerTimingPanel
                                        timing={timing}
                                        matchLabelOf={matchLabelOf}
                                        onSelectMatch={selectMatchById}
                                    />
                                </Box>
                                {selectedParticipantId && (
                                    <Box sx={{flex: 1, minHeight: 0}}>
                                        <SpeakerParticipantPanel
                                            participantId={selectedParticipantId}
                                            badges={badges}
                                            now={now}
                                            onClose={() => setSelectedParticipantId(null)}
                                            onSelectMatch={selectMatchManually}
                                        />
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                )}
                <SpeakerSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </Box>
        </SpeakerSettingsContext.Provider>
    )
}

export default SpeakerBoardPage
