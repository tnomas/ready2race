import {Box, Chip, IconButton, Stack, Typography} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import WifiIcon from '@mui/icons-material/Wifi'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import {ReactNode, useEffect, useRef} from 'react'
import {useTranslation} from 'react-i18next'
import {TimingStationType} from '@api/types.gen.ts'
import {ClockQuality} from '@utils/timing/serverClock.ts'
import {scaledFontSize} from '@utils/timing/startDisplayRender.ts'
import {TimingWsStatus} from '@utils/timing/useTimingWebSocket.ts'

type WsChipColor = 'success' | 'warning' | 'error' | 'default'

const WS_STATUS_COLOR: Record<TimingWsStatus, WsChipColor> = {
    OPEN: 'success',
    CONNECTING: 'default',
    RECONNECTING: 'warning',
    UNAUTHORIZED: 'error',
}

type ClockQualityColor = 'success' | 'warning' | 'default'

const CLOCK_QUALITY_COLOR: Record<ClockQuality, ClockQualityColor> = {
    OK: 'success',
    SYNCING: 'default',
    DEGRADED: 'warning',
}

function formatClock(ms: number): string {
    const date = new Date(ms)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const tenths = Math.floor(date.getMilliseconds() / 100)
    return `${hh}:${mm}:${ss}.${tenths}`
}

const CLOCK_PLACEHOLDER = '--:--:--.-'

/** Status-Chip: ab sm mit Text, auf dem Telefon nur das Symbol (siehe Kommentar im Kopf). */
const STATUS_CHIP_SX = {
    '& .MuiChip-label': {display: {xs: 'none', sm: 'block'}},
    // MUI-Vorgabe für kleine Chips: 4px links, -4px rechts — ohne Text mittig setzen.
    '& .MuiChip-icon': {ml: {xs: '6px', sm: '4px'}, mr: {xs: '6px', sm: '-4px'}},
} as const

export type BoardHeaderProps = {
    stationName: string | undefined
    wsStatus: TimingWsStatus
    clockQuality: ClockQuality
    now: () => number | null
    /**
     * Faktor auf die Größe der Uhr (1 = eingebaute Größe). Optional mit Vorgabe 1, weil dieselbe
     * Kopfzeile über den Erfassungsboards und dem Leitstand sitzt: dort gibt es keine
     * Anzeige-Einstellungen, und dort darf sich durch diese Prop nichts ändern. Einstellbar ist
     * die Größe nur auf dem Startbildschirm (Zeitnahme) — die Athleten am Steg lesen hier die
     * offizielle, servergeankerte Uhrzeit ab, und wie groß die sein muss, hängt am Bildschirm und
     * am Abstand, aus dem man darauf schaut.
     */
    clockScale?: number
    /**
     * Zurück zur Postenwahl bzw. zum Betrieb. Fehlt er (geteiltes Gerät mit Geräte-Token, Anzeige),
     * steht links kein Pfeil — es gibt dann kein Ziel, zu dem man zurück könnte.
     */
    onBack?: () => void
    /** Typ des Postens, klein unter dem Namen („Zwischenzeit") — nur auf den Erfassungsboards. */
    stationType?: TimingStationType
    /** Zusätzliche Knöpfe rechts vor dem Status (etwa der Tagesablauf-Öffner auf dem Telefon). */
    actions?: ReactNode
}

/**
 * Fixed board header: station name, a big running wall clock (HH:MM:SS.d) driven by the server
 * clock, a websocket status chip and a clock-sync quality chip.
 *
 * The clock is rendered via a `requestAnimationFrame` loop writing directly into a ref'd element's
 * `textContent` — never via `setState` — so the rest of the board doesn't re-render 60 times a
 * second. `now` is read through a ref updated every render so the loop itself only needs to start
 * once and is cancelled on unmount.
 */
