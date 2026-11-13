import {CompetitionMatchDto, CompetitionRoundDto} from '@api/types.gen.ts'
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Chip,
    Stack,
    Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Substitutions from '@components/event/competition/excecution/Substitutions.tsx'
import LoadingButton from '@components/form/LoadingButton.tsx'
import {useTranslation} from 'react-i18next'
import {useFeedback} from '@utils/hooks.ts'
import {Dispatch, Fragment, SetStateAction, SyntheticEvent, useRef, useState} from 'react'
import {
    clearMatchClarification,
    deleteCurrentCompetitionExecutionRound,
    finishMatchFromExecution,
    markMatchStartedFromExecution,
    reopenMatch,
    resetMatch,
    setMatchClarification,
    skipScheduleRound,
    updateMatchActivation,
    updateMatchByeMustRace,
} from '@api/sdk.gen.ts'
import {matchErrorText} from '@components/event/competition/excecution/executionError.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {
    CompetitionScopeProps,
    useCompetitionScope,
} from '@components/event/competition/excecution/competitionScope.ts'
import {roundHasNothingToRace} from '@components/event/competition/excecution/roundCancellation.ts'
import {matchesOnDisplay} from '@components/event/competition/excecution/roundDeletion.ts'
import {byeMatches} from '@components/event/competition/excecution/byeMatches.ts'
import {roundSkipErrorText} from '@components/event/schedule/scheduleError.ts'
import {ExecutionTimingSystem} from './matchResultOptions.ts'
import {roundCounterChips} from '@components/event/match/matchStatusChip.ts'
import StatusChip from '@components/event/match/StatusChip.tsx'
import {useNow} from '@components/event/match/useNow.ts'
import ClarificationDialog from '@components/event/liveDashboard/ClarificationDialog.tsx'
import {liveDashboardErrorKey} from '@components/event/liveDashboard/liveDashboardError.ts'
import {SectionHeader} from '@components/ui'
import {isRequestNetworkError, runRequest} from '@utils/request.ts'
import ExecutionMatchCard, {MatchCardAction} from './ExecutionMatchCard.tsx'
import ExecutionByeTable from './ExecutionByeTable.tsx'
import ExecutionMoreMenu, {ExecutionMoreMenuItem} from './ExecutionMoreMenu.tsx'

// Bestehende Importstelle (CompetitionExecution) bleibt gültig.
// eslint-disable-next-line react-refresh/only-export-components
export {executionMatchDomId} from './executionMatchDomId.ts'

type Props = CompetitionScopeProps & {
    round: CompetitionRoundDto
    roundIndex: number
    /** Kurz hervorgehobener Lauf nach dem Sprung aus dem Zeitplan (Veranstaltungs-Modus). */
    highlightedMatchId?: string | null
    filteredMatches: CompetitionMatchDto[]
    reloadRoundDto: () => void
    setSubmitting: (value: boolean) => void
    submitting: boolean
    openResultsDialog: (matchIndex: number) => void
    openEditMatchDialog: (roundIndex: number, matchIndex: number) => void
    accordionsExpanded: boolean[] | undefined
    handleAccordionExpandedChange: (accordionIndex: number, isExpanded: boolean) => void
    smallScreenLayout: boolean
    setResultImportMatch: Dispatch<SetStateAction<string | null>>
    /** Notfallweg: eine heruntergeladene RaceClocker-Ergebnis-xlsx auf den Lauf schreiben. */
    handleUploadRaceClockerFile: (competitionMatchId: string, file: File) => Promise<void>
    pullRaceClockerResults: (competitionMatchId: string) => Promise<void>
    resumeRaceClockerAutoPull: (competitionMatchId: string) => Promise<void>
    handleDownloadStartListPDF: (competitionMatchId: string) => Promise<void>
    handleDownloadStartListCSV: (competitionMatchId: string) => Promise<void>
    /** Die ganze Runde als eine CSV (eine Kopfzeile, Wellen über die Wellenname-Spalte). */
    handleDownloadRoundStartList: (setupRoundId: string) => Promise<void>
    /**
     * Das Zeitnahme-System der Veranstaltung — es gilt für alle ihre Wettkämpfe. Daran hängt unter
     * anderem der Knopf „Automatik wieder aufnehmen".
     */
    timingSystem: ExecutionTimingSystem
}

