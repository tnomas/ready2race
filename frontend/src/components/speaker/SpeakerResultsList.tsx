import {Box, Stack, Typography} from '@mui/material'
import {format} from 'date-fns'
import {Fragment, useMemo} from 'react'
import {useTranslation} from 'react-i18next'
import {medalEmoji, SpeakerBadges, SpeakerMatch} from './speakerData.ts'
import {useSpeakerColors} from './speakerSettings.ts'
import {ParticipantBadges} from './SpeakerBadges.tsx'

type Props = {
    matches: SpeakerMatch[]
    badges: SpeakerBadges
    onSelectMatch: (match: SpeakerMatch) => void
    onSelectParticipant: (participantId: string) => void
}

const SpeakerResultsList = ({matches, badges, onSelectMatch, onSelectParticipant}: Props) => {
    const {t} = useTranslation()
    const colors = useSpeakerColors()

    const finished = useMemo(
        () =>
            matches
                .filter(match => match.status === 'FINISHED')
                .sort(
                    (a, b) =>
                        (b.updatedAt?.getTime() ?? b.startTime?.getTime() ?? 0) -
                        (a.updatedAt?.getTime() ?? a.startTime?.getTime() ?? 0),
                ),
        [matches],
    )

    if (finished.length === 0) {
        return (
            <Typography sx={{color: colors.textSecondary, p: 4, textAlign: 'center'}}>
                {t('speaker.results.empty')}
            </Typography>
        )
    }

    return (
        <Box
            sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {xs: '1fr', md: '1fr 1fr', xl: '1fr 1fr 1fr'},
            }}>
            {finished.map(match => (
                <Box
                    key={match.matchId}
                    onClick={() => onSelectMatch(match)}
                    sx={{
                        bgcolor: colors.panel,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 2,
                        p: 2,
                        cursor: 'pointer',
                        '&:hover': {bgcolor: colors.panelHover},
                    }}>
                    <Stack direction={'row'} justifyContent={'space-between'} alignItems={'baseline'}>
                        <Typography fontWeight={'bold'}>
                            {match.competitionName}
                            {match.categoryName ? ` (${match.categoryName})` : ''}
                        </Typography>
                        <Typography variant={'caption'} sx={{color: colors.textSecondary}}>
                            {match.updatedAt &&
                                `${t('speaker.results.updated')} ${format(match.updatedAt, t('format.time'))}`}
                        </Typography>
                    </Stack>
                    {(match.roundName || match.matchName) && (
                        <Typography variant={'caption'} sx={{color: colors.textSecondary}}>
                            {[match.roundName, match.matchName].filter(Boolean).join(' · ')}
                        </Typography>
                    )}
                    <Box sx={{mt: 1}}>
                        {[...match.teams]
                            .sort(
                                (a, b) =>
                                    (a.place ?? Number.MAX_SAFE_INTEGER) -
                                    (b.place ?? Number.MAX_SAFE_INTEGER),
                            )
                            .map(team => (
                                <Stack
                                    key={team.teamId}
                                    direction={'row'}
                                    spacing={1}
                                    alignItems={'baseline'}
                                    sx={{py: 0.25}}>
                                    <Typography
                                        variant={'body2'}
                                        fontWeight={'bold'}
                                        sx={{minWidth: 46}}>
                                        {team.deregistered
                                            ? '✗'
                                            : team.failed
                                              ? (team.failedReason ?? t('speaker.match.failed'))
                                              : team.place != undefined
                                                ? `${team.place <= 3 ? medalEmoji(team.place) : ''}${team.place}.`
                                                : '–'}
                                    </Typography>
                                    <Box sx={{flex: 1, minWidth: 0}}>
                                        <Typography variant={'body2'}>
                                            {team.clubName ?? team.actualClubName ?? ''}
                                            {team.teamName ? ` – ${team.teamName}` : ''}
                                        </Typography>
                                        <Typography
                                            variant={'caption'}
                                            sx={{color: colors.textSecondary}}>
                                            {team.participants.map((participant, index) => (
                                                <Fragment key={participant.participantId}>
                                                    {index > 0 && ', '}
                                                    <Typography
                                                        component={'span'}
                                                        variant={'caption'}
                                                        onClick={event => {
                                                            event.stopPropagation()
                                                            onSelectParticipant(
                                                                participant.participantId,
                                                            )
                                                        }}
                                                        sx={{
                                                            cursor: 'pointer',
                                                            '&:hover': {color: colors.upcoming},
                                                        }}>
                                                        {participant.firstName}{' '}
                                                        {participant.lastName}
                                                    </Typography>
                                                    <ParticipantBadges
                                                        participant={participant}
                                                        badges={badges}
                                                        currentMatchId={match.matchId}
                                                    />
                                                </Fragment>
                                            ))}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        variant={'body2'}
                                        sx={{color: colors.textSecondary}}>
                                        {team.timeString ?? ''}
                                    </Typography>
                                </Stack>
                            ))}
                    </Box>
                </Box>
            ))}
        </Box>
    )
}

export default SpeakerResultsList
