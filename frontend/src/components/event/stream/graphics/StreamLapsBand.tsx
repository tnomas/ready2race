import {alpha, Box, Stack, Typography, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import {lastLaps} from '../../board/streamOverlay.ts'
import {formatPlaceOrdinal} from '@utils/placeOrdinal.ts'

interface StreamLapsBandProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
}

/** Startversatz eines neu eintreffenden Eintrags — negativ: er kommt von links herein und
 *  schiebt die älteren nach rechts, siehe `board/streamOverlay/LapBand.tsx`. */
const LAP_ENTER_OFFSET = -160

/**
 * LAPS-Bandgrafik: die zuletzt eingetroffenen Zwischenzeiten nebeneinander, neueste links.
 * Nutzt dieselbe Aufbereitung wie das bisherige Chroma-Key-Rundenband (`lastLaps` samt Rang
 * und Tempo), nur in der neuen Karten-Optik statt der alten vollflächig-deckenden.
 */
const StreamLapsBand = ({match, size}: StreamLapsBandProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const compact = size === 'COMPACT'
    const laps = lastLaps(match, compact ? 2 : 3, t('decimal.point'))

    // Keine erfundene Zwischenzeit: ohne eingetroffenen Eintrag zeigt das Band nichts.
    if (laps.length === 0) return null

    return (
        <Stack
            direction="row"
            sx={{
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.5)',
                backgroundColor: alpha(theme.palette.common.black, 0.74),
                backdropFilter: 'blur(6px)',
                color: theme.palette.common.white,
            }}>
            <FlipList
                axis="x"
                enterOffset={LAP_ENTER_OFFSET}
                items={laps}
                // Boot und Marke identifizieren die Zeile eindeutig — der Erfassungszeitpunkt
                // darf nicht in den Schlüssel, sonst gälte jede Runde bei jedem Takt als neuer
                // Eintrag (siehe `board/streamOverlay/LapBand.tsx`).
                keyOf={lap => `${lap.startNumber}-${lap.lapName}`}
                itemStyle={{flex: '1 1 0', minWidth: compact ? '13rem' : '16rem'}}
                render={(lap, index) => (
                    <Box
                        sx={{
                            height: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            px: compact ? 2 : 3,
                            py: compact ? 1.5 : 2,
                            // Akzentrand nur am neuesten (linken) Eintrag.
                            borderLeft:
                                index === 0 ? `0.35rem solid ${theme.palette.primary.main}` : 'none',
                        }}>
                        <Typography
                            variant={compact ? 'h5' : 'h4'}
                            sx={{fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>
                            {lap.startNumber}
                        </Typography>
                        <Box sx={{minWidth: 0, flex: 1}}>
                            <Typography
                                variant={compact ? 'body1' : 'h6'}
                                noWrap
                                sx={{fontWeight: 700}}>
                                {lap.clubsShort ?? lap.clubsFull}
                            </Typography>
                            <Typography variant="body2" noWrap sx={{opacity: 0.85}}>
                                {[
                                    lap.lapName,
                                    lap.rank != null ? formatPlaceOrdinal(lap.rank) : null,
                                    lap.pace,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                        </Box>
                        <Typography
                            variant={compact ? 'h6' : 'h5'}
                            sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>
                            {lap.timeString}
                        </Typography>
                    </Box>
                )}
            />
        </Stack>
    )
}

export default StreamLapsBand
