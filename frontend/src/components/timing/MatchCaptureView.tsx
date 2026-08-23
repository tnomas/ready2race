import {Alert, Box, Button, ButtonBase, Chip, CircularProgress, Stack, Typography} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import {useCallback, useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {OfficialTimeDto, TimingMatchDto} from '@api/types.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {BoardMark} from '@components/timing/useTimingBoardState.ts'
import {assignCapturedMark, CaptureFn} from '@components/timing/useCaptureFlow.ts'
import {expectedFinishMatches, pendingAssignmentMark} from '@utils/timing/matchBoard.ts'
import {cycleFocus, finishKeyTarget} from '@utils/timing/boardFocus.ts'
import {isTypingContext} from '@utils/timing/shortcutGuards.ts'
import {formatDuration} from '@components/timing/leitstand/format.ts'
import {ModeChip, ProgressChip, matchTitle} from '@components/timing/matchDisplay.tsx'

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
}

/** Das Ziel eines Boots-Tipps: id plus „an diesem Posten schon fertig". */
type BoatTarget = {id: string; finished: boolean}

/** Der sichtbare Tasten-Hinweis eines Boots: Position 0 → „1/A", Position 5 → „6/F". */
function keyHint(position: number): string | undefined {
    if (position > 5) return undefined
    return `${position + 1}/${String.fromCharCode('A'.charCodeAt(0) + position)}`
}

/**
 * Die eine Ansicht des Zielpostens: die erwarteten Partien mit ihren Booten, jedes Boot ein
 * großer Knopf. Drei gleichwertige Griffe:
 *
 * 1. **Taste ohne Scharfschalten:** Ziffern 1–6 und Buchstaben A–F treffen das Boot an dieser
 *    Position der FOKUSSIERTEN Partie (nach Startnummer) — Zeit nehmen und zuordnen in einer
 *    Geste. Der Fokus ist sichtbar markiert und wandert per Tab (oder Klick); Boote, die schon
 *    im Ziel sind, reagieren nicht auf ihre Taste (kein Doppelstempel — Korrektur über die
 *    Zeitenliste).
 * 2. **Erst stempeln, dann klicken:** die große Erfassungsfläche (oder die Leertaste) nimmt die
 *    Zeit im Moment der Ziellinie; die älteste unzugeordnete Zeit erscheint als Banner und der
 *    nächste Boots-Druck (Tipp ODER Taste) hängt sie an dieses Boot.
 * 3. **Direkt aufs Boot tippen** — der Klick-Weg derselben Geste.
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
}: MatchCaptureViewProps) => {
    const {t} = useTranslation()
    const feedback = useFeedback()

    /** Bewusst vertagte Zeiten (unbekanntes Boot) — sie drängen sich nicht mehr als Banner auf. */
    const [skippedMarks, setSkippedMarks] = useState<Set<string>>(new Set())
    const pending = pendingAssignmentMark(marks, skippedMarks)

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
            // Kein Stempel wartet: Zeit nehmen und sofort zuordnen, eine Geste.
            capture(team.id)
        },
        [disabled, pending, applyLocalAssignment, eventId, capture, feedback, t],
    )

    // --- Tastatur: 1–6 / A–F auf die fokussierte Partie, Tab wechselt den Fokus ---------------
    //
    // Im Ref gespiegelt, damit der Listener einmal registriert bleibt statt bei jeder Marken-
    // oder Fokusänderung ab- und wieder angemeldet zu werden (dasselbe Muster wie zuvor im
    // Team-Raster). Der Zeitstempel entsteht im Moment des Drucks — deshalb keydown, nie keyup.
    const focusedMatch = matches.find(match => match.competitionSetupMatch === focusedId)
    const handlersRef = useRef({focusedMatch, currentIds: [] as string[], focusedId, handleBoat, onFocus})
    handlersRef.current = {
        focusedMatch,
        currentIds: current.map(match => match.competitionSetupMatch),
        focusedId,
        handleBoat,
        onFocus,
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Ein Kurzbefehl ist ein nackter Tastendruck; alles mit Modifikator gehört dem
            // Browser oder dem System.
            if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
            if (isTypingContext()) return

            const {focusedMatch: match, currentIds, focusedId: focused, handleBoat: fire, onFocus: focusMatch} =
                handlersRef.current

            if (event.key === 'Tab') {
                // Fokuswechsel bei mehreren laufenden Partien — mit Umbruch, Shift rückwärts.
                const next = cycleFocus(currentIds, focused, event.shiftKey ? -1 : 1)
                if (next === undefined) return
                event.preventDefault()
                focusMatch(next)
                return
            }

            const target = finishKeyTarget(match, event.key)
            if (target === undefined) return
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
                        const hint = isFocused ? keyHint(position) : undefined
                        const official = officialTimes.get(team.competitionMatchTeam)
                        const officialLabel =
                            official === undefined
                                ? undefined
                                : official.resultStatus !== 'NONE'
                                  ? official.resultStatus
                                  : official.effectiveMillis !== undefined
                                    ? formatDuration(official.effectiveMillis)
                                    : undefined
                        return (
                            <ButtonBase
                                key={team.competitionMatchTeam}
                                // Wie bisher: der Zeitstempel gehört auf den physischen Druck,
                                // nicht auf das Loslassen.
                                onPointerDown={() =>
                                    handleBoat({id: team.competitionMatchTeam, finished: done})
                                }
                                onClick={event => event.preventDefault()}
                                disabled={done || disabled}
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
                                    bgcolor: done
                                        ? 'action.disabledBackground'
                                        : 'background.paper',
                                    color: done ? 'text.disabled' : 'text.primary',
                                    opacity: done ? 0.6 : 1,
                                    textAlign: 'left',
                                    '&:active': done
                                        ? undefined
                                        : {bgcolor: 'action.selected'},
                                }}>
                                <Stack sx={{width: 1, minWidth: 0}} spacing={0.25}>
                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                        <Typography variant="h6" sx={{fontWeight: 700}}>
                                            #{team.startNumber}
                                        </Typography>
                                        {hint !== undefined && !done && (
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
                                                color: done ? 'text.disabled' : 'success.main',
                                            }}>
                                            {officialLabel}
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
            ) : (
                <Typography variant="caption" color="text.secondary" sx={{flexShrink: 0}}>
                    {current.length > 1
                        ? `${t('timing.finish.hint')} ${t('timing.finish.focusHint')}`
                        : t('timing.finish.hint')}
                </Typography>
            )}

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
