import {alpha, Box, Stack, Typography, useTheme} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {StreamFinishEntry, StreamGraphicSize} from '@api/types.gen'
import FlipList from '../../board/FlipList.tsx'
import StreamStateBadge from '../../board/streamOverlay/StreamStateBadge.tsx'
import {byNullsLast} from '../../board/streamOverlay/streamDisplay.ts'

interface StreamFinishTickerProps {
    entries: StreamFinishEntry[]
    size: StreamGraphicSize
}

/** Startversatz eines neu eintreffenden Einlaufs — positiv: die neue Zeile schiebt sich von
 *  unten in die wachsende Liste herein (siehe `FlipList`-KDoc, Fall „neuer Schlüssel"). */
const ENTRY_ENTER_OFFSET = 32

/**
 * FINISH_TICKER-Bandgrafik: kompakte, dauerhaft stehende Liste der Boote in Einlaufreihenfolge
 * — wächst mit jedem neuen Zieleinlauf (Einschub-Animation über `FlipList`), kein eigenes
 * Auto-Out: `GraphicFrame` blendet nur aus, wenn der Server selbst `visible=false` pusht
 * (Klärung/Szenenwechsel), nicht nach einer festen Anzeigedauer wie STARTLIST/LAPS/RESULT.
 *
 * Anders als die übrigen Bandgrafiken mit Bootsliste (Startliste, Ergebnis) steckt hier KEIN
 * `FitToHeight`/feste Maximalhöhe dahinter: Die Liste soll mit jedem Einlauf sichtbar WACHSEN,
 * nicht in eine vorgegebene Höhe hineinschrumpfen.
 *
 * Sortiert defensiv nach `rank` (`byNullsLast`) statt der rohen Array-Reihenfolge zu
 * vertrauen — der Server liefert laut Vertrag zwar schon Einlaufreihenfolge, die
 * Positionsanimation von `FlipList` bleibt aber nur dann über mehrere Pushes hinweg
 * korrekt, wenn die Zeilenfolge hier zusätzlich abgesichert ist.
 */
const StreamFinishTicker = ({entries, size}: StreamFinishTickerProps) => {
    const {t} = useTranslation()
    const theme = useTheme()
    const compact = size === 'COMPACT'
    const sorted = [...entries].sort(byNullsLast(entry => entry.rank))

    // Kein erfundener Einlauf: ohne Eintrag zeigt der Ticker nichts (wie `StreamLapsBand`
    // bei leerer Rundenliste).
    if (sorted.length === 0) return null

    return (
        <Box
            sx={{
                width: compact ? 'min(20rem, 32vw)' : 'min(26rem, 38vw)',
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.5)',
                backgroundColor: alpha(theme.palette.common.black, 0.74),
                color: theme.palette.common.white,
            }}>
            {/* Akzentbalken oben — dieselbe Geste wie `StreamBandShell`. */}
            <Box
                sx={{
                    height: compact ? '0.35rem' : '0.5rem',
                    backgroundColor: theme.palette.primary.main,
                }}
            />
            <Stack sx={{p: compact ? 1.5 : 2, gap: 0.75}}>
                <Box sx={{px: 0.5}}>
                    <StreamStateBadge label={t('event.stream.finishTicker')} />
                </Box>
                <FlipList
                    items={sorted}
                    keyOf={entry => String(entry.startNumber)}
                    enterOffset={ENTRY_ENTER_OFFSET}
                    render={entry => (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                px: compact ? 1 : 1.5,
                                py: compact ? 0.5 : 0.75,
                            }}>
                            <Typography
                                variant={compact ? 'body1' : 'h6'}
                                sx={{
                                    fontWeight: 800,
                                    fontVariantNumeric: 'tabular-nums',
                                    width: '1.75rem',
                                    flexShrink: 0,
                                }}>
                                {entry.rank}
                            </Typography>
                            <Typography
                                variant={compact ? 'body1' : 'h6'}
                                sx={{
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                    width: '2.25rem',
                                    flexShrink: 0,
                                    opacity: 0.85,
                                }}>
                                {entry.startNumber}
                            </Typography>
                            <Typography
                                variant={compact ? 'body2' : 'body1'}
                                noWrap
                                sx={{flex: 1, minWidth: 0, fontWeight: 600}}>
                                {entry.clubsShort ?? entry.clubsFull}
                            </Typography>
                            <Typography
                                variant={compact ? 'body1' : 'h6'}
                                sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0}}>
                                {entry.timeString}
                            </Typography>
                        </Box>
                    )}
                />
            </Stack>
        </Box>
    )
}

export default StreamFinishTicker
