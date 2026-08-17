import {Box, Button, Stack, Typography} from '@mui/material'
import {format} from 'date-fns'
import {useEffect, useMemo, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {matchBadgeSummary, SpeakerBadges, SpeakerMatch, statusColorOf} from './speakerData.ts'
import {useSpeakerColors} from './speakerSettings.ts'

type Props = {
    matches: SpeakerMatch[]
    badges: SpeakerBadges
    now: Date
    onSelectMatch: (match: SpeakerMatch) => void
}

const BLOCK_WIDTH = 148
const BLOCK_HEIGHT = 56
const ROW_GAP = 8
const HEADER_HEIGHT = 28
const ZOOM_LEVELS = [1.5, 2.5, 4] // px per minute

const SpeakerTimeline = ({matches, badges, now, onSelectMatch}: Props) => {
    const {t} = useTranslation()
    const colors = useSpeakerColors()
    const scrollRef = useRef<HTMLDivElement>(null)
    const [zoomIndex, setZoomIndex] = useState(1)
    const pxPerMinute = ZOOM_LEVELS[zoomIndex]

    const timed = useMemo(
        () => matches.filter((match): match is SpeakerMatch & {startTime: Date} => !!match.startTime),
        [matches],
    )

    const window_ = useMemo(() => {
        if (timed.length === 0) return null
        const times = timed.map(match => match.startTime.getTime())
        const min = Math.min(...times, now.getTime())
        const max = Math.max(...times, now.getTime())
        const start = new Date(min)
        start.setMinutes(0, 0, 0)
        const end = new Date(max + 60 * 60 * 1000)
        end.setMinutes(0, 0, 0)
        return {start, end}
    }, [timed, now])

    const toX = (date: Date): number =>
        window_ ? ((date.getTime() - window_.start.getTime()) / 60000) * pxPerMinute : 0

    // greedy row assignment so overlapping blocks stack instead of colliding
    const positioned = useMemo(() => {
        const rowEnds: number[] = []
        return timed.map(match => {
            const x = toX(match.startTime)
            let row = rowEnds.findIndex(end => end <= x - 4)
            if (row === -1) {
                row = rowEnds.length
                rowEnds.push(0)
            }
            rowEnds[row] = x + BLOCK_WIDTH
            return {match, x, row}
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timed, pxPerMinute, window_])

    const rowCount = Math.max(1, ...positioned.map(position => position.row + 1))
    const totalWidth = window_
        ? ((window_.end.getTime() - window_.start.getTime()) / 60000) * pxPerMinute
        : 0
    const totalHeight = HEADER_HEIGHT + rowCount * (BLOCK_HEIGHT + ROW_GAP) + 16

    const hours = useMemo(() => {
        if (!window_) return []
        const result: Date[] = []
        const cursor = new Date(window_.start)
        while (cursor.getTime() <= window_.end.getTime()) {
            result.push(new Date(cursor))
            cursor.setHours(cursor.getHours() + 1)
        }
        return result
    }, [window_])

    const scrollToNow = () => {
        const container = scrollRef.current
        if (container && window_) {
            container.scrollTo({
                left: Math.max(0, toX(now) - container.clientWidth / 2),
                behavior: 'smooth',
            })
        }
    }

    const initialScrollDone = useRef(false)
    useEffect(() => {
        if (!initialScrollDone.current && window_ && scrollRef.current) {
            initialScrollDone.current = true
            const container = scrollRef.current
            container.scrollLeft = Math.max(0, toX(now) - container.clientWidth / 2)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [window_])

    if (!window_) {
        return (
            <Typography sx={{color: colors.textSecondary, p: 4, textAlign: 'center'}}>
                {t('speaker.timeline.empty')}
            </Typography>
        )
    }

    const nowX = toX(now)

    return (
        <Box>
            <Stack
                direction={'row'}
                spacing={2}
                alignItems={'center'}
                flexWrap={'wrap'}
                useFlexGap
                sx={{mb: 1.5}}>
                <Button
                    size={'small'}
                    variant={'outlined'}
                    onClick={scrollToNow}
                    sx={{
                        color: colors.now,
                        borderColor: colors.now,
                        '&:hover': {borderColor: colors.now, opacity: 0.8},
                    }}>
                    ⦿ {t('speaker.timeline.now')} {format(now, t('format.time'))}
                </Button>
                <Button
                    size={'small'}
                    variant={'outlined'}
                    onClick={() => setZoomIndex(index => Math.max(0, index - 1))}
                    disabled={zoomIndex === 0}
                    sx={{color: colors.text, borderColor: colors.border, minWidth: 40}}>
                    −
                </Button>
                <Button
                    size={'small'}
                    variant={'outlined'}
                    onClick={() => setZoomIndex(index => Math.min(ZOOM_LEVELS.length - 1, index + 1))}
                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                    sx={{color: colors.text, borderColor: colors.border, minWidth: 40}}>
                    +
                </Button>
                <Stack direction={'row'} spacing={2} sx={{ml: 'auto'}}>
                    {(['UPCOMING', 'RUNNING', 'FINISHED'] as const).map(status => (
                        <Stack key={status} direction={'row'} spacing={0.5} alignItems={'center'}>
                            <Box
                                sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '2px',
                                    bgcolor: statusColorOf(colors, status),
                                }}
                            />
                            <Typography
                                variant={'caption'}
                                sx={{color: colors.textSecondary}}>
                                {t(`speaker.status.${status}`)}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            </Stack>
            <Box
                ref={scrollRef}
                sx={{
                    overflowX: 'auto',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 2,
                    bgcolor: colors.background,
                }}>
                <Box sx={{position: 'relative', width: totalWidth, height: totalHeight}}>
                    {hours.map(hour => (
                        <Box
                            key={hour.getTime()}
                            sx={{
                                position: 'absolute',
                                left: toX(hour),
                                top: 0,
                                bottom: 0,
                                borderLeft: `1px solid ${colors.border}`,
                                pl: 0.5,
                            }}>
                            <Typography
                                variant={'caption'}
                                sx={{color: colors.textSecondary}}>
                                {format(hour, t('format.time'))}
                            </Typography>
                        </Box>
                    ))}
                    <Box
                        sx={{
                            position: 'absolute',
                            left: nowX,
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            bgcolor: colors.now,
                            zIndex: 2,
                        }}
                    />
                    {positioned.map(({match, x, row}) => {
                        const color = statusColorOf(colors, match.status)
                        const emoji = matchBadgeSummary(match, badges)
                        return (
                            <Box
                                key={match.matchId}
                                onClick={() => onSelectMatch(match)}
                                sx={{
                                    position: 'absolute',
                                    left: x,
                                    top: HEADER_HEIGHT + row * (BLOCK_HEIGHT + ROW_GAP),
                                    width: BLOCK_WIDTH,
                                    height: BLOCK_HEIGHT,
                                    bgcolor: colors.panel,
                                    border: `1px solid ${colors.border}`,
                                    borderLeft: `4px solid ${color}`,
                                    borderRadius: 1,
                                    px: 1,
                                    py: 0.5,
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    zIndex: 1,
                                    transition: 'background-color 0.15s',
                                    '&:hover': {bgcolor: colors.panelHover},
                                    ...(match.status === 'RUNNING' && {
                                        boxShadow: `0 0 8px ${colors.running}55`,
                                    }),
                                    ...(match.cancelled && {
                                        borderLeftColor: colors.now,
                                        opacity: 0.65,
                                    }),
                                }}>
                                <Stack
                                    direction={'row'}
                                    justifyContent={'space-between'}
                                    alignItems={'center'}>
                                    <Typography
                                        variant={'caption'}
                                        fontWeight={'bold'}
                                        sx={{color: match.cancelled ? colors.now : color}}>
                                        {format(match.startTime, t('format.time'))}
                                        {match.cancelled
                                            ? ` · ${t('speaker.status.CANCELLED')}`
                                            : match.status === 'RUNNING'
                                              ? ` · ${t('speaker.status.liveShort')}`
                                              : match.status === 'FINISHED'
                                                ? ' · ✓'
                                                : ''}
                                    </Typography>
                                    <Typography variant={'caption'}>{emoji}</Typography>
                                </Stack>
                                <Typography
                                    variant={'body2'}
                                    sx={{
                                        color: colors.text,
                                        lineHeight: 1.2,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}>
                                    {match.competitionName}
                                    {match.matchName ? ` · ${match.matchName}` : ''}
                                </Typography>
                            </Box>
                        )
                    })}
                </Box>
            </Box>
        </Box>
    )
}

export default SpeakerTimeline
