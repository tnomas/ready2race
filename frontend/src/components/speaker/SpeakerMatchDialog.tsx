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
    SpeakerTeam,
    statusColorOf,
} from './speakerData.ts'
import {useSpeakerColors} from './speakerSettings.ts'
import {ParticipantBadges} from './SpeakerBadges.tsx'

type Props = {
    match: SpeakerMatch | null
    badges: SpeakerBadges
    onClose: () => void
    onSelectParticipant: (participantId: string) => void
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

const SpeakerMatchDialog = ({match, badges, onClose, onSelectParticipant}: Props) => {
    const {t} = useTranslation()
    const colors = useSpeakerColors()

    if (!match) return null

    const finished = match.status === 'FINISHED'
    const teams = sortTeams(match.teams, finished)

    const headerCellSx = {
        color: colors.textSecondary,
        borderBottom: `1px solid ${colors.border}`,
        fontWeight: 'bold',
    }

    const bodyCellSx = {
        color: colors.text,
        borderBottom: `1px solid ${colors.border}`,
        verticalAlign: 'top',
    }

    return (
        <Dialog
            open={true}
            onClose={onClose}
            maxWidth={'md'}
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: colors.panel,
                    color: colors.text,
                    border: `1px solid ${colors.border}`,
                },
            }}>
            <Box sx={{p: 2, borderBottom: `1px solid ${colors.border}`}}>
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
                                        color: colors.text,
                                        borderColor: colors.border,
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
                                    bgcolor: `${statusColorOf(colors, match.status)}22`,
                                    color: statusColorOf(colors, match.status),
                                    fontWeight: 'bold',
                                }}
                            />
                        </Stack>
                        <Typography sx={{color: colors.textSecondary, mt: 0.5}}>
                            {[match.roundName, match.matchName].filter(Boolean).join(' · ')}
                            {match.startTime &&
                                ` · ${t('speaker.match.start')} ${format(match.startTime, t('format.time'))}`}
                            {match.status === 'RUNNING' &&
                                match.elapsedMinutes != undefined &&
                                ` · ${t('speaker.match.elapsed', {minutes: match.elapsedMinutes})}`}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} sx={{color: colors.textSecondary}}>
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
                                            <Typography variant={'body2'} sx={{color: colors.textSecondary}}>
                                                {t('speaker.match.deregistered')}
                                            </Typography>
                                        ) : team.failed ? (
                                            <Typography variant={'body2'} sx={{color: colors.now}}>
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
                                        <Typography variant={'caption'} sx={{color: colors.textSecondary}}>
                                            {team.teamName}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={bodyCellSx}>
                                    {team.participants.map(participant => (
                                        <Typography key={participant.participantId} variant={'body2'}>
                                            <Typography
                                                component={'span'}
                                                variant={'body2'}
                                                onClick={() =>
                                                    onSelectParticipant(participant.participantId)
                                                }
                                                sx={{
                                                    cursor: 'pointer',
                                                    textDecorationLine: 'underline',
                                                    textDecorationColor: colors.border,
                                                    textUnderlineOffset: '3px',
                                                    '&:hover': {color: colors.upcoming},
                                                }}>
                                                {participant.firstName} {participant.lastName}
                                            </Typography>
                                            {participant.year != undefined && (
                                                <Typography
                                                    component={'span'}
                                                    variant={'caption'}
                                                    sx={{color: colors.textSecondary}}>
                                                    {' '}
                                                    ({t('speaker.match.yearShort')} {participant.year})
                                                </Typography>
                                            )}
                                            {participant.namedRole && (
                                                <Typography
                                                    component={'span'}
                                                    variant={'caption'}
                                                    sx={{color: colors.textSecondary}}>
                                                    {' '}
                                                    – {participant.namedRole}
                                                </Typography>
                                            )}
                                            {' '}
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

export default SpeakerMatchDialog
