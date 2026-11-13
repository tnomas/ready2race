import {CompetitionMatchDto} from '@api/types.gen.ts'
import {
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
} from '@mui/material'
import {useTranslation} from 'react-i18next'
import StatusChip from '@components/event/match/StatusChip.tsx'
import {deregisteredChip, matchStatusChip} from '@components/event/match/matchStatusChip.ts'

type Props = {
    byes: CompetitionMatchDto[]
    now: Date
    submitting: boolean
    onToggleMustRace: (match: CompetitionMatchDto, mustRace: boolean) => void
}

/** Die Freilose einer Runde: Gewichtung, Team, Zustand und der Schalter „Muss gefahren werden". */
const ExecutionByeTable = ({byes, now, submitting, onToggleMustRace}: Props) => {
    const {t} = useTranslation()
    return (
        <TableContainer>
            <Table size={'small'}>
                <TableHead>
                    <TableRow>
                        <TableCell width="15%">
                            {t('event.competition.setup.match.outcome.outcome')}
                        </TableCell>
                        <TableCell width="40%">
                            {t('event.competition.execution.match.team')}
                        </TableCell>
                        {/* Der Zustand des Laufs, aus derselben Ableitung wie auf jeder Lauf-Karte:
                            ohne ihn war hier nicht zu sehen, ob das Freilos noch zu quittieren ist. */}
                        <TableCell width="25%">
                            {t('event.competition.execution.match.status')}
                        </TableCell>
                        <TableCell width="20%">
                            {t('event.competition.execution.byeMustRace.label')}
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {byes.map(match => (
                        <TableRow key={match.id}>
                            <TableCell width="15%">{match.weighting}</TableCell>
                            <TableCell width="40%">
                                {match.teams[0]
                                    ? match.teams[0].clubName +
                                      (match.teams[0].name ? ` ${match.teams[0].name}` : '')
                                    : ''}
                            </TableCell>
                            <TableCell width="25%">
                                <Stack
                                    direction={'row'}
                                    spacing={0.5}
                                    useFlexGap
                                    sx={{flexWrap: 'wrap'}}>
                                    <StatusChip
                                        chip={matchStatusChip(match.status, match.startTime, now)}
                                    />
                                    <StatusChip chip={deregisteredChip(match.status)} />
                                </Stack>
                            </TableCell>
                            <TableCell width="20%">
                                {/* Fairness-Regel: Strecke trotz Freilos fahren - Platzierung egal,
                                    Zeit läuft außer Konkurrenz (Hilfetext). */}
                                <Tooltip title={t('event.competition.execution.byeMustRace.hint')}>
                                    <Switch
                                        size={'small'}
                                        checked={match.status.bye?.mustRace ?? false}
                                        disabled={submitting}
                                        onChange={(_, checked) => onToggleMustRace(match, checked)}
                                        inputProps={{
                                            'aria-label': t(
                                                'event.competition.execution.byeMustRace.label',
                                            ),
                                        }}
                                    />
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

export default ExecutionByeTable
