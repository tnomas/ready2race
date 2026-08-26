import {Alert, Box, Button, ButtonBase, Chip, CircularProgress, Stack, Typography} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {
    OfficialTimeDto,
    TimingCaptureMode,
    TimingMatchDto,
    TimingPrecision,
} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {assignCapturedMark, CaptureFn} from '@components/timing/useCaptureFlow.ts'
import {expectedFinishMatches, pendingAssignmentMark} from '@utils/timing/matchBoard.ts'
import {
    boatKeyHint,
    boatKeyLayout,
    boatKeyRows,
    cycleFocus,
    finishKeyTarget,
} from '@utils/timing/boardFocus.ts'
import {isTypingContext} from '@utils/timing/shortcutGuards.ts'
import {formatOfficialTime} from '@components/timing/leitstand/format.ts'
import {boatReason} from '@components/timing/leitstand/officialTimeReason.ts'
import {warningTextColor} from '@utils/warningText.ts'
import {ModeChip, ProgressChip, matchTitle} from '@components/timing/matchDisplay.tsx'
import {useTouchOnly} from '@utils/touch.ts'
import {captureAllowed} from '@utils/timing/armed.ts'

/** Uhrzeit einer Marke mit Zehntel — dieselbe Präzision wie in der Markenliste darunter. */
function formatMarkTime(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const tenths = Math.floor(date.getMilliseconds() / 100)
    return `${hh}:${mm}:${ss}.${tenths}`
}

export type MatchCaptureViewProps = {
    eventId: string
    matches: TimingMatchDto[]
    matchesLoading: boolean
    /** Die Marken DIESES Postens (vom Board bereits gefiltert), inkl. optimistischer Einträge. */
    marks: BoardMark[]
    /** Teams mit zugeordneter ACTIVE-Marke an diesem Posten — hier fertig, Knopf gesperrt. */
    finishedTeams: Set<string>
    capture: CaptureFn
    disabled: boolean
    disabledReason?: string
    /** Optimistische Zuordnung des Boards — für das sofortige Abhaken und den Rollback. */
    applyLocalAssignment: (id: string, competitionMatchTeam: string | null) => void
    /** Die fokussierte Partie (aufgelöst über `resolveFinishFocus`) — Ziel aller Tasten. */
    focusedId: string | undefined
    onFocus: (matchId: string) => void
    /** Offizielle Zeiten je Team — live aus `officialTimeChanged`, am Boot angezeigt. */
    officialTimes: Map<string, OfficialTimeDto>
    /** Genauigkeit der Veranstaltung — die Zeit am Boot zeigt genau die Stellen, die am Lauf stehen. */
    precision: TimingPrecision
    /** Betriebsart des Postens: ONETOUCH löst wie bisher sofort aus, ARMED verlangt Scharfschalten. */
    captureMode: TimingCaptureMode
    /** Der Scharf-Zustand, wie ihn das Board gerade für gültig hält (siehe `armed.ts`). */
    armed: boolean
}

/** Das Ziel eines Boots-Tipps: id plus „an diesem Posten schon fertig". */
type BoatTarget = {id: string; finished: boolean}

/**
 * Die eine Ansicht des Zielpostens: die erwarteten Partien mit ihren Booten, jedes Boot ein
 * großer Knopf. Drei gleichwertige Griffe:
 *
 * 1. **Taste ohne Scharfschalten:** die Tasten der Belegung treffen das Boot an dieser Position
 *    der FOKUSSIERTEN Partie (nach Startnummer) — Zeit nehmen und zuordnen in einer Geste. Welche
 *    Tasten das sind, sagt der Zeitnahmetyp des Laufs (`boatKeyLayout`); die Vorgabe bleibt
 *    `1`–`6` und `A`–`F`. Der Fokus ist sichtbar markiert und wandert per Tab (oder Klick); Boote,
 *    die schon im Ziel sind, reagieren nicht auf ihre Taste (kein Doppelstempel — Korrektur über
 *    die Zeitenliste).
 * 2. **Erst stempeln, dann klicken:** die große Erfassungsfläche (oder die Leertaste) nimmt die
 *    Zeit im Moment der Ziellinie; die älteste unzugeordnete Zeit erscheint als Banner und der
 *    nächste Boots-Druck (Tipp ODER Taste) hängt sie an dieses Boot.
 * 3. **Direkt aufs Boot tippen** — der Klick-Weg derselben Geste.
 *
 * Im ARMED-Betrieb sind die Wege 1 und 3 gesperrt, solange der Posten entschärft ist (`armed.ts`):
 * Beide erfassen MIT Zuordnung und hängen eine Falschzeit sofort an ein bestimmtes Boot. Weg 2
 * bleibt offen — die große Fläche bankt ohne Zuordnung und ist der Notausgang für den vergessenen
 * Scharfschalter; das Anhängen einer so gebankten Zeit an ihr Boot bleibt deshalb ebenfalls möglich.
 *
 * Die offizielle Zeit eines Boots erscheint live am Knopf (aus `officialTimeChanged`) — der
 * Bediener sieht sofort, was am Lauf steht.
 */
