import {Box, Chip, Stack, Typography} from '@mui/material'
import {format} from 'date-fns'
import {Fragment} from 'react'
import {useTranslation} from 'react-i18next'
import {
    medalEmoji,
    ParticipantStart,
    SpeakerBadges,
    SpeakerMatch,
    statusColorOf,
    turnaroundMinutes,
} from './speakerData.ts'
import {useSpeakerSettings} from './speakerSettings.ts'
import SpeakerPanel from './SpeakerPanel.tsx'

type Props = {
    participantId: string
    badges: SpeakerBadges
    now: Date
    onClose: () => void
    onSelectMatch: (match: SpeakerMatch) => void
}

const startResult = (start: ParticipantStart, failedLabel: string): string | null => {
    if (start.match.status !== 'FINISHED') return null
    if (start.team.failed) return start.team.failedReason || failedLabel
    if (start.team.place == undefined) return null
    const medal = start.team.place <= 3 ? `${medalEmoji(start.team.place)} ` : ''
    return `${medal}${start.team.place}.${start.team.timeString ? ` · ${start.team.timeString}` : ''}`
}

/**
 * Rechte Spalte, unteres Panel: alle Starts einer Athletin über das Wochenende — Nachfolger des
 * früheren Teilnehmer-Dialogs. Bleibt stehen, bis es über das Kreuz geschlossen wird; ein Klick
 * auf einen Start wählt den Lauf in der Mitte, ohne dieses Panel zu schließen.
 */
const SpeakerParticipantPanel = ({participantId, badges, now, onClose, onSelectMatch}: Props) => {
    const {t} = useTranslation()
    const {settings, colors} = useSpeakerSettings()

    const starts = badges.starts.get(participantId) ?? []
    if (starts.length === 0) return null

    const participant = starts[0].participant
    const clubs = [
        ...new Set(
            starts
                .map(start => start.team.clubName ?? start.team.clubsFull)
                .filter((club): club is string => !!club),
        ),
    ]
    const medals = badges.medals.get(participantId) ?? []

    // next upcoming start and how tight the turnaround is
    const nextStart = starts.find(
        start =>
            start.match.status !== 'FINISHED' &&
            start.match.startTime &&
            start.match.startTime.getTime() > now.getTime(),
    )
    const minutesToNext = nextStart?.match.startTime
        ? Math.round((nextStart.match.startTime.getTime() - now.getTime()) / 60000)
        : undefined
    const tightNext = minutesToNext != undefined && minutesToNext <= settings.turnaroundMinutes

    return (
        <SpeakerPanel
            title={
                <>
                    {participant.firstName} {participant.lastName}
                    {participant.year != undefined && (
                        <Typography
                            component={'span'}
                            variant={'body2'}
                            sx={{color: colors.textSecondary, ml: 1}}>
                            ({t('speaker.match.yearShort')} {participant.year})
                        </Typography>
                    )}
                </>
            }
            subtitle={clubs.join(' / ')}
            onClose={onClose}>
            <Box sx={{p: 1.5}}>
                <Stack direction={'row'} spacing={1} flexWrap={'wrap'} useFlexGap>
                    <Chip
                        size={'small'}
                        label={t('speaker.participant.startCount', {count: starts.length})}
                        sx={{color: colors.text, bgcolor: colors.panelHover}}
                    />
                    {medals.length > 0 && (
                        <Chip
                            size={'small'}
                            label={medals.map(medal => medalEmoji(medal.place)).join(' ')}
                            sx={{bgcolor: colors.panelHover}}
                        />
                    )}
                </Stack>
                {tightNext && nextStart && (
                    <Box
                        sx={{
                            mt: 1.5,
                            p: 1,
                            borderRadius: 1,
                            border: `1px solid ${colors.now}`,
                            bgcolor: `${colors.now}1a`,
                        }}>
                        <Typography variant={'body2'} fontWeight={'bold'} sx={{color: colors.now}}>
                            ⚡{' '}
                            {t('speaker.participant.backOnWater', {
                                minutes: minutesToNext,
                                time: format(nextStart.match.startTime!, t('format.time')),
                            })}
                        </Typography>
                    </Box>
                )}
                <Box sx={{mt: 1}}>
                    {starts.map((start, index) => {
                        const gap = index > 0 ? turnaroundMinutes(starts[index - 1], start) : undefined
                        const tightGap = gap != undefined && gap <= settings.turnaroundMinutes
                        const result = startResult(start, t('speaker.match.failed'))
                        const color = statusColorOf(colors, start.match.status)
                        return (
                            <Fragment key={start.match.matchId}>
                                {tightGap && (
                                    <Typography
                                        variant={'caption'}
                                        fontWeight={'bold'}
                                        sx={{color: colors.now, display: 'block', pl: 1}}>
                                        ⚡ {t('speaker.participant.tightTurnaround', {minutes: gap})}
                                    </Typography>
                                )}
                                <Box
                                    onClick={() => onSelectMatch(start.match)}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        gap: 1.5,
                                        p: 1,
                                        my: 0.5,
                                        borderRadius: 1,
                                        borderLeft: `4px solid ${color}`,
                                        bgcolor: colors.background,
                                        cursor: 'pointer',
                                        '&:hover': {bgcolor: colors.panelHover},
                                    }}>
                                    <Typography
                                        variant={'body2'}
                                        fontWeight={'bold'}
                                        sx={{minWidth: 48}}>
                                        {start.match.startTime
                                            ? format(start.match.startTime, t('format.time'))
                                            : '–'}
                                    </Typography>
                                    <Box sx={{flex: 1, minWidth: 0}}>
                                        <Typography variant={'body2'} fontWeight={'bold'}>
                                            {start.match.competitionName}
                                            {start.match.categoryName
                                                ? ` (${start.match.categoryName})`
                                                : ''}
                                        </Typography>
                                        <Typography
                                            variant={'caption'}
                                            sx={{color: colors.textSecondary}}>
                                            {[
                                                start.match.matchName ?? start.match.roundName,
                                                start.team.startNumber != undefined
                                                    ? `${t('speaker.match.startNumber')} ${start.team.startNumber}`
                                                    : null,
                                                start.participant.namedRole,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        variant={'body2'}
                                        fontWeight={result ? 'bold' : 'normal'}
                                        sx={{
                                            color: result ? colors.text : color,
                                            whiteSpace: 'nowrap',
                                        }}>
                                        {result ??
                                            (start.match.status === 'RUNNING'
                                                ? `● ${t('speaker.status.RUNNING')}`
                                                : t('speaker.status.UPCOMING'))}
                                    </Typography>
                                </Box>
                            </Fragment>
                        )
                    })}
                </Box>
            </Box>
        </SpeakerPanel>
    )
}

export default SpeakerParticipantPanel
