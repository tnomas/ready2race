import {Box, Tooltip, Typography} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {
    medalEmoji,
    SpeakerBadges as SpeakerBadgesType,
    SpeakerParticipant,
} from './speakerData.ts'

type ParticipantBadgesProps = {
    participant: SpeakerParticipant
    badges: SpeakerBadgesType
    currentMatchId: string
}

export const ParticipantBadges = ({
    participant,
    badges,
    currentMatchId,
}: ParticipantBadgesProps) => {
    const {t} = useTranslation()

    const otherStarts = (badges.doubleStarts.get(participant.participantId) ?? []).filter(
        start => start.matchId !== currentMatchId,
    )
    const medals = badges.medals.get(participant.participantId) ?? []

    if (otherStarts.length === 0 && medals.length === 0) return null

    return (
        <Box component={'span'} sx={{whiteSpace: 'nowrap'}}>
            {otherStarts.length > 0 && (
                <Tooltip
                    title={
                        <Box>
                            <Typography variant={'body2'} fontWeight={'bold'}>
                                {t('speaker.badges.doubleStartTooltip')}
                            </Typography>
                            {otherStarts.map(start => (
                                <Typography key={start.matchId} variant={'body2'}>
                                    {start.startTime
                                        ? `${format(start.startTime, t('format.time'))} – `
                                        : ''}
                                    {start.label}
                                </Typography>
                            ))}
                        </Box>
                    }>
                    <Box component={'span'} sx={{cursor: 'help', ml: 0.5}}>
                        🔁
                    </Box>
                </Tooltip>
            )}
            {medals.length > 0 && (
                <Tooltip
                    title={
                        <Box>
                            <Typography variant={'body2'} fontWeight={'bold'}>
                                {t('speaker.badges.medalTooltip')}
                            </Typography>
                            {medals.map((medal, index) => (
                                <Typography key={index} variant={'body2'}>
                                    {medalEmoji(medal.place)} {medal.label}
                                </Typography>
                            ))}
                        </Box>
                    }>
                    <Box component={'span'} sx={{cursor: 'help', ml: 0.5}}>
                        {medals.map(medal => medalEmoji(medal.place)).join('')}
                    </Box>
                </Tooltip>
            )}
        </Box>
    )
}