const MatchCaptureView = ({
    eventId,
    matches,
    matchesLoading,
    marks,
    finishedTeams,
    capture,
    disabled,
    disabledReason,
    applyLocalAssignment,
    focusedId,
    onFocus,
    officialTimes,
    precision,
    captureMode,
    armed,
}: MatchCaptureViewProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    // Reine Touch-Geräte haben gar keine Tastatur: die Tasten-Hinweise an den Booten und die
    // Tastatur-Sätze im Hilfetext entfallen dort — die Tasten-Listener bleiben (schaden nie).
    const touchOnly = useTouchOnly()

    // Die eine Entscheidung, an drei Stellen dieser Datei gebraucht (Boots-Knöpfe, Boots-Tasten,
    // totes Aussehen) — deshalb aus `armed.ts` und nicht dreimal von Hand.
    const allowed = captureAllowed(captureMode, armed)

    /** Bewusst vertagte Zeiten (unbekanntes Boot) — sie drängen sich nicht mehr als Banner auf. */
    const [skippedMarks, setSkippedMarks] = useState<Set<string>>(new Set())
    const pending = pendingAssignmentMark(marks, skippedMarks)
    // Entschärft sind die Boots-Knöpfe tot — außer es wartet eine gebankte Zeit auf ihr Boot: Dann
    // sind sie Zuordnungs-Ziele und keine Erfassungsknöpfe (siehe `handleBoat`). Achtung: Das gilt
    // NUR für den Klick. Die Tasten bleiben in beiden Fällen gesperrt, deshalb hängen ihre Hinweise
    // unten an `allowed` und nicht an dieser Flagge.
    const blocked = !allowed && pending === undefined

    // Die fokussierte Partie erscheint auch ohne Start in der Fläche (Zielzeiten ohne Start).
    const {current, upcoming} = expectedFinishMatches(matches, focusedId)

    const handleBoat = useCallback(
        (team: BoatTarget) => {
            if (disabled || team.finished) return
            if (pending !== undefined) {
                // Zuordnungs-Druck: die wartende Zeit an dieses Boot hängen. Optimistisch, mit
                // Rollback — dasselbe Muster wie der kombinierte Erfassen+Zuordnen-Weg.
                const markId = pending.id
                applyLocalAssignment(markId, team.id)
                void assignCapturedMark(eventId, markId, team.id).then(ok => {
                    if (!ok) {
                        applyLocalAssignment(markId, null)
                        feedback.error(t('timing.assign.error'))
                    }
                })
                return
            }
            // Sperrstelle 1: Entschärft ist genau DAS hier verboten — Zeit nehmen UND sofort an ein
            // bestimmtes Boot hängen. Der Zuordnungs-Weg oben bleibt bewusst offen: Er erzeugt keine
            // Zeit, sondern hängt eine bereits bewusst gebankte an ihr Boot — das ist die zweite
            // Hälfte des Notausgangs und darf nicht mit ins Schloss fallen.
            if (!allowed) return
            // Kein Stempel wartet: Zeit nehmen und sofort zuordnen, eine Geste.
            capture(team.id)
        },
        [disabled, pending, allowed, applyLocalAssignment, eventId, capture, feedback, t],
    )

    // --- Tastatur: die Boots-Tasten auf die fokussierte Partie, Tab wechselt den Fokus --------
    //
    // Im Ref gespiegelt, damit der Listener einmal registriert bleibt statt bei jeder Marken-
    // oder Fokusänderung ab- und wieder angemeldet zu werden (dasselbe Muster wie zuvor im
    // Team-Raster). Der Zeitstempel entsteht im Moment des Drucks — deshalb keydown, nie keyup.
    const focusedMatch = matches.find(match => match.competitionSetupMatch === focusedId)
    // Der Hilfesatz oben nennt die Tasten, die WIRKEN — also die der fokussierten Partie, denn nur
    // auf sie wirken sie überhaupt. Ohne Fokus steht dort die Vorgabebelegung.
    const focusedKeys = boatKeyRows(boatKeyLayout(focusedMatch?.timingMode))
    const handlersRef = useRef({
        focusedMatch,
        currentIds: [] as string[],
        focusedId,
        handleBoat,
        onFocus,
        allowed,
    })
    handlersRef.current = {
        focusedMatch,
        currentIds: current.map(match => match.competitionSetupMatch),
        focusedId,
        handleBoat,
        onFocus,
        allowed,
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ein Kurzbefehl ist ein nackter Tastendruck; alles mit Modifikator gehört dem
            // Browser oder dem System.
            if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
            if (isTypingContext()) return

            const {
                focusedMatch: match,
                currentIds,
                focusedId: focused,
                handleBoat: fire,
                onFocus: focusMatch,
                allowed: mayCapture,
            } = handlersRef.current

            if (event.key === 'Tab') {
                // Fokuswechsel bei mehreren laufenden Partien — mit Umbruch, Shift rückwärts.
                const next = cycleFocus(currentIds, focused, event.shiftKey ? -1 : 1)
                if (next === undefined) return
                event.preventDefault()
                focusMatch(next)
                return
            }

            // Die Belegung der fokussierten Partie — dieselbe, die unten als Hinweis an ihren
            // Booten steht.
            const target = finishKeyTarget(match, event.key, boatKeyLayout(match?.timingMode))
            if (target === undefined) return
            // Sperrstelle 2: Entschärft treffen die Boots-Tasten nichts mehr — weder erfassend noch
            // zuordnend. Genau diese Tasten sind die Unfallfläche, um die es geht: Sie hängen eine
            // Zeit sofort an ein bestimmtes Boot, und ein Ärmel trifft eine Tastatur. Ohne
            // `preventDefault`, damit der Browser eine Taste, die hier nichts mehr tut, wieder
            // normal behandelt.
            if (!mayCapture) return
            event.preventDefault()
            // Ein Boot im Ziel reagiert nicht auf seine Taste — `handleBoat` prüft das über die
            // Startlisten-Flagge, hier kommt zusätzlich der Live-Zustand dieses Postens dazu.
            fire({id: target.teamId, finished: target.finished || finishedTeams.has(target.teamId)})
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
        // `finishedTeams` läuft über das Ref-Spiegelbild nicht mit — bewusst als Abhängigkeit,
        // die Registrierung selbst ist billig und die Menge ändert sich nur je Zieleinlauf.
    }, [finishedTeams])

    const renderMatch = (match: TimingMatchDto, dimmed: boolean) => {
        const teams = [...match.teams].sort((a, b) => a.startNumber - b.startNumber)
        const finishedCount = teams.filter(
            team => team.finished || finishedTeams.has(team.competitionMatchTeam),
        ).length
        const isFocused = match.competitionSetupMatch === focusedId
        // Jede Partie ist per Klick fokussierbar — auch ohne Start: die Tasten und Boots-Knöpfe
        // funktionieren dann normal, die offizielle Zeit rechnet die Übernahme nach, sobald die
        // Startmarke nachgetragen ist (der Chip unten sagt das dem Bediener).
        const focusable = match.progress !== 'FINISHED'
        const startMissing = isFocused && match.progress === 'OPEN'
        // Die Hinweise an den Booten kommen aus derselben Quelle wie die Tastenauswertung oben:
        // dem Zeitnahmetyp DIESER Partie. Zwei Partien nebeneinander dürfen verschiedene
        // Belegungen haben — ein Hinweis aus der falschen wäre ein Versprechen ins Leere.
        const keys = boatKeyLayout(match.timingMode)
        return (
            <Stack
                key={match.competitionSetupMatch}
                spacing={1}
                sx={{
                    opacity: dimmed ? 0.7 : 1,
                    // Deutlich sichtbarer Fokus: die Tasten wirken NUR auf diese Partie.
                    border: 2,
                    borderColor: isFocused ? 'primary.main' : 'transparent',
                    borderRadius: 2,
                    p: isFocused ? 1 : 0,
                }}>
                <ButtonBase
                    onClick={() => {
                        if (focusable) onFocus(match.competitionSetupMatch)
                    }}
                    disabled={!focusable}
                    sx={{justifyContent: 'flex-start', textAlign: 'left', borderRadius: 1}}>
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        flexWrap="wrap"
                        useFlexGap
                        sx={{width: 1}}>
                        <Typography variant="subtitle1" sx={{fontWeight: 600, flexGrow: 1}}>
                            {matchTitle(match)}
                        </Typography>
                        {isFocused && (
                            <Typography variant="caption" color="primary" sx={{fontWeight: 700}}>
                                {t('timing.finish.focused')}
                            </Typography>
                        )}
                        <ModeChip mode={match.timingMode} />
                        <ProgressChip progress={match.progress} />
                        {startMissing && (
                            // Zielzeiten ohne Start: Erfassen geht, das Ergebnis rechnet die
                            // Übernahme erst, wenn die Startmarke nachgetragen ist.
                            <Chip
                                size="small"
                                color="warning"
                                label={t('timing.finish.startMissing')}
                            />
                        )}
                        <Typography variant="caption" color="text.secondary">
                            {t('timing.finish.finishedCount', {
                                finished: finishedCount,
                                total: teams.length,
                            })}
                        </Typography>
                    </Stack>
                </ButtonBase>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: 1,
                    }}>
                    {teams.map((team, position) => {
                        const done =
                            team.finished || finishedTeams.has(team.competitionMatchTeam)
                        // Fertig oder gesperrt sieht gleich aus: nicht anfassbar. Der Unterschied
                        // steht im Warnbalken darüber, nicht in sechzehn kleinen Knöpfen.
                        const dead = done || blocked
                        // Der Hinweis hängt an `allowed`, NICHT an `dead`: Wartet entschärft eine
                        // gebankte Zeit auf ihr Boot, lebt der Knopf als Zuordnungs-Ziel wieder auf
                        // — die Boots-Tasten bleiben aber gesperrt. Ein „3/C" an einem Boot,
                        // dessen Taste nichts tut, schickt den Bediener unter Zeitdruck ins Leere.
                        const hint =
                            isFocused && !touchOnly && allowed
                                ? boatKeyHint(keys, position)
                                : undefined
                        const official = officialTimes.get(team.competitionMatchTeam)
                        const officialLabel =
                            official === undefined
                                ? undefined
                                : official.resultStatus !== 'NONE'
                                  ? official.resultStatus
                                  : official.effectiveMillis !== undefined
                                    ? formatOfficialTime(official.effectiveMillis, precision)
                                    : undefined
                        // Zeilen-Ebene zum „Start fehlt"-Chip der Partie: WELCHES Boot eine
                        // Zielzeit ohne Start (oder verdrehte Marken) hat, statt leerer Stelle.
                        const reason = officialLabel === undefined ? boatReason(official) : null
                        return (
                            <ButtonBase
                                key={team.competitionMatchTeam}
                                // Wie bisher: der Zeitstempel gehört auf den physischen Druck,
                                // nicht auf das Loslassen.
                                onPointerDown={() =>
                                    handleBoat({id: team.competitionMatchTeam, finished: done})
                                }
                                onClick={event => event.preventDefault()}
                                disabled={dead || disabled}
                                focusRipple
                                sx={{
                                    borderRadius: 2,
                                    p: 1,
                                    minHeight: 72,
                                    border: 2,
                                    // Wartet eine Zeit auf ihre Zuordnung, sind die Boote die
                                    // Zuordnungs-Ziele — sichtbar durch die Zielfarbe.
                                    borderColor:
                                        pending !== undefined && !done
                                            ? 'info.main'
                                            : 'divider',
                                    bgcolor: dead
                                        ? 'action.disabledBackground'
                                        : 'background.paper',
                                    color: dead ? 'text.disabled' : 'text.primary',
                                    // Gesperrt noch blasser als „fertig": Aus drei Metern muss ein
                                    // toter Knopf tot aussehen, nicht bloß etwas matter.
                                    opacity: blocked && !done ? 0.4 : done ? 0.6 : 1,
                                    textAlign: 'left',
                                    '&:active': dead
                                        ? undefined
                                        : {bgcolor: 'action.selected'},
                                }}>
                                <Stack sx={{width: 1, minWidth: 0}} spacing={0.25}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Typography variant="h6" sx={{fontWeight: 700}}>
                                            #{team.startNumber}
                                        </Typography>
                                        {hint !== undefined && !dead && (
                                            <Box
                                                component="span"
                                                sx={{
                                                    border: 1,
                                                    borderColor: 'primary.main',
                                                    color: 'primary.main',
                                                    borderRadius: 1,
                                                    px: 0.5,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                                    fontFamily: 'monospace',
                                                }}>
                                                {hint}
                                            </Box>
                                        )}
                                        <Box sx={{flexGrow: 1}} />
                                        {done && (
                                            <CheckCircleIcon
                                                color="success"
                                                fontSize="small"
                                            />
                                        )}
                                    </Stack>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                        {team.teamName ?? team.clubName ?? ''}
                                    </Typography>
                                    {officialLabel !== undefined && (
                                        <Typography
                                            variant="body2"
                                            sx={{
                                                fontFamily: 'monospace',
                                                fontVariantNumeric: 'tabular-nums',
                                                color: dead ? 'text.disabled' : 'success.main',
                                            }}>
                                            {officialLabel}
                                        </Typography>
                                    )}
                                    {reason !== null && (
                                        // warningTextColor: die Palette-Warnfarbe wäre auf dem
                                        // hellen Knopf kaum lesbar.
                                        <Typography
                                            variant="caption"
                                            sx={theme => ({
                                                color: dead
                                                    ? 'text.disabled'
                                                    : warningTextColor(theme),
                                                fontWeight: 600,
                                            })}>
                                            {t(`timing.officialTime.reason.${reason}`)}
                                        </Typography>
                                    )}
                                </Stack>
                            </ButtonBase>
                        )
                    })}
                </Box>
            </Stack>
        )
    }

    return (
        <Stack sx={{width: 1, minHeight: 0, flexGrow: 1}} spacing={1.5}>
            {pending !== undefined ? (
                <Alert
                    severity="info"
                    sx={{flexShrink: 0}}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            onClick={() =>
                                setSkippedMarks(prev => new Set(prev).add(pending.id))
                            }>
                            {t('timing.finish.assignLater')}
                        </Button>
                    }>
                    {t('timing.finish.assignPrompt', {
                        time: formatMarkTime(pending.timestampMillis),
                    })}
                </Alert>
            ) : allowed ? (
                <Typography variant="caption" color="text.secondary" sx={{flexShrink: 0}}>
                    {touchOnly
                        ? t('timing.finish.hintTouch')
                        : current.length > 1
                          ? `${t('timing.finish.hint', {keys: focusedKeys})} ${t('timing.finish.focusHint')}`
                          : t('timing.finish.hint', {keys: focusedKeys})}
                </Typography>
            ) : null}

            <Box sx={{flexGrow: 1, minHeight: 0, overflowY: 'auto'}}>
                <Stack spacing={2.5}>
                    {matchesLoading && matches.length === 0 && (
                        <Stack alignItems="center" sx={{py: 4}}>
                            <CircularProgress />
                        </Stack>
                    )}
                    {current.map(match => renderMatch(match, false))}
                    {current.length === 0 && upcoming !== undefined && (
                        <Stack spacing={1}>
                            <Typography variant="caption" color="text.secondary">
                                {t('timing.finish.upcomingTitle')}
                            </Typography>
                            {renderMatch(upcoming, true)}
                        </Stack>
                    )}
                    {!matchesLoading && current.length === 0 && upcoming === undefined && (
                        <Typography variant="body2" color="text.secondary" sx={{py: 2}}>
                            {t('timing.finish.noneExpected')}
                        </Typography>
                    )}
                </Stack>
            </Box>

            {disabled && disabledReason !== undefined && (
                <Typography variant="body2" color="error" textAlign="center" sx={{flexShrink: 0}}>
                    {disabledReason}
                </Typography>
            )}
        </Stack>
    )
}

export default MatchCaptureView