const BoardHeader = ({
    stationName,
    wsStatus,
    clockQuality,
    now,
    clockScale = 1,
    onBack,
    stationType,
    actions,
}: BoardHeaderProps) => {
    const {t} = useTranslation()
    const clockRef = useRef<HTMLSpanElement | null>(null)
    const nowRef = useRef(now)

    useEffect(() => {
        nowRef.current = now
    })

    useEffect(() => {
        let rafId: number

        const tick = () => {
            const ms = nowRef.current()
            if (clockRef.current) {
                clockRef.current.textContent = ms === null ? CLOCK_PLACEHOLDER : formatClock(ms)
            }
            rafId = requestAnimationFrame(tick)
        }

        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
    }, [])

    const typeLabel = stationType ? t(`timing.station.types.${stationType}`) : undefined
    const wsLabel = t(`timing.board.wsStatus.${wsStatus}`)
    const clockLabel = t(`timing.board.clockQuality.${clockQuality}`)

    return (
        <Box
            sx={{
                width: 1,
                px: onBack ? 1 : 2,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                flexShrink: 0,
            }}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                columnGap={{xs: 1, sm: 2}}
                rowGap={0.5}>
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{minWidth: 0}}>
                    {onBack && (
                        <IconButton
                            onClick={onBack}
                            aria-label={t('common.back')}
                            className="cursor-pointer"
                            sx={{width: 48, height: 48}}>
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                    {/* Auf Telefon-Breite schrumpfen Name und Uhr, damit die Kopfzeile nicht auf
                        drei Zeilen umbricht und der Erfassung die Höhe stiehlt. */}
                    <Stack sx={{minWidth: 0}}>
                        <Typography
                            variant="h5"
                            component="span"
                            noWrap
                            sx={{
                                fontSize: {xs: '1.1rem', sm: '1.5rem'},
                                fontWeight: 700,
                                lineHeight: 1.2,
                                minWidth: 0,
                            }}>
                            {stationName ?? ''}
                        </Typography>
                        {/* Nur wenn der Typ etwas verrät: „Ziel" unter „Ziel" wäre Rauschen. */}
                        {stationType && typeLabel !== stationName && (
                            <Typography
                                variant="caption"
                                component="span"
                                color="text.secondary"
                                noWrap
                                sx={{lineHeight: 1.2}}>
                                {typeLabel}
                            </Typography>
                        )}
                    </Stack>
                </Stack>
                <Typography
                    ref={clockRef}
                    component="span"
                    sx={{
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                        // Auf Telefon-Breite etwas kleiner als das Theme-h3 (1.5rem), damit
                        // Name, Uhr und Status-Chips höchstens zweizeilig bleiben. Beide Stufen
                        // gehen durch denselben Faktor, damit die Vergrößerung die
                        // Bildschirmabhängigkeit erhält statt sie zu ersetzen; bei Faktor 1 kommen
                        // exakt diese beiden Werte unverändert heraus.
                        fontSize: {
                            xs: scaledFontSize('1.25rem', clockScale),
                            sm: scaledFontSize('1.5rem', clockScale),
                        },
                    }}
                    variant="h3">
                    {CLOCK_PLACEHOLDER}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    {actions}
                    {/* Auf dem Telefon nur die Symbole in Statusfarbe (Text als aria-label und
                        Tooltip): Störungen meldet ohnehin der Balken darunter im Klartext, die
                        Kopfzeile bleibt dadurch einzeilig. */}
                    <Chip
                        size="small"
                        color={WS_STATUS_COLOR[wsStatus]}
                        icon={wsStatus === 'OPEN' ? <WifiIcon /> : <WifiOffIcon />}
                        label={wsLabel}
                        aria-label={wsLabel}
                        title={wsLabel}
                        sx={STATUS_CHIP_SX}
                    />
                    <Chip
                        size="small"
                        color={CLOCK_QUALITY_COLOR[clockQuality]}
                        icon={<AccessTimeIcon />}
                        label={clockLabel}
                        aria-label={clockLabel}
                        title={clockLabel}
                        sx={STATUS_CHIP_SX}
                    />
                </Stack>
            </Stack>
        </Box>
    )
}

export default BoardHeader
