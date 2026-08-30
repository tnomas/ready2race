import {ReactNode} from 'react'
import {alpha, Box, Stack, Typography, useTheme} from '@mui/material'
import {StreamGraphicSize} from '@api/types.gen'
import StreamStateBadge from '../../board/streamOverlay/StreamStateBadge.tsx'

interface StreamBandShellProps {
    size: StreamGraphicSize
    stateLabel: string
    title: string
    roundLine: string | null
    headerTrailing?: ReactNode
    children: ReactNode
}

/**
 * Gemeinsame Karten-Hülle der unten verankerten Bandgrafiken mit Bootsliste (Startliste,
 * Ergebnis) — abgerundet, halbtransparent, weicher Schatten. Auf der Alpha-Bühne (Task 9) ist
 * das jetzt erlaubt; das alte Chroma-Key-Overlay (`board/streamOverlay`) verbot jede
 * Transparenz wegen Farbsäumen beim Keying, dieser Zwang gilt hier nicht mehr.
 *
 * `size` wirkt als Dichte-Unterschied (Abstände, Schriftgröße), keine geometrische Skalierung
 * — ein `transform: scale(...)` müsste zugleich wissen, an welcher Kante der Platz verankert
 * ist (siehe `streamPlacement.ts`), das hier bewusst nicht bekannt ist.
 */
const StreamBandShell = ({
    size,
    stateLabel,
    title,
    roundLine,
    headerTrailing,
    children,
}: StreamBandShellProps) => {
    const theme = useTheme()
    const compact = size === 'COMPACT'

    return (
        <Box
            sx={{
                // Bühnenfeste rem statt vw/vh: Die Bühne ist immer 1920×1080 (120×67,5rem)
                // und wird als Ganzes skaliert — Fenstermaße (vw/vh) ließen die Karte in der
                // Regie-Vorschau anders ausfallen als in der OBS-Quelle. Bewusst großzügig
                // bemessen (Ergebnis/Startliste dürfen einen breiten Teil des Bilds füllen):
                // je mehr natürliche Fläche, desto seltener muss FitToHeight die Zeilen
                // verkleinern und desto lesbarer bleiben die Besatzungsnamen.
                width: compact ? '52rem' : '78rem',
                maxWidth: '100%',
                maxHeight: compact ? '24rem' : '34rem',
                overflow: 'hidden',
                borderRadius: 3,
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.5)',
                backgroundColor: alpha(theme.palette.common.black, 0.74),
                color: theme.palette.common.white,
                display: 'flex',
                flexDirection: 'column',
            }}>
            {/* Akzentbalken oben — dieselbe Geste wie `StreamPanelShell`. */}
            <Box
                sx={{
                    height: compact ? '0.35rem' : '0.5rem',
                    flexShrink: 0,
                    backgroundColor: theme.palette.primary.main,
                }}
            />
            <Stack
                sx={{
                    p: compact ? 2 : 3,
                    gap: compact ? 1 : 1.5,
                    overflow: 'hidden',
                    minHeight: 0,
                }}>
                <Stack direction="row" alignItems="center" gap={2} sx={{flexShrink: 0}}>
                    <StreamStateBadge label={stateLabel} />
                    <Typography
                        variant={compact ? 'h5' : 'h4'}
                        noWrap
                        sx={{fontWeight: 700, minWidth: 0, flex: 1}}>
                        {title}
                    </Typography>
                    {headerTrailing}
                </Stack>
                {roundLine && (
                    <Typography
                        variant={compact ? 'body1' : 'h6'}
                        noWrap
                        sx={{fontWeight: 500, flexShrink: 0}}>
                        {roundLine}
                    </Typography>
                )}
                {children}
            </Stack>
        </Box>
    )
}

export default StreamBandShell
