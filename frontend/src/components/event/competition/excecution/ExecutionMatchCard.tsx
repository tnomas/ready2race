import {CompetitionMatchDto} from '@api/types.gen.ts'
import {
    Box,
    Card,
    Divider,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import LoadingButton from '@components/form/LoadingButton.tsx'
import StatusChip from '@components/event/match/StatusChip.tsx'
import {
    arenaChip,
    deregisteredChip,
    matchStatusChip,
} from '@components/event/match/matchStatusChip.ts'
import {failedLabel} from '@utils/matchResultStatus.ts'
import {teamNameSuffix} from '@utils/helpers.ts'
import {statusTextColor} from '../../../../theme/themeColors.ts'
import {ExecutionTimingSystem} from './matchResultOptions.ts'
import {raceClockerPollStatus} from './raceClockerPollStatus.ts'
import {
    isDestructiveMoreAction,
    MatchCardButton,
    matchCardActions,
    MatchMoreAction,
} from './matchCardActions.ts'
import ExecutionMoreMenu from './ExecutionMoreMenu.tsx'
import ExecutionMaterialNote from './ExecutionMaterialNote.tsx'
import {executionMatchDomId} from './executionMatchDomId.ts'

export type MatchCardAction = MatchCardButton | MatchMoreAction

type Props = {
    match: CompetitionMatchDto
    /** Jüngste Runde: nur dort Ergebnisse, Zurücknehmen und Zurücksetzen. */
    isCurrentRound: boolean
    timingSystem: ExecutionTimingSystem
    submitting: boolean
    highlighted: boolean
    smallScreenLayout: boolean
    /** Gemeinsame Uhr der Runde für die „überfällig"-Ableitung des Status-Chips. */
    now: Date
    onAction: (action: MatchCardAction) => void
    onResumeRaceClockerAutoPull: () => void
}

const buttonLabelKeys = {
    resolveClarification: 'event.liveDashboard.clarification.resolve',
    enterResults: 'event.competition.execution.results.enter',
    activate: 'event.competition.execution.match.control.activate',
    deactivate: 'event.competition.execution.match.control.deactivate',
    markStarted: 'event.competition.execution.match.control.markStarted',
    finish: 'event.competition.execution.match.control.finish',
    editMatch: 'event.competition.execution.matchData.edit',
} as const satisfies Record<MatchCardButton, string>

const moreLabelKeys = {
    resultsXls: 'event.competition.execution.moreActions.resultsXls',
    resultsRaceClocker: 'event.competition.execution.moreActions.resultsRaceClocker',
    resultsRaceClockerFile: 'event.competition.execution.moreActions.resultsRaceClockerFile',
    startListPdf: 'event.competition.execution.moreActions.startListPdf',
    startListCsv: 'event.competition.execution.moreActions.startListCsv',
    setClarification: 'event.competition.execution.moreActions.setClarification',
    reopen: 'event.competition.execution.match.control.reopen',
    reset: 'event.competition.execution.resetMatch.action',
} as const satisfies Record<MatchMoreAction, string>

/**
 * Eine Lauf-Karte der Durchführung: Kopf (Name, Startzeit, Zustand), Aktionsleiste (eine
 * Primäraktion, die häufigen Statusübergänge, „Partie bearbeiten", Überlaufmenü), Hinweise und
 * darunter Aufstellung bzw. Ergebnis. Welche Aktion wo steht, entscheidet `matchCardActions`;
 * die Karte malt nur und meldet die Wahl über [Props.onAction] nach oben.
 */
const ExecutionMatchCard = ({
    match,
    isCurrentRound,
    timingSystem,
    submitting,
    highlighted,
    smallScreenLayout,
    now,
    onAction,
    onResumeRaceClockerAutoPull,
}: Props) => {
    const {t} = useTranslation()
    const actions = matchCardActions(match, {isCurrentRound, timingSystem})
    const pollStatus = timingSystem === 'RACECLOCKER' ? raceClockerPollStatus(match) : null

    return (
        <Card
            id={executionMatchDomId(match.id)}
            sx={{
                p: {xs: 1.5, sm: 2},
                flex: '1 1 0',
                minWidth: {xs: '100%', md: 400},
                ...(match.activatedAt != null && {
                    borderColor: 'primary.main',
                    borderWidth: 2,
                    borderStyle: 'solid',
                }),
                // Kurzes Aufleuchten nach dem Sprung aus dem Zeitplan — derselbe
                // Hintergrund-Fade wie bei der Zeilen-Hervorhebung dort.
                ...(highlighted && {backgroundColor: 'action.selected'}),
                transition: 'background-color 0.5s ease',
            }}>
            {/* Kopf: wer, wann, in welchem Zustand. Der Zustand kommt aus derselben Ableitung wie
                überall (matchStatusChip) — die Karte rechnet ihn nicht selbst. */}
            <Stack
                direction={'row'}
                justifyContent={'space-between'}
                alignItems={'flex-start'}
                flexWrap={'wrap'}
                gap={1}>
                <Box sx={{minWidth: 0}}>
                    {match.name && (
                        <Typography variant={'h3'} component={'h3'} sx={{overflowWrap: 'anywhere'}}>
                            {match.name}
                        </Typography>
                    )}
                    <Typography variant={'body2'} color={'text.secondary'}>
                        {t('event.competition.execution.match.startTime') + ': '}
                        <Box component={'span'} sx={{color: 'text.primary', fontWeight: 500}}>
                            {match.startTime
                                ? format(new Date(match.startTime), t('format.datetime'))
                                : '-'}
                        </Box>
                        {match.startTimeOffset ? (
                            <>
                                {' · '}
                                {t('event.competition.execution.match.startTimeOffset') + ': '}
                                {match.startTimeOffset} {t('common.form.seconds')}
                            </>
                        ) : null}
                    </Typography>
                </Box>
                {/* Zustand und Überlaufmenü oben rechts: das Menü steht so an fester Stelle,
                    egal wie viele Knöpfe die Aktionsleiste darunter gerade zeigt. */}
                <Stack direction={'row'} alignItems={'center'} gap={0.5}>
                    <Stack direction={'row'} spacing={0.5} useFlexGap sx={{flexWrap: 'wrap'}}>
                        <StatusChip chip={matchStatusChip(match.status, match.startTime, now)} />
                        <StatusChip chip={deregisteredChip(match.status)} />
                        <StatusChip chip={arenaChip(match.status)} />
                    </Stack>
                    <ExecutionMoreMenu
                        label={t('event.competition.execution.moreActions.label')}
                        disabled={submitting}
                        items={actions.more.map(action => ({
                            id: action,
                            label: t(moreLabelKeys[action]),
                            destructive: isDestructiveMoreAction(action),
                            onSelect: () => onAction(action),
                        }))}
                    />
                </Stack>
            </Stack>

            {/* Aktionsleiste: Primäraktion gefüllt, die häufigen Übergänge als Rahmenknöpfe, der
                Rest im Menü. Die Knöpfe zeigen nur die Übergänge, die der Zustand hergibt. */}
            <Stack
                direction={'row'}
                alignItems={'center'}
                flexWrap={'wrap'}
                useFlexGap
                gap={1}
                sx={{mt: 1.5}}>
                {actions.primary && (
                    <LoadingButton
                        size={'small'}
                        variant={'contained'}
                        pending={submitting}
                        onClick={() => onAction(actions.primary!)}>
                        {t(buttonLabelKeys[actions.primary])}
                    </LoadingButton>
                )}
                {actions.buttons.map(button => (
                    <LoadingButton
                        key={button}
                        size={'small'}
                        variant={'outlined'}
                        pending={submitting}
                        onClick={() => onAction(button)}>
                        {t(buttonLabelKeys[button])}
                    </LoadingButton>
                ))}
            </Stack>

            {match.pairingsRecalculatedAt && (
                <Typography
                    variant={'caption'}
                    component={'p'}
                    sx={{mt: 1, color: theme => statusTextColor(theme, 'warning')}}>
                    {t('event.competition.execution.pairingsRecalculated')}
                </Typography>
            )}
            {pollStatus && pollStatus.kind !== 'none' && (
                <Stack
                    direction={'row'}
                    alignItems={'center'}
                    flexWrap={'wrap'}
                    gap={1}
                    sx={{mt: 1}}>
                    <Typography
                        variant={'caption'}
                        sx={{
                            color: theme =>
                                pollStatus.kind === 'ok'
                                    ? theme.palette.text.secondary
                                    : statusTextColor(theme, 'warning'),
                        }}>
                        {pollStatus.kind === 'paused'
                            ? t('event.competition.execution.results.raceclocker.poll.paused')
                            : pollStatus.kind === 'error'
                              ? t('event.competition.execution.results.raceclocker.poll.error', {
                                    reason: pollStatus.errorKey
                                        ? t(pollStatus.errorKey)
                                        : t('common.error.unexpected'),
                                })
                              : t(
                                    'event.competition.execution.results.raceclocker.poll.lastPolled',
                                    {
                                        time: format(
                                            new Date(match.raceClockerPolledAt!),
                                            'HH:mm:ss',
                                        ),
                                    },
                                )}
                    </Typography>
                    {pollStatus.kind === 'paused' && (
                        <LoadingButton
                            size={'small'}
                            variant={'text'}
                            pending={submitting}
                            onClick={onResumeRaceClockerAutoPull}>
                            {t('event.competition.execution.results.raceclocker.poll.resume')}
                        </LoadingButton>
                    )}
                </Stack>
            )}

            <Divider sx={{my: 1.5}} />
            <MatchTeamsTable match={match} smallScreenLayout={smallScreenLayout} />
        </Card>
    )
}

/** Aufstellung bzw. Ergebnis des Laufs, nach Startnummer sortiert. */
const MatchTeamsTable = ({
    match,
    smallScreenLayout,
}: {
    match: CompetitionMatchDto
    smallScreenLayout: boolean
}) => {
    const {t} = useTranslation()
    return (
        <TableContainer>
            <Table size={'small'}>
                <TableHead>
                    <TableRow>
                        <TableCell width="15%">
                            {smallScreenLayout
                                ? t('event.competition.execution.match.startNumber.short')
                                : t('event.competition.execution.match.startNumber.startNumber')}
                        </TableCell>
                        <TableCell width="55%">
                            {t('event.competition.execution.match.team')}
                        </TableCell>
                        <TableCell width="10%">
                            {t('event.competition.execution.match.place')}
                        </TableCell>
                        <TableCell width="20%">
                            {t('event.competition.execution.match.time')}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {match.teams
                        .sort((a, b) => a.startNumber - b.startNumber)
                        .map(team => (
                            <TableRow key={team.registrationId}>
                                <TableCell width="15%">{team.startNumber}</TableCell>
                                <TableCell width="55%">
                                    <Typography variant={'body2'} sx={{fontWeight: 500}}>
                                        {team.actualClubName ?? team.clubName}
                                    </Typography>
                                    <ExecutionMaterialNote material={team.material} />
                                    <Typography variant="body2" color="textSecondary">
                                        {`${t('club.registeredBy')} ` +
                                            team.clubName +
                                            teamNameSuffix(team.name)}
                                    </Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        {team.namedParticipants
                                            .map(np =>
                                                np.participants
                                                    .map(p => `${p.firstName} ${p.lastName}`)
                                                    .join(', '),
                                            )
                                            .join(', ')}
                                    </Typography>
                                </TableCell>
                                <TableCell width="10%">
                                    {team.deregistered
                                        ? t(
                                              'event.competition.registration.deregister.deregistered',
                                          ) +
                                          (team.deregistrationReason
                                              ? ` (${team.deregistrationReason})`
                                              : '')
                                        : team.failed
                                          ? failedLabel(
                                                team.failedReason,
                                                t('event.competition.execution.results.failed'),
                                            )
                                          : team.place}
                                </TableCell>
                                <TableCell width="20%">
                                    {team.timeString}
                                    {/*
                                        Zwischenzeiten unter der Endzeit statt in eigenen Spalten:
                                        die Zahl der Marken ist je Rennen frei (0-4) und die Namen
                                        vergibt der Zeitnehmer - eine feste Spaltenstruktur gäbe es
                                        nicht.
                                    */}
                                    {(team.laps ?? []).length > 0 && (
                                        <Typography variant="body2" color="textSecondary">
                                            {(team.laps ?? [])
                                                .map(lap => `${lap.name} ${lap.timeString}`)
                                                .join(' · ')}
                                        </Typography>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export default ExecutionMatchCard
