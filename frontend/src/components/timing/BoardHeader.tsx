import {Box, Chip, Stack, Typography} from '@mui/material'
import {useEffect, useRef} from 'react'
import {useTranslation} from 'react-i18next'
import {ClockQuality} from '@utils/timing/serverClock.ts'
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

export type BoardHeaderProps = {
    stationName: string | undefined
    wsStatus: TimingWsStatus
    clockQuality: ClockQuality
    now: () => number | null
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
const BoardHeader = ({stationName, wsStatus, clockQuality, now}: BoardHeaderProps) => {
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

    return (
        <Box sx={{width: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0}}>
            <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                flexWrap="wrap"
                spacing={2}>
                {/* Auf Telefon-Breite schrumpfen Name und Uhr, damit die Kopfzeile nicht auf
                    drei Zeilen umbricht und der Erfassung die Höhe stiehlt. */}
                <Typography
                    variant="h5"
                    component="span"
                    noWrap
                    sx={{fontSize: {xs: '1.1rem', sm: '1.5rem'}, minWidth: 0}}>
                    {stationName ?? ''}
                </Typography>
                <Typography
                    ref={clockRef}
                    component="span"
                    sx={{
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                        // Auf Telefon-Breite etwas kleiner als das Theme-h3 (1.5rem), damit
                        // Name, Uhr und Status-Chips höchstens zweizeilig bleiben.
                        fontSize: {xs: '1.25rem', sm: '1.5rem'},
                    }}
                    variant="h3">
                    {CLOCK_PLACEHOLDER}
                </Typography>
                <Stack direction="row" spacing={1}>
                    <Chip
                        size="small"
                        color={WS_STATUS_COLOR[wsStatus]}
                        label={t(`timing.board.wsStatus.${wsStatus}`)}
                    />
                    <Chip
                        size="small"
                        color={CLOCK_QUALITY_COLOR[clockQuality]}
                        label={t(`timing.board.clockQuality.${clockQuality}`)}
                    />
                </Stack>
            </Stack>
        </Box>
    )
}

export default BoardHeader
