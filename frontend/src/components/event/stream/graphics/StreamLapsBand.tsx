import {Box, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import {lastLaps} from '../../board/streamOverlay.ts'
import {formatPlaceOrdinal} from '@utils/placeOrdinal.ts'
import StreamPlate from './design/StreamPlate.tsx'
import {collapseClubChain, LAPS_CHAIN_MAX_LINKS} from './design/streamText.ts'
import {STREAM_DISPLAY_FONT, STREAM_PLATE, useStreamAccent} from './design/streamTheme.ts'

interface StreamLapsBandProps {
    match: AthleteBoardMatch
    size: StreamGraphicSize
}

/** Startversatz eines neu eintreffenden Eintrags — negativ: er kommt von links herein und
 *  schiebt die älteren nach rechts, siehe `board/streamOverlay/LapBand.tsx`. */
const LAP_ENTER_OFFSET = -160

/**
 * LAPS: die zuletzt eingetroffenen Zwischenzeiten nebeneinander, neueste links mit
 * Akzentkante. Jede Karte: Startnummer groß, Verein, darunter Marke · Rang · Tempo, rechts die
 * Zeit. Nutzt dieselbe Aufbereitung wie das frühere Rundenband (`lastLaps` samt Rang und Tempo).
 * Schmalste Form: Vereinsketten werden auf das erste Glied zusammengezogen („A +1").
 */
const StreamLapsBand = ({match, size}: StreamLapsBandProps) => {
    const {t} = useTranslation()
    const accent = useStreamAccent()
    const compact = size === 'COMPACT'
    const laps = lastLaps(match, compact ? 2 : 3, t('decimal.point'))

    // Keine erfundene Zwischenzeit: ohne eingetroffenen Eintrag zeigt das Band nichts.
    if (laps.length === 0) return null

    return (
        <StreamPlate form="plate" size={size} sx={{flexDirection: 'row', display: 'inline-flex'}}>
            <FlipList
                axis="x"
                enterOffset={LAP_ENTER_OFFSET}
                items={laps}
                // Boot und Marke identifizieren die Zeile eindeutig — der Erfassungszeitpunkt
                // darf nicht in den Schlüssel, sonst gälte jede Runde bei jedem Takt als neuer
                // Eintrag (siehe `board/streamOverlay/LapBand.tsx`).
                keyOf={lap => `${lap.startNumber}-${lap.lapName}`}
                itemStyle={{flex: '1 1 0', minWidth: '26em', maxWidth: '34em'}}
                render={(lap, index) => (
                    <Box
                        sx={{
                            height: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.9em',
                            px: '1.2em',
                            py: '0.8em',
                            // Akzentkante am neuesten (linken) Eintrag; alle weiteren eine
                            // Haarlinie — ohne sie klebte die Zeit eines Eintrags optisch an der
                            // Startnummer des nächsten und las sich als dessen Zeit.
                            borderLeft: index === 0 ? `0.4em solid ${accent.main}` : `1px solid ${STREAM_PLATE.divider}`,
                        }}>
                        <Typography
                            component="span"
                            sx={{
                                fontFamily: STREAM_DISPLAY_FONT,
                                fontWeight: 700,
                                fontSize: '2.6em',
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0,
                                minWidth: '1.2em',
                                textAlign: 'center',
                            }}>
                            {lap.startNumber}
                        </Typography>
                        <Box sx={{minWidth: 0, flex: 1}}>
                            <Typography
                                component="div"
                                noWrap
                                sx={{fontWeight: 700, fontSize: '1.4em', lineHeight: 1.2}}>
                                {collapseClubChain(lap.clubsShort ?? lap.clubsFull, LAPS_CHAIN_MAX_LINKS)}
                            </Typography>
                            <Typography
                                component="div"
                                noWrap
                                sx={{
                                    fontFamily: STREAM_DISPLAY_FONT,
                                    fontWeight: 600,
                                    fontSize: '1.05em',
                                    lineHeight: 1.2,
                                    letterSpacing: '0.03em',
                                    color: STREAM_PLATE.muted,
                                }}>
                                {[lap.lapName, lap.rank != null ? formatPlaceOrdinal(lap.rank) : null, lap.pace]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </Typography>
                        </Box>
                        <Typography
                            component="span"
                            sx={{
                                fontWeight: 700,
                                fontSize: '1.9em',
                                lineHeight: 1,
                                fontVariantNumeric: 'tabular-nums',
                                flexShrink: 0,
                            }}>
                            {lap.timeString}
                        </Typography>
                    </Box>
                )}
            />
        </StreamPlate>
    )
}

export default StreamLapsBand
