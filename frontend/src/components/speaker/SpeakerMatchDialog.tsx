import {
    Box,
    Chip,
    Dialog,
    DialogContent,
    IconButton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {
    medalEmoji,
    SpeakerBadges,
    SpeakerMatch,
    speakerColors,
    SpeakerTeam,
    statusColor,
} from './speakerData.ts'
import {ParticipantBadges} from './SpeakerBadges.tsx'

type Props = {
    match: SpeakerMatch | null
    badges: SpeakerBadges
    onClose: () => void
}

const sortTeams = (teams: SpeakerTeam[], finished: boolean): SpeakerTeam[] =>
    [...teams].sort((a, b) => {
        if (finished) {
            if (a.place != undefined && b.place != undefined) return a.place - b.place
            if (a.place != undefined) return -1
            if (b.place != undefined) return 1
        }
        return (a.startNumber ?? Number.MAX_SAFE_INTEGER) - (b.startNumber ?? Number.MAX_SAFE_INTEGER)
    })

const SpeakerMatchDialog = ({match, badges, onClose}: Props) => {
    const {t} = useTranslation()

    if (!match) return null

    const finished = match.status === 'FINISHED'
    const teams = sortTeams(match.teams, finished)

    return (
        <Dialog
            open={true}
            onClose={onClose}
            maxWidth={'md'}
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: speakerColors.panel,
                    color: speakerColors.text,
                    border: `1px solid ${speakerColors.border}`,
                },
            }}>
            <Box sx={{p: 2, borderBottom: `1px solid ${speakerColors.border}`}}>
                <Stack direction={'row'} alignItems={'flex-start'} spacing={2}>
                    <Box sx={{flex: 1}}>
                        <Stack direction={'row'} spacing={1} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                            <Typography variant={'h5'} fontWeight={'bold'}>
                                {match.competitionName}
                            </Typography>
                            {match.categoryName && (
                                <Chip
                                    size={'small'}
                                    label={match.categoryName}
                                    sx={{
                                        color: speakerColors.text,
                                        borderColor: speakerColors.border,
                                    }}
                                    variant={'outlined'}
                                />
                            )}
                            <Chip
                                size={'small'}
                                label={
                                    match.status === 'RUNNING'
                                        ? `● ${t('speaker.status.RUNNING')}`
                                        : match.status === 'FINISHED'
                                          ? `✓ ${t('speaker.status.FINISHED')}`
                                          : t('speaker.status.UPCOMING')
                                }
                                sx={{
                                    bgcolor: `${statusColor(match.status)}22`,
                                    color: statusColor(match.status),
                                    fontWeight: 'bold',
                                }}
                            />
                        </Stack>
                        <Typography sx={{color: speakerColors.textSecondary, mt: 0.5}}>
                            {[match.roundName, match.matchName].filter(Boolean).join(' · ')}
                            {match.startTime &&
                                ` · ${t('speaker.match.start')} ${format(match.startTime, t('format.time'))}`}
                            {match.status === 'RUNNING' &&
                                match.elapsedMinutes != undefined &&
                                ` · ${t('speaker.match.elapsed', {minutes: match.elapsedMinutes})}`}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} sx={{color: speakerColors.textSecondary}}>
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </Box>
            <DialogContent sx={{p: 0}}>
                <Table size={'small'}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={headerCellSx}>
                                {finished ? t('speaker.match.place') : t('speaker.match.startNumber')}
                            </TableCell>
                            <TableCell sx={headerCellSx}>{t('speaker.match.team')}</TableCell>
                            <TableCell sx={headerCellSx}>{t('speaker.match.participants')}</TableCell>
                            {finished && (
                                <TableCell sx={headerCellSx} align={'right'}>
                                    {t('speaker.match.time')}
                                </TableCell>
                            )}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {teams.map(team => (
                            <TableRow key={team.teamId} sx={{'&:last-child td': {border: 0}}}>
                                <TableCell sx={{...bodyCellSx, whiteSpace: 'nowrap'}}>
                                    {finished ? (
                                        team.deregistered ? (
                                            <Typography variant={'body2'} sx={{color: speakerColors.textSecondary}}>
                                                {t('speaker.match.deregistered')}
                                            </Typography>
                                        ) : team.failed ? (
                                            <Typography variant={'body2'} sx={{color: speakerColors.now}}>
                                                {team.failedReason || t('speaker.match.failed')}
                                            </Typography>
                                        ) : team.place != undefined ? (
                                            <Typography fontWeight={'bold'}>
                                                {team.place <= 3 ? medalEmoji(team.place) : ''} {team.place}.
                                            </Typography>
                                        ) : (
                                            '–'
                                        )
                                    ) : (
                                        (team.startNumber ?? '–')
                                    )}
                                </TableCell>
                                <TableCell sx={bodyCellSx}>
                                    <Typography fontWeight={'bold'} variant={'body2'}>
                                        {team.clubName ?? team.actualClubName ?? ''}
                                    </Typography>
                                    {team.teamName && (
                                        <Typography variant={'caption'} sx={{color: speakerColors.textSecondary}}>
                                            {team.teamName}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={bodyCellSx}>
                                    {team.participants.map(participant => (
                                        <Typography key={participant.participantId} variant={'body2'}>
                                            {participant.firstName} {participant.lastName}
                                            {participant.year != undefined && (
                                                <Typography
                                                    component={'span'}
                                                    variant={'caption'}
                                                    sx={{color: speakerColors.textSecondary}}>
                                                    {' '}
                                                    ({t('speaker.match.yearShort')} {participant.year})
                                                </Typography>
                                            )}
                                            {participant.namedRole && (
                                                <Typography
                                                    component={'span'}
                                                    variant={'caption'}
                                                    sx={{color: speakerColors.textSecondary}}>
                                                    {' '}
                                                    – {participant.namedRole}
                                                </Typography>
                                            )}
                                            <ParticipantBadges
                                                participant={participant}
                                                badges={badges}
                                                currentMatchId={match.matchId}
                                            />
                                        </Typography>
                                    ))}
                                </TableCell>
                                {finished && (
                                    <TableCell sx={{...bodyCellSx, whiteSpace: 'nowrap'}} align={'right'}>
                                        {team.timeString ?? ''}
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </DialogContent>
        </Dialog>
    )
}

const headerCellSx = {
    color: speakerColors.textSecondary,
    borderBottom: `1px solid ${speakerColors.border}`,
    fontWeight: 'bold',
}

const bodyCellSx = {
    color: speakerColors.text,
    borderBottom: `1px solid ${speakerColors.border}`,
    verticalAlign: 'top',
}

export default SpeakerMatchDialog
