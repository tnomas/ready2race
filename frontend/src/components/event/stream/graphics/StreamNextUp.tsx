import {alpha, Box, Typography, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import {competitionLabel, roundMatchLabel} from '../../board/streamOverlay/streamDisplay.ts'

interface StreamNextUpProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
}

/**
 * NEXT_UP-Bandgrafik: einzeilig „Als Nächstes: {Wellenname}" — der „Wellenname" ist Wettkampf
 * (Kurzform) und Runde/Lauf, dieselbe Zusammensetzung wie die Kopfzeile der übrigen
 * Bandgrafiken (`competitionLabel` + `roundMatchLabel`), nur zu einem Satz verbunden statt in
 * zwei Zeilen.
 */
const StreamNextUp = ({match, size}: StreamNextUpProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const compact = size === 'COMPACT'

    const wave = [
        competitionLabel(match.competitionName, match.competitionShortName, true),
        roundMatchLabel(match.roundName, match.matchName),
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <Box
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                maxWidth: compact ? '48rem' : '64rem',
                px: compact ? 2.5 : 3.5,
                py: compact ? 1 : 1.5,
                borderRadius: 999,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
                backgroundColor: alpha(theme.palette.common.black, 0.74),
                backdropFilter: 'blur(6px)',
                color: theme.palette.common.white,
            }}>
            <Box
                sx={{
                    width: '0.55rem',
                    height: '0.55rem',
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: theme.palette.primary.main,
                }}
            />
            <Typography
                variant={compact ? 'h6' : 'h5'}
                noWrap
                sx={{fontWeight: 600, minWidth: 0}}>
                {t('event.stream.nextUp', {wave})}
            </Typography>
        </Box>
    )
}

export default StreamNextUp