/** Kompakte Akkordeon-Kopfzeile: Titel plus Zähler, ohne die volle Höhe eines Abschnitts. */
const compactSummarySx = {
    minHeight: 40,
    '& .MuiAccordionSummary-content': {my: 0.75, alignItems: 'center', gap: 1},
} as const

const CompetitionExecutionRound = ({
    eventId: eventIdProp,
    competitionId: competitionIdProp,
    round,
    roundIndex,
    highlightedMatchId,
    filteredMatches,
    submitting,
    smallScreenLayout,
    setResultImportMatch,
    handleUploadRaceClockerFile,
    pullRaceClockerResults,
    resumeRaceClockerAutoPull,
    handleDownloadStartListPDF,
    handleDownloadStartListCSV,
    handleDownloadRoundStartList,
    timingSystem,
    ...props
}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const now = useNow()

    // Nur in der jüngsten Runde (Index 0 der absteigend sortierten Runden) lassen sich Ergebnisse
    // eintragen, Läufe zurücksetzen und die Runde löschen.
    const isCurrentRound = roundIndex === 0

    // Trägt die Lauf-Id, für die der Klärungs-Dialog gerade offen ist — derselbe Dialog wie im
    // Schiedsrichter-Dashboard (siehe LiveDashboardPage.tsx), hier fürs Regattabüro.
    const [clarifyingMatchId, setClarifyingMatchId] = useState<string | null>(null)

    // Versteckter Datei-Wähler für den RaceClocker-Notfall-Import: der Menüpunkt merkt sich den
    // Lauf und klickt den Input; erst die Auswahl löst den Upload aus.
    const raceClockerFileInputRef = useRef<HTMLInputElement>(null)
    const raceClockerFileMatchId = useRef<string | null>(null)

    // Die Zählerleiste fasst zusammen, was die Chips darunter einzeln sagen — bei einer einzigen
    // Lauf-Karte wäre das bloße Wiederholung, deshalb bleibt sie dort leer (siehe roundCounterChips).
    const counterChips = roundCounterChips(filteredMatches.map(match => match.status))

    // Die Freilose der Runde — dieselbe Frage wie überall sonst, gestellt an `status.bye`.
    const byes = byeMatches(round)

    const {eventId, competitionId} = useCompetitionScope({
        eventId: eventIdProp,
        competitionId: competitionIdProp,
    })

    const {confirmAction} = useConfirmation()

    // Wie viele Läufe dieser Runde draußen schon zu sehen sind. Löschen bleibt erlaubt — das
    // Regattabüro muss auch eine gefahrene Runde zurücknehmen können —, aber es soll wissen, dass
    // es damit etwas wegräumt, das am Steg oder in den Ergebnissen bereits jemand gesehen hat.
    const onDisplay = matchesOnDisplay(round.matches)

    /**
     * Schreibaufruf mit seitenweiter Sperre. `runRequest` gibt die Sperre auch bei einem Netzfehler
     * wieder frei — vorher legte ein einziger Paketverlust am Steg die ganze Durchführung lahm.
     */
    const send = <T, E>(request: () => Promise<{data?: T; error?: E}>) =>
        runRequest(props.setSubmitting, request)

    const networkFeedback = () => feedback.error(t('common.error.network'))

    const deleteCurrentRound = () => {
        confirmAction(
            async () => {
                const {error} = await send(() =>
                    deleteCurrentCompetitionExecutionRound({
                        path: {eventId, competitionId},
                    }),
                )
                if (isRequestNetworkError(error)) {
                    networkFeedback()
                } else if (error) {
                    feedback.error(t('event.competition.execution.deleteRound.error'))
                } else {
                    feedback.success(t('event.competition.execution.deleteRound.success'))
                }
                props.reloadRoundDto()
            },
            {
                // Gewarnt wird über `round.matches` und nicht über `filteredMatches`: Gelöscht wird
                // die ganze Runde, nicht der gerade angezeigte Ausschnitt.
                content: onDisplay
                    ? t('event.competition.execution.deleteRound.confirmation.onDisplay', {
                          count: onDisplay,
                      })
                    : t('event.competition.execution.deleteRound.confirmation.content'),
                okText: t('common.delete'),
                destructive: true,
            },
        )
    }

    // Runde entfällt (Wettkampf → Durchführung, verschoben aus dem Zeitplan): nur anbieten, wenn es
    // in der Runde nichts zu fahren gibt (siehe roundHasNothingToRace) - sonst müssen die Läufe
    // ausgetragen werden, damit die nächste Runde sauber ausgelost werden kann. Ruft denselben
    // Endpunkt wie der frühere Zeitplan-Button (skipScheduleRound); der Server prüft die Regel
    // ohnehin noch einmal serverseitig (EventScheduleService.setRoundSkipped).
    const cancelRound = () => {
        confirmAction(
            async () => {
                const {error} = await send(() =>
                    skipScheduleRound({
                        path: {eventId, setupRoundId: round.setupRoundId},
                    }),
                )
                if (isRequestNetworkError(error)) {
                    networkFeedback()
                } else if (error) {
                    // "Runde noch nicht gesetzt" und "in der Runde ist noch zu fahren" verlangen
                    // Gegensätzliches; bis zuletzt lasen beide denselben Satz.
                    const {key, values} = roundSkipErrorText(error)
                    feedback.error(t(key, values))
                } else {
                    feedback.success(t('event.competition.execution.cancelRound.success'))
                }
                props.reloadRoundDto()
            },
            {
                content: t('event.competition.execution.cancelRound.confirmation.content', {
                    round: round.name,
                }),
                okText: t('event.competition.execution.cancelRound.confirmation.ok'),
            },
        )
    }

    const handleAccordionExpandedChange =
        (accordionIndex: number) => (_: SyntheticEvent, isExpanded: boolean) => {
            props.handleAccordionExpandedChange(accordionIndex, isExpanded)
        }

    /** Ist-Start aus dem Büro — idempotent, aktiviert nebenbei (siehe Backend-KDoc). */
    const handleMarkStarted = async (match: CompetitionMatchDto) => {
        const {error} = await send(() =>
            markMatchStartedFromExecution({
                path: {eventId, competitionId, competitionMatchId: match.id},
            }),
        )
        if (isRequestNetworkError(error)) {
            networkFeedback()
        } else if (error) {
            feedback.error(t('event.competition.execution.running.error.update'))
        } else {
            feedback.success(t('event.competition.execution.running.success'))
            props.reloadRoundDto()
        }
    }

    /**
     * Lauf beenden — vom Büro aus in JEDEM chainProgressionMode erlaubt, wie der Zeitplan-Weg
     * und anders als das Schiedsrichter-Dashboard, das im REGATTABUERO-Modus sperrt. Bis zum
     * 12.08.2026 fehlte der Knopf hier ganz: Im SCHIEDSRICHTER-Modus konnte das Büro einen Lauf
     * ohne verknüpften Zeitplan-Slot nirgends beenden, obwohl der Hinweistext der Einstellung
     * genau das verspricht (Nutzer-Feedback aus dem Veranstaltungs-Modus). Mit Bestätigung wie
     * am Zeitplan: Beenden schaltet ggf. die Kette weiter, das soll kein Verklicker auslösen.
     */
    const handleFinishMatch = (match: CompetitionMatchDto) => {
        confirmAction(
            async () => {
                const {error} = await send(() =>
                    finishMatchFromExecution({
                        path: {eventId, competitionId, competitionMatchId: match.id},
                    }),
                )
                if (isRequestNetworkError(error)) {
                    networkFeedback()
                } else if (error) {
                    feedback.error(t('common.error.unexpected'))
                } else {
                    feedback.success(t('event.competition.execution.match.control.finishSuccess'))
                }
                props.reloadRoundDto()
            },
            {
                content: t('event.competition.execution.match.control.finishConfirm'),
                okText: t('event.competition.execution.match.control.finish'),
            },
        )
    }

    /**
     * Klärung aufheben — der Rückweg zu „In Klärung". Ohne Bestätigung, anders als Beenden und
     * Zurücksetzen: Aufheben stellt nur den Zustand wieder her, den der Lauf vorher hatte (in aller
     * Regel „Läuft"), und ein Verklicker kostet einen zweiten Griff zu „In Klärung". Die
     * seitenweite Sperre verhindert, dass ein Doppelklick zwei DELETEs schickt.
     */
    const handleResolveClarification = async (match: CompetitionMatchDto) => {
        const {error} = await send(() =>
            clearMatchClarification({
                path: {eventId, matchId: match.id},
            }),
        )
        if (isRequestNetworkError(error)) {
            networkFeedback()
        } else if (error) {
            feedback.error(t('event.liveDashboard.control.error'))
        }
        props.reloadRoundDto()
    }

    /**
     * Lauf zurücksetzen: leert den Ausführungszustand (Ist-Start, Zeiten, Plätze, Rundenzeiten),
     * behält aber Aufstellung, Bahnen und die Kennungen der Boote — die RaceClocker-Zuordnung
     * bleibt gültig. Nur in der jüngsten Runde; hat die Folgerunde schon Läufe, lehnt der Server
     * mit einem eigenen Fehlercode ab (siehe executionError.ts).
     */
    const handleResetMatch = (match: CompetitionMatchDto) => {
        confirmAction(
            async () => {
                const {error} = await send(() =>
                    resetMatch({
                        path: {eventId, competitionId, competitionMatchId: match.id},
                    }),
                )
                if (isRequestNetworkError(error)) {
                    networkFeedback()
                } else if (error) {
                    const text = matchErrorText(error)
                    feedback.error(
                        text === undefined
                            ? t('event.competition.execution.resetMatch.error')
                            : t(text.key, text.values),
                    )
                } else {
                    feedback.success(t('event.competition.execution.resetMatch.success'))
                }
                props.reloadRoundDto()
            },
            {
                title: t('event.competition.execution.resetMatch.confirmation.title'),
                content: (
                    <Stack spacing={2}>
                        <Typography color={'error.main'} sx={{fontWeight: 'bold'}}>
                            {t('event.competition.execution.resetMatch.confirmation.warning')}
                        </Typography>
                        <Typography>
                            {t('event.competition.execution.resetMatch.confirmation.keeps')}
                        </Typography>
                        {/* Nur bei RaceClocker-Zeitnahme: Der Reset pausiert den automatischen
                            Abruf, sonst spielte der nächste Takt die gelöschten Ergebnisse sofort
                            wieder ein - fortgesetzt wird bewusst über den bestehenden Knopf. */}
                        {timingSystem === 'RACECLOCKER' && (
                            <Typography>
                                {t('event.competition.execution.resetMatch.confirmation.autoPull')}
                            </Typography>
                        )}
                        <Typography sx={{fontWeight: 'bold'}}>
                            {t('event.competition.execution.resetMatch.confirmation.question')}
                        </Typography>
                    </Stack>
                ),
                okText: t('event.competition.execution.resetMatch.action'),
                destructive: true,
            },
        )
    }

    /** Beenden zurücknehmen — nur in der jüngsten Runde, der Server prüft das nochmal. */
    const handleReopen = async (match: CompetitionMatchDto) => {
        const {error} = await send(() =>
            reopenMatch({
                path: {eventId, competitionId, competitionMatchId: match.id},
            }),
        )
        if (isRequestNetworkError(error)) {
            networkFeedback()
        } else if (error) {
            feedback.error(t('event.competition.execution.running.error.update'))
        } else {
            feedback.success(t('event.competition.execution.running.success'))
            props.reloadRoundDto()
        }
    }

    /**
     * Freilos "muss gefahren werden": Der Lauf wird operativ zum echten Rennen (Startliste,
     * Zeitnahme, Beenden), das Weiterkommen bleibt Freilos-Semantik - Server-KDoc
     * `updateByeMustRace`.
     */
    const handleToggleByeMustRace = async (match: CompetitionMatchDto, mustRace: boolean) => {
        const {error} = await send(() =>
            updateMatchByeMustRace({
                path: {eventId, competitionId, competitionMatchId: match.id},
                body: {mustRace},
            }),
        )
        if (isRequestNetworkError(error)) {
            networkFeedback()
        } else if (error) {
            feedback.error(t('common.error.unexpected'))
        } else {
            feedback.success(t('event.competition.execution.byeMustRace.success'))
            props.reloadRoundDto()
        }
    }

    /**
     * Ruft den Lauf an den Start oder nimmt das zurück. Setzt `activated_at`; der Ist-Start kommt
     * aus der Zeitnahme, aus „Läuft" hier oder aus dem Schiedsrichter-Dashboard.
     */
    const handleToggleActivation = async (match: CompetitionMatchDto) => {
        const hasPlacesSet = match.teams.some(
            team => team.place !== null && team.place !== undefined,
        )
        if (hasPlacesSet) {
            feedback.error(t('event.competition.execution.running.error.hasPlaces'))
            return
        }

        const {error} = await send(() =>
            updateMatchActivation({
                path: {eventId, competitionId, competitionMatchId: match.id},
                body: {activated: match.activatedAt == null},
            }),
        )
        if (isRequestNetworkError(error)) {
            networkFeedback()
        } else if (error) {
            feedback.error(t('event.competition.execution.running.error.update'))
        } else {
            feedback.success(t('event.competition.execution.running.success'))
            props.reloadRoundDto()
        }
    }

    /** Verteilt die Wahl auf einer Lauf-Karte (Knopf oder Menüeintrag) an den passenden Handler. */
    const handleCardAction =
        (match: CompetitionMatchDto, matchIndex: number) => (action: MatchCardAction) => {
            switch (action) {
                case 'resolveClarification':
                    void handleResolveClarification(match)
                    break
                case 'enterResults':
                    props.openResultsDialog(matchIndex)
                    break
                case 'activate':
                case 'deactivate':
                    void handleToggleActivation(match)
                    break
                case 'markStarted':
                    void handleMarkStarted(match)
                    break
                case 'finish':
                    handleFinishMatch(match)
                    break
                case 'editMatch':
                    props.openEditMatchDialog(roundIndex, matchIndex)
                    break
                case 'resultsXls':
                    setResultImportMatch(match.id)
                    break
                case 'resultsRaceClocker':
                    void pullRaceClockerResults(match.id)
                    break
                case 'resultsRaceClockerFile':
                    raceClockerFileMatchId.current = match.id
                    raceClockerFileInputRef.current?.click()
                    break
                case 'startListPdf':
                    void handleDownloadStartListPDF(match.id)
                    break
                case 'startListCsv':
                    void handleDownloadStartListCSV(match.id)
                    break
                case 'setClarification':
                    setClarifyingMatchId(match.id)
                    break
                case 'reopen':
                    void handleReopen(match)
                    break
                case 'reset':
                    handleResetMatch(match)
                    break
            }
        }

    const roundMenuItems: ExecutionMoreMenuItem[] = isCurrentRound
        ? [
              ...(roundHasNothingToRace(round.matches)
                  ? [
                        {
                            id: 'cancelRound',
                            label: t('event.competition.execution.cancelRound.action'),
                            onSelect: cancelRound,
                        },
                    ]
                  : []),
              {
                  id: 'deleteRound',
                  label: t('event.competition.execution.deleteRound.delete'),
                  onSelect: deleteCurrentRound,
                  destructive: true,
              },
          ]
        : []

    const accordionBaseId = `round-${roundIndex}-${round.name}`

    return (
        <Fragment>
            <Box
                component={'section'}
                sx={{
                    borderLeft: 2,
                    borderColor: 'primary.main',
                    pl: {xs: 1.5, md: 3},
                    py: 1,
                }}>
                <SectionHeader
                    title={round.name}
                    description={
                        round.required ? t('event.competition.setup.round.required') : undefined
                    }
                    actions={
                        (filteredMatches.length > 0 || roundMenuItems.length > 0) && (
                            <Stack direction={'row'} alignItems={'center'} gap={1}>
                                {filteredMatches.length > 0 && (
                                    <LoadingButton
                                        size={'small'}
                                        pending={submitting}
                                        variant={'outlined'}
                                        onClick={() =>
                                            handleDownloadRoundStartList(round.setupRoundId)
                                        }>
                                        {t('event.competition.execution.startList.downloadRound')}
                                    </LoadingButton>
                                )}
                                <ExecutionMoreMenu
                                    label={t('event.competition.execution.moreActions.roundLabel')}
                                    disabled={submitting}
                                    items={roundMenuItems}
                                />
                            </Stack>
                        )
                    }
                />
                {counterChips.length > 0 && (
                    <Stack direction={'row'} spacing={1} useFlexGap sx={{flexWrap: 'wrap', mb: 2}}>
                        {counterChips.map(chip => (
                            <StatusChip key={chip.labelKey} chip={chip} />
                        ))}
                    </Stack>
                )}
                {/* Freilose und Ummeldungen: kompakte, aufklappbare Zeilen mit Zähler. Der
                    Aufklapp-Zustand lebt im Eltern und übersteht so jeden Abgleich. */}
                <Stack spacing={1} sx={{mb: 2}}>
                    {byes.length > 0 && (
                        <Accordion
                            disableGutters
                            expanded={props.accordionsExpanded?.[0] ?? false}
                            onChange={handleAccordionExpandedChange(0)}>
                            <AccordionSummary
                                expandIcon={<ExpandMoreIcon />}
                                aria-controls={`${accordionBaseId}-panel-teams-with-bye-content`}
                                id={`${accordionBaseId}-panel-teams-with-bye-header`}
                                sx={compactSummarySx}>
                                <Typography component="span" variant={'body2'} fontWeight={500}>
                                    {t('event.competition.execution.teamsWithBye')}
                                </Typography>
                                <Chip size={'small'} label={byes.length} />
                            </AccordionSummary>
                            <AccordionDetails sx={{pt: 0}}>
                                <ExecutionByeTable
                                    byes={byes}
                                    now={now}
                                    submitting={submitting}
                                    onToggleMustRace={(match, mustRace) =>
                                        void handleToggleByeMustRace(match, mustRace)
                                    }
                                />
                            </AccordionDetails>
                        </Accordion>
                    )}
                    <Accordion
                        disableGutters
                        expanded={props.accordionsExpanded?.[1] ?? false}
                        onChange={handleAccordionExpandedChange(1)}>
                        <AccordionSummary
                            expandIcon={<ExpandMoreIcon />}
                            aria-controls={`${accordionBaseId}-panel-substitutions-content`}
                            id={`${accordionBaseId}-panel-substitutions-header`}
                            sx={compactSummarySx}>
                            <Typography component="span" variant={'body2'} fontWeight={500}>
                                {t('event.competition.execution.substitution.substitutions')}
                            </Typography>
                            <Chip size={'small'} label={round.substitutions.length} />
                        </AccordionSummary>
                        <AccordionDetails sx={{pt: 0}}>
                            <Substitutions
                                eventId={eventId}
                                competitionId={competitionId}
                                reloadRoundDto={() => props.reloadRoundDto()}
                                roundDto={round}
                                roundIndex={roundIndex}
                            />
                        </AccordionDetails>
                    </Accordion>
                </Stack>
                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 2}}>
                    {filteredMatches.map((match, matchIndex) => (
                        <ExecutionMatchCard
                            key={match.id}
                            match={match}
                            isCurrentRound={isCurrentRound}
                            timingSystem={timingSystem}
                            submitting={submitting}
                            highlighted={highlightedMatchId === match.id}
                            smallScreenLayout={smallScreenLayout}
                            now={now}
                            onAction={handleCardAction(match, matchIndex)}
                            onResumeRaceClockerAutoPull={() =>
                                void resumeRaceClockerAutoPull(match.id)
                            }
                        />
                    ))}
                </Box>
            </Box>
            <input
                ref={raceClockerFileInputRef}
                type={'file'}
                accept={'.xlsx'}
                style={{display: 'none'}}
                onChange={async e => {
                    const file = e.target.files?.[0]
                    const matchId = raceClockerFileMatchId.current
                    // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann (onChange
                    // feuert sonst nicht wieder).
                    e.target.value = ''
                    if (file && matchId) {
                        await handleUploadRaceClockerFile(matchId, file)
                    }
                }}
            />
            <ClarificationDialog
                open={clarifyingMatchId !== null}
                onClose={() => setClarifyingMatchId(null)}
                onSubmit={async reason => {
                    if (clarifyingMatchId === null) return false
                    const {error} = await runRequest(undefined, () =>
                        setMatchClarification({
                            path: {eventId, matchId: clarifyingMatchId},
                            body: {reason},
                        }),
                    )
                    if (isRequestNetworkError(error)) {
                        networkFeedback()
                    } else if (error) {
                        feedback.error(
                            t(liveDashboardErrorKey(error) ?? 'event.liveDashboard.control.error'),
                        )
                    }
                    props.reloadRoundDto()
                    return !error
                }}
            />
        </Fragment>
    )
}
export default CompetitionExecutionRound
