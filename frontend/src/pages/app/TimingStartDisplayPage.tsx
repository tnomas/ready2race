import {Alert, Box, Divider, Stack, Typography} from '@mui/material'
import {Theme} from '@mui/material/styles'
import {ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {useNavigate} from '@tanstack/react-router'
import {getTimingMatches, getTimingTeams} from '@api/sdk.gen.ts'
import {
    TimingMatchDto,
    TimingMatchTeamDto,
    TimingSequenceEntryDto,
    TimingStationDto,
    TimingTeamDto,
} from '@api/types.gen.ts'
import {
    readEventGlobal,
    updateAppTimingGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFetch} from '@utils/hooks.ts'
import BoardAlarm from '@components/timing/BoardAlarm.tsx'
import BoardHeader from '@components/timing/BoardHeader.tsx'
import SequenceCountdown from '@components/timing/SequenceCountdown.tsx'
import {useTimingBoardState} from '@components/timing/useTimingBoardState.ts'
import {useSequence} from '@utils/timing/useSequence.ts'
import {useServerClock} from '@utils/timing/useServerClock.ts'
import {
    NextMatchAnnouncement,
    deriveStartDisplay,
    nextMatchAnnouncement,
} from '@utils/timing/sequenceDisplay.ts'
import {scaledFontSize, startDisplayLabel} from '@utils/timing/startDisplayRender.ts'
import {compactScheduleTitle} from '@utils/timing/matchBoard.ts'
import {debounce} from '@utils/debounce.ts'
import {deviceSessionForEvent} from '@utils/timing/deviceSession.ts'
import {useDocumentTitle} from '@utils/useDocumentTitle.ts'
import {unlockAudio} from '@utils/timing/feedback.ts'
import {tonePlanForSequence} from '@utils/timing/tonePlan.ts'
import {useFalseStartTone} from '@utils/timing/useFalseStartTone.ts'
import {isFalseStartOnDisplay} from '@utils/timing/falseStart.ts'
import {useTimingSettings} from '@utils/timing/useTimingSettings.ts'
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
 *
 * WAS der Bildschirm zeigt, entscheidet seit dem 24.08.2026 die Veranstaltung: der aufgelöste
 * Block `settings.startDisplay` (Schalter je Angabe, drei Größenfaktoren, Anzahl der gelisteten
 * Folgeboote) kommt über `useTimingSettings` und wird über `settingsChanged` live nachgezogen —
 * eine Änderung im Einstellungs-Formular greift also ohne Neuladen auf jedem Bildschirm am Steg.
 * Die Umsetzung der Schalter in eine Zeile steckt in `startDisplayRender.ts`, damit sie ohne DOM
 * testbar bleibt.
 *
 * Zwischen zwei Läufen bleibt der Bildschirm nicht mehr leer: `nextMatchAnnouncement` sucht den
 * aufgerufenen nächsten Lauf und der Bildschirm kündigt ihn samt dem Boot an, das als Erstes an
 * den Start geht. Und eine angehaltene Sequenz blinkt orange (`BoardAlarm`) — wer am Steg steht,
 * muss aus einigen Metern Entfernung sehen, dass der Countdown gerade NICHT läuft.
 */
export type TimingStartDisplayPageProps = {
    eventId: string
    stationId: string
}

/**
 * Wie lange der rote Fehlstart-Alarm längstens steht, wenn ihn kein neuer Start ablöst. Zwei
 * Minuten sind großzügig genug für einen Rückruf samt Rückfahrt zur Startlinie und kurz genug,
 * dass ein vergessener Schirm nicht den halben Regattatag rot blinkt.
 */
const FALSE_START_VISIBLE_MILLIS = 120_000

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

    // Die Startliste liefert den aufgelösten Zeitnahmetyp samt Tonplan (wie das Erfassungsboard);
    // läuft wie /teams auch mit Geräte-Token. Ohne Treffer spielt der eingebaute Standardplan.
    // VOR dem Board-State geladen, weil der Fehlstart-Hook sie braucht und sein Callback in den
    // Board-State hineingereicht wird.
    const {data: matchesData, reload: reloadMatches} = useFetch(
        signal => getTimingMatches({signal, path: {eventId}}),
        {deps: [eventId]},
    )

    // `matchesChanged` ist der einzige Auslöser, der eine NEUE oder ENTFALLENE Partie meldet: alle
    // anderen Nachrichten des Kanals (Marke, Zuordnung, Sequenz) setzen voraus, dass es die Partie
    // schon gibt. Ohne diesen Anschluss stünde die Startliste dieser Seite still, sobald jemand
    // eine Folgerunde erzeugt oder den Zeitplan verschiebt — und damit auch die Ankündigung des
    // nächsten Laufs, die sich genau aus dieser Liste speist.
    //
    // Entprellt wie in `useTimingMatches`: eine Rundenerzeugung fällt mit dem Zeitplan-Schreiben
    // zusammen und schickt die Nachricht in Schüben; 800 ms Ruhe genügen, um daraus eine einzige
    // Anfrage zu machen. Der Reload läuft über eine Ref, weil `useFetch` bei jedem Render eine
    // neue Closure liefert — als Abhängigkeit würde sie den Entpreller in jedem Render neu bauen
    // und damit dessen Wartezeit endlos verlängern.
    const reloadMatchesRef = useRef(reloadMatches)
    useEffect(() => {
        reloadMatchesRef.current = reloadMatches
    })
    const bumpMatches = useMemo(() => debounce(() => reloadMatchesRef.current(), 800), [])
    useEffect(() => () => bumpMatches.cancel(), [bumpMatches])

    // Zeitnahme-Einstellungen (Fehlstart-Ton): initial per GET (läuft auch mit Geräte-Token),
    // live über settingsChanged — dieselbe Versorgung wie auf dem Erfassungsboard.
    const {
        settings,
        applyChanged: applySettingsChanged,
        reload: reloadSettings,
    } = useTimingSettings(eventId)

    // Fehlstart-Ton: RUNNING→ABORTED der gespiegelten Sequenz und attemptRetracted der gerade
    // gezeigten Partie — Bedingungen in `falseStart.ts`, verdeckter Tab bleibt still.
    const {onAttemptRetracted} = useFalseStartTone(
        sequenceState.sequence,
        matchesData ?? [],
        settings.falseStartTone,
    )

    /**
     * Der ausdrückliche Fehlstart (Rückruf über den Knopf des Start-Boards): „In diesem Fall
     * blinkt die Athletenanzeige deutlich rot und es steht ‚Fehlstart' sichtbar da."
     *
     * Gehalten wird nur der Zeitpunkt — was gezeichnet wird, entscheidet der Render weiter unten.
     * Die Bedingung, ob der Rückruf DIESE Anzeige angeht, steht rein und getestet in
     * `falseStart.ts`; sie liest Sequenz, Startliste und Ankündigung über Refs, weil die
     * Nachricht jederzeit eintreffen kann und der Callback sonst einen veralteten Stand sähe.
     */
    const [falseStartAtMillis, setFalseStartAtMillis] = useState<number | null>(null)
    const falseStartContextRef = useRef<{
        matches: readonly TimingMatchDto[]
        announced: string | undefined
    }>({matches: [], announced: undefined})
    const handleFalseStart = useCallback(
        (info: {competitionSetupMatch: string}) => {
            const {matches, announced} = falseStartContextRef.current
            if (
                isFalseStartOnDisplay(
                    info.competitionSetupMatch,
                    matches,
                    sequenceState.sequence,
                    announced,
                )
            ) {
                setFalseStartAtMillis(Date.now())
            }
        },
        [sequenceState.sequence],
    )

    const {stations, refetch, wsStatus, stateError} = useTimingBoardState(
        eventId,
        stationId,
        sequenceState.applySequenceChanged,
        undefined,
        applySettingsChanged,
        onAttemptRetracted,
        bumpMatches,
        handleFalseStart,
    )
    useEffect(() => {
        stationsRef.current = stations
    }, [stations])

    const {data: teamsData} = useFetch(signal => getTimingTeams({signal, path: {eventId}}), {
        deps: [eventId],
    })
    const tonePlan = useMemo(
        () => tonePlanForSequence(matchesData ?? [], sequenceState.sequence),
        [matchesData, sequenceState.sequence],
    )
    const teamsById = useMemo(() => {
        const map = new Map<string, TimingTeamDto>()
        for (const team of teamsData ?? []) map.set(team.competitionMatchTeam, team)
        return map
    }, [teamsData])

    // Der Anzeige-Block der Veranstaltung; nie null (der Server liefert ihn aufgelöst, der Hook
    // hält bis zur ersten Antwort dieselben Vorgaben), deshalb ohne jede Null-Prüfung im Rumpf.
    const display = settings.startDisplay

    /**
     * Beschriftung eines Sequenz-Eintrags nach den Einstellungen. Die Position kommt aus dem
     * Eintrag selbst, nicht aus der Schleife: übersprungene Boote bleiben in der Liste stehen, ein
     * Zähllauf würde die Nummern danach verschieben und damit gegen den Aufruf am Steg laufen.
     */
    const label = (entry: TimingSequenceEntryDto) =>
        startDisplayLabel(
            display,
            teamsById.get(entry.competitionMatchTeam),
            entry.competitionMatchTeam,
            entry.position,
        )

    /**
     * Beschriftung eines Bootes aus der Startliste (Ankündigung), also OHNE Sequenz-Eintrag.
     * `/teams` und `/matches` sind zwei Endpunkte: der erste kennt die Athletennamen, der zweite
     * nur Startnummer, Boots- und Vereinsname. Ist das Boot in `/teams` (noch) nicht dabei — die
     * beiden Ladewege sind unabhängig und können kurz auseinanderliegen —, wird aus den Feldern
     * der Partie ein gleichwertiges Team gebaut, damit die Ankündigung nicht auf eine UUID
     * zurückfällt. Nur die Athletennamen fehlen dann; das ist der bessere Verlust.
     */
    const announcementLabel = (match: TimingMatchDto, team: TimingMatchTeamDto) => {
        const known = teamsById.get(team.competitionMatchTeam)
        const resolved: TimingTeamDto = known ?? {
            competitionMatchTeam: team.competitionMatchTeam,
            startNumber: team.startNumber,
            teamName: team.teamName ?? undefined,
            clubName: team.clubName ?? undefined,
            participantNames: [],
            matchPhase: match.phase,
        }
        return startDisplayLabel(display, resolved, team.competitionMatchTeam)
    }

    // Dieselben Nachhol-Trigger wie Board und Leitstand: Reconnect des WebSockets und Rückkehr in
    // die Sichtbarkeit laden die aktive Sequenz neu (verpasste Nachrichten, gedrosselte Timer).
    const prevWsStatusRef = useRef(wsStatus)
    useEffect(() => {
        if (prevWsStatusRef.current !== 'OPEN' && wsStatus === 'OPEN') {
            refetchSequence()
            // Verpasste settingsChanged-Nachrichten (z.B. geänderter Fehlstart-Ton) nachholen.
            reloadSettings()
        }
        prevWsStatusRef.current = wsStatus
    }, [wsStatus, refetchSequence, reloadSettings])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                refetch()
                refetchSequence()
                reloadSettings()
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [refetch, refetchSequence, reloadSettings])

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

    // Die Ankündigung des nächsten Laufs — die Ableitung selbst steht rein und getestet in
    // `sequenceDisplay.ts`, hier wird sie nur gezeichnet.
    const announcement = useMemo(() => nextMatchAnnouncement(matchesData ?? []), [matchesData])

    // Versorgung des Fehlstart-Callbacks (siehe oben): er läuft aus einer WebSocket-Nachricht
    // heraus und darf nie einen veralteten Stand sehen.
    useEffect(() => {
        falseStartContextRef.current = {
            matches: matchesData ?? [],
            announced: announcement?.match.competitionSetupMatch,
        }
    })

    /**
     * Wann das rote Blinken wieder aufhört — zwei Wege, und beide braucht es:
     *
     * - Sobald wieder eine Sequenz scharf steht oder läuft, ist der Rückruf abgearbeitet: die
     *   Boote sind zurück, es wird neu gestartet. Genau dann muss der Schirm wieder normal sein,
     *   sonst blinkt er in den nächsten Start hinein.
     * - Ersatzweise nach zwei Minuten. Ein Rückruf, auf den kein neuer Start folgt (Lauf wird
     *   verschoben, Schirm bleibt stehen), dürfte sonst bis zum Abend rot pulsen — und ein Alarm,
     *   der immer an ist, sagt nichts mehr.
     */
    const sequenceStateValue = sequenceState.sequence?.state
    useEffect(() => {
        if (sequenceStateValue === 'ARMED' || sequenceStateValue === 'RUNNING') {
            setFalseStartAtMillis(null)
        }
    }, [sequenceStateValue, sequenceState.sequence?.id])
    useEffect(() => {
        if (falseStartAtMillis === null) return
        const timer = setTimeout(() => setFalseStartAtMillis(null), FALSE_START_VISIBLE_MILLIS)
        return () => clearTimeout(timer)
    }, [falseStartAtMillis])

    // WebAudio wartet auf die erste Geste (iOS) — eine reine Anzeige wird womöglich nie
    // angetippt, deshalb sagt ihr ein sichtbarer Hinweis, dass genau ein Tipp fehlt.
    const touchOnly = useTouchOnly()
    const audioUnlocked = useAudioUnlocked()

    /**
     * Eine Theme-Schriftgröße mit dem Listen-Faktor multiplizieren. Die MUI-Variante bleibt stehen
     * (Gewicht, Zeilenhöhe, Abstände kommen weiter von dort) — überschrieben wird nur die Größe,
     * und bei Faktor 1 kommt exakt der Theme-Wert heraus. Deshalb der Umweg über das Theme statt
     * fest eingetragener Zahlen: eine Veranstaltung mit eigener Schrift verschiebt die Größen im
     * Theme, und die Anzeige soll dieser Wahl folgen und sie nicht überschreiben.
     */
    const listFont = (variant: 'h3' | 'h5' | 'h6') => (theme: Theme) => ({
        fontSize: scaledFontSize(
            String(theme.typography[variant].fontSize ?? '1rem'),
            display.listScale,
        ),
    })

    /**
     * Der Ankündigungs-Block: welcher Lauf als Nächstes drankommt und — betont — welches Boot ihn
     * eröffnet. Fachlich verlangt: „Der nächste Lauf ist in der Uhrzeit der nächste. Das ist der,
     * der in Vorbereitung ist, wenn der alte abgehakt ist."
     *
     * Die geplante Uhrzeit steht bewusst mit im Titel: zwischen zwei Läufen ist das die Frage, die
     * am Steg gestellt wird, und die Antwort steht sonst nur in der Tagesablauf-Spalte des
     * Erfassungsboards, die hier niemand sieht.
     */
    const announcementBlock = (next: NextMatchAnnouncement) => {
        const time =
            next.match.startTime == null
                ? null
                : new Date(next.match.startTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                  })
        return (
            <Stack spacing={1} alignItems="center" sx={{width: 1, minHeight: 0}}>
                <Typography variant="h6" color="text.secondary" sx={listFont('h6')}>
                    {t('timing.startDisplay.upcoming')}
                </Typography>
                <Typography variant="h5" textAlign="center" sx={listFont('h5')}>
                    {[time, compactScheduleTitle(next.match)].filter(part => part).join(' · ')}
                </Typography>
                {next.firstTeam !== undefined && (
                    <>
                        <Typography
                            variant="h6"
                            color="text.secondary"
                            sx={[listFont('h6'), {pt: 2}]}>
                            {t('timing.startDisplay.upcomingFirst')}
                        </Typography>
                        {/* Das erste Boot ist die eigentliche Botschaft dieser Ansicht — es soll
                            aus der Entfernung lesbar sein, deshalb die große Stufe und kein
                            `noWrap`: ein umbrechender Vereinsname ist besser als ein
                            abgeschnittener. */}
                        <Typography variant="h3" textAlign="center" sx={listFont('h3')}>
                            {announcementLabel(next.match, next.firstTeam)}
                        </Typography>
                    </>
                )}
            </Stack>
        )
    }

    /**
     * Zentrale Botschaft ohne Countdown (kein Lauf, vorbereitet, fertig, abgebrochen, angehalten).
     * `extra` hängt einen freien Block darunter — genutzt für die Ankündigung des nächsten Laufs.
     */
    const bigMessage = (text: string, entries?: TimingSequenceEntryDto[], extra?: ReactNode) => (
        <Stack spacing={4} alignItems="center" sx={{width: 1, minHeight: 0}}>
            {/* Auf Telefon-Breite kleiner, sonst bricht schon „Keine laufende Startsequenz"
                unschön mehrzeilig um. Diese Zeile ist bewusst NICHT skalierbar: sie sagt, in
                welchem Zustand die Anlage ist, und muss auf jedem Gerät in eine Zeile passen —
                die Größenfaktoren gehören der Uhr, dem Countdown und den Bootslisten. */}
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
                            sx={[
                                listFont('h5'),
                                {
                                    py: 1,
                                    textDecoration:
                                        entry.status === 'SKIPPED' ? 'line-through' : undefined,
                                    color: entry.status === 'SKIPPED' ? 'text.disabled' : undefined,
                                },
                            ]}>
                            {/* Die laufende Nummer steckt jetzt in `label` und erscheint nur mit
                                eingeschaltetem `showPosition`: fest vorangestellt doppelte sie
                                die Startnummer, die die Beschriftung ohnehin schon trägt. */}
                            {label(entry)}
                        </Typography>
                    ))}
                </Stack>
            )}
            {extra}
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
                clockScale={display.clockScale}
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
            {station !== undefined && station.type !== 'START' && station.type !== 'ANZEIGE' && (
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
                {/* Ohne Sequenz stand hier bis zum 24.08.2026 nur ein Satz und sonst nichts —
                    zwischen zwei Läufen also minutenlang eine leere Fläche. Jetzt trägt der
                    Zustand oben weiterhin die Aussage, dass nichts läuft, und darunter steht,
                    welcher Lauf als Nächstes kommt und wer ihn eröffnet. */}
                {/* Der Fehlstart überstimmt JEDEN anderen Zustand. Fachlich verlangt: „In diesem
                    Fall blinkt die Athletenanzeige deutlich rot und es steht ‚Fehlstart' sichtbar
                    da." Ein Rückruf bricht die Sequenz ab, die Anzeige stünde also sonst auf der
                    stillen Zusammenfassung „Startsequenz abgebrochen" — genau die Botschaft, die
                    ein zurückgerufenes Feld NICHT braucht. Deshalb steht dieser Zweig vor allen
                    anderen und blendet sie aus. */}
                {falseStartAtMillis !== null ? (
                    <BoardAlarm tone="error" sx={{width: 1, flexGrow: 1, minHeight: 0}}>
                        <Stack
                            spacing={3}
                            alignItems="center"
                            justifyContent="center"
                            sx={{width: 1, minHeight: 0, p: 3}}>
                            <Typography
                                variant="h1"
                                textAlign="center"
                                sx={{
                                    fontWeight: 800,
                                    letterSpacing: '0.02em',
                                    // Deutlich größer als jede andere Botschaft dieses Schirms:
                                    // Der Rückruf muss aus der Entfernung eines Startstegs
                                    // lesbar sein, nicht aus Bildschirmnähe.
                                    fontSize: {xs: '3rem', sm: '5rem', md: '7rem'},
                                }}>
                                {t('timing.startDisplay.falseStart')}
                            </Typography>
                            <Typography variant="h5" textAlign="center" sx={listFont('h5')}>
                                {t('timing.startDisplay.falseStartHint')}
                            </Typography>
                        </Stack>
                    </BoardAlarm>
                ) : (
                    <>
                        {view.kind === 'IDLE' &&
                            bigMessage(
                                t('timing.startDisplay.idle'),
                                undefined,
                                announcement !== undefined
                                    ? announcementBlock(announcement)
                                    : undefined,
                            )}
                        {view.kind === 'ARMED' &&
                            bigMessage(t('timing.startDisplay.armed'), view.entries)}
                        {view.kind === 'FINISHING' &&
                            bigMessage(t('timing.startDisplay.finishing'))}
                        {/* „Die Zusammenfassung kann so lange stehenbleiben, bis der nächste Lauf in
                    Vorbereitung ist." Genau das: die Liste des eben gefahrenen Laufs weicht erst,
                    wenn ein Lauf AUFGERUFEN ist (`inPreparation`) — nicht schon, weil es
                    irgendwo im Tagesablauf noch eine offene Partie gibt, denn die gibt es fast
                    immer, und dann wäre das Ergebnis nie zu lesen. Kein Zeitablauf löst hier
                    etwas ab; der Wechsel hängt allein am Aufruf des nächsten Laufs. */}
                        {view.kind === 'SETTLED' &&
                            bigMessage(
                                view.state === 'DONE'
                                    ? t('timing.startDisplay.done')
                                    : t('timing.startDisplay.aborted'),
                                announcement?.inPreparation === true ? undefined : view.entries,
                                announcement?.inPreparation === true
                                    ? announcementBlock(announcement)
                                    : undefined,
                            )}
                        {/* Angehalten: „Sobald die Sequenz pausiert ist sollte es orange blinken. Erst
                    wenn die Sequenz auf den nächsten Start zurückgesetzt ist dann wieder normal
                    leuchten." Die Hülle ist parametrisiert (siehe `BoardAlarm`), damit der rote
                    Fehlstart-Alarm später danebenpasst, ohne dass hier etwas umgebaut wird.
                    Bewusst OHNE Countdown — das Ziel verrückt beim Fortsetzen um die restliche
                    Pause, eine weiterlaufende Zahl wäre am Start eine gefährliche Lüge. */}
                        {view.kind === 'PAUSED' && (
                            <BoardAlarm tone="warning" sx={{width: 1, flexGrow: 1, minHeight: 0}}>
                                <Stack
                                    spacing={3}
                                    alignItems="center"
                                    justifyContent="center"
                                    sx={{width: 1, minHeight: 0, p: 3}}>
                                    <Typography
                                        variant="h2"
                                        textAlign="center"
                                        sx={{fontSize: {xs: '2rem', sm: '3rem', md: '3.75rem'}}}>
                                        {t('timing.startDisplay.paused')}
                                    </Typography>
                                    <Typography variant="h5" textAlign="center" sx={listFont('h5')}>
                                        {t('timing.startDisplay.pausedHint')}
                                    </Typography>
                                    {view.next !== undefined && (
                                        <Stack spacing={1} alignItems="center" sx={{width: 1}}>
                                            {/* Kein `color="text.secondary"` innerhalb des
                                                Alarms: Die Alarmfläche ist deckend eingefärbt
                                                und vererbt Weiß — eine Theme-Graustufe säße
                                                darauf unlesbar. Zurückgenommen wird die Zeile
                                                stattdessen über die Deckkraft. */}
                                            <Typography
                                                variant="h6"
                                                sx={[listFont('h6'), {opacity: 0.85}]}>
                                                {t('timing.startDisplay.next')}
                                            </Typography>
                                            <Typography
                                                variant="h3"
                                                textAlign="center"
                                                sx={listFont('h3')}>
                                                {label(view.next)}
                                            </Typography>
                                        </Stack>
                                    )}
                                </Stack>
                            </BoardAlarm>
                        )}
                        {view.kind === 'RUNNING' && (
                            <>
                                {view.targetMillis !== undefined && (
                                    <SequenceCountdown
                                        targetMillis={view.targetMillis}
                                        now={clock.now}
                                        tonePlan={tonePlan}
                                        overdueLabel={t('timing.sequence.running.overdue')}
                                        sx={{
                                            // Der eingebaute Ausdruck bleibt stehen und wird nur
                                            // multipliziert: `clamp` hält den Countdown vom Telefon am
                                            // Steg bis zum 27-Zoll-Schirm in einer sinnvollen Größe, eine
                                            // feste Punktgröße wäre auf jedem zweiten Gerät falsch.
                                            fontSize: scaledFontSize(
                                                'clamp(4rem, 24vmin, 18rem)',
                                                display.countdownScale,
                                            ),
                                            lineHeight: 1.1,
                                        }}
                                    />
                                )}
                                <Stack
                                    spacing={1}
                                    alignItems="center"
                                    sx={{width: 1, minHeight: 0}}>
                                    <Typography
                                        variant="h6"
                                        color="text.secondary"
                                        sx={listFont('h6')}>
                                        {t('timing.startDisplay.next')}
                                    </Typography>
                                    <Typography
                                        variant="h3"
                                        textAlign="center"
                                        noWrap
                                        sx={[listFont('h3'), {maxWidth: 1}]}>
                                        {label(view.next)}
                                    </Typography>
                                </Stack>
                                {/* `followingCount` schneidet die Liste ab: auf einem kleinen Schirm ist
                            „nur das aktuelle Boot" (0) die aufgeräumteste Anzeige, bei einem
                            Zeitfahren mit dreißig Booten will niemand alle sehen. Geschnitten
                            wird beim Zeichnen und nicht in der Ableitung, damit `view.following`
                            weiterhin den vollständigen Rest beschreibt. */}
                                {display.followingCount > 0 && view.following.length > 0 && (
                                    <Stack
                                        spacing={1}
                                        sx={{
                                            width: 1,
                                            maxWidth: 640,
                                            minHeight: 0,
                                            overflowY: 'auto',
                                        }}>
                                        <Typography
                                            variant="h6"
                                            color="text.secondary"
                                            textAlign="center"
                                            sx={listFont('h6')}>
                                            {t('timing.startDisplay.following')}
                                        </Typography>
                                        <Stack divider={<Divider />}>
                                            {view.following
                                                .slice(0, display.followingCount)
                                                .map(entry => (
                                                    <Typography
                                                        key={entry.id}
                                                        variant="h5"
                                                        noWrap
                                                        textAlign="center"
                                                        sx={[listFont('h5'), {py: 1}]}>
                                                        {label(entry)}
                                                    </Typography>
                                                ))}
                                        </Stack>
                                    </Stack>
                                )}
                            </>
                        )}
                    </>
                )}
            </Box>
        </Box>
    )
}

export default TimingStartDisplayPage
