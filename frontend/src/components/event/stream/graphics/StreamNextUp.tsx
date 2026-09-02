import {Box, Typography} from '@mui/material'
import {format} from 'date-fns'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import {competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamPlate from './design/StreamPlate.tsx'
import StreamTag from './design/StreamTag.tsx'
import {STREAM_DISPLAY_FONT, STREAM_PLATE} from './design/streamTheme.ts'

interface StreamNextUpProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
}

/**
 * NEXT_UP: ein schmaler Streifen „ALS NÄCHSTES · Wettkampf · Runde/Lauf · 10:30" — dieselbe
 * Zusammensetzung wie die Kopfzeile der übrigen Grafiken, nur ohne Bootsliste. Die geplante
 * Startzeit steht rechts, sofern eine vorliegt.
 */
const StreamNextUp = ({match, size}: StreamNextUpProps) => {
    const {t} = useTranslation()
    const title = competitionLabel(match.competitionName, match.competitionShortName, true)
    const subtitle = roundMatchLabel(match.roundName, match.matchName)

    return (
        <StreamPlate form="plate" size={size} sx={{display: 'inline-flex', maxWidth: '80em'}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: '1.1em', px: '1.5em', py: '0.85em', minWidth: 0}}>
                <Box sx={{fontSize: '1.2em', flexShrink: 0}}>
                    <StreamTag label={t('event.stream.nextUp')} />
                </Box>
                <Typography
                    component="div"
                    noWrap
                    sx={{
                        fontFamily: STREAM_DISPLAY_FONT,
                        fontWeight: 700,
                        fontSize: '2.7em',
                        lineHeight: 1.1,
                        minWidth: 0,
                    }}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography
                        component="div"
                        noWrap
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 600,
                            fontSize: '1.6em',
                            lineHeight: 1.1,
                            color: STREAM_PLATE.muted,
                            minWidth: 0,
                            flexShrink: 3,
                        }}>
                        {subtitle}
                    </Typography>
                )}
                {match.startTime && (
                    <Typography
                        component="div"
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 600,
                            fontSize: '1.9em',
                            lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                            pl: '1em',
                            borderLeft: `1px solid ${STREAM_PLATE.divider}`,
                            flexShrink: 0,
                        }}>
                        {format(new Date(match.startTime), t('format.time'))}
                    </Typography>
                )}
            </Box>
        </StreamPlate>
    )
}

export default StreamNextUp
