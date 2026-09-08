import {useRef} from 'react'
import {Box, Typography, useTheme} from '@mui/material'
import {AthleteBoardMatch, BoardSequenceDto} from '@api/types.gen.ts'
import {formatCountdown, formatElapsed, streamClockState} from '../streamClock.ts'
import {sequenceClockArgs} from '../boardSequence.ts'
import {solidOr} from './streamDisplay.ts'
import useTicker from './useTicker.ts'

interface ClockPlateProps {
    match: AthleteBoardMatch | null
    clockOffsetMs: number
    /** Die aktive Startsequenz der Board-Sicht — die Platte zählt damit vor dem Start von minus hoch. */
    sequence?: BoardSequenceDto | null
}

/**
 * Modus „Nur Laufuhr": eine kompakte, separat croppbare Uhr-Platte unten links —
 * dieselbe Stelle wie das Lower-Third, damit beide Quellen im Zweifel deckungsgleich
 * liegen.
 *
 * Anders als die Uhr im Lower-Third ist diese Platte DAUERHAFT eingeblendet (Wunsch
 * vom 14.08.): vor dem Start steht 0:00.0, während des Laufs tickt sie, mit dem
 * letzten gewerteten Boot friert sie ein und bleibt stehen, bis der nächste Lauf sie
 * wieder auf 0:00.0 zurücksetzt. Kein Fade — die Regie verlässt sich darauf, dass die
 * Quelle immer da ist.
 *
 * Seit dem 02.09.2026 zählt sie wie die Stream-Bandgrafik schon während der Startsequenz auf
 * den Feuerzeitpunkt HERUNTER (`−0:07` … `0:00`) und wechselt mit dem gestempelten Start auf
 * die Laufzeit — die Sequenz kommt mit der Board-Sicht (`BoardViewDto.sequence`), ein
 * Zeitnahme-Kanal steht der Kachel nicht offen. Pausiert steht der Reststand.
 */
const ClockPlate = ({match, clockOffsetMs, sequence}: ClockPlateProps) => {
    const theme = useTheme()
    const args = sequenceClockArgs({sequence}, match)
    const clockState = (atMs: number) =>
        streamClockState(match, atMs, clockOffsetMs, args.startedAt, args.firesAt, args.pausedAt)
    // Der 100-ms-Tick läuft nur, solange die Uhr wirklich zählt — eingefroren, pausiert oder
    // wartend genügt der Datenstand des Polls.
    const initial = clockState(Date.now())
    const ticking =
        initial.phase === 'running' || (initial.phase === 'countdown' && !initial.paused)
    const now = useTicker(100, ticking)
    const state = clockState(now)

    // Einfrieren heißt festhalten — aber nur den RÜCKFALL-Wert (keine parsebare Bootszeit,
    // `anchored: false`): streamClockState ist eine reine Funktion, dieser elapsedMs liefe
    // sonst weiter. Der aus den Bootszeiten abgeleitete Wert (`anchored: true`) wird jedes Mal
    // neu genommen, damit eine korrigierte Zielzeit auch die Platte erreicht. Verlässt die Uhr
    // die Phase `frozen`, fällt der festgehaltene Wert weg.
    const frozenMs = useRef<number | null>(null)
    if (state.phase === 'frozen' && !state.anchored) {
        frozenMs.current ??= state.elapsedMs
    } else {
        frozenMs.current = null
    }

    const text =
        state.phase === 'countdown'
            ? formatCountdown(state.remainingMs)
            : formatElapsed(
                  state.phase === 'frozen'
                      ? (frozenMs.current ?? state.elapsedMs)
                      : state.phase === 'running'
                        ? state.elapsedMs
                        : 0,
              )

    return (
        <Box sx={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end'}}>
            <Box
                sx={{
                    m: 3,
                    display: 'flex',
                    borderRadius: 2,
                    overflow: 'hidden',
                    backgroundColor: solidOr(theme.palette.text.primary, '#1d1d1d'),
                    color: solidOr(theme.palette.background.paper, '#ffffff'),
                }}>
                <Box
                    sx={{
                        width: '0.6rem',
                        flexShrink: 0,
                        backgroundColor: solidOr(theme.palette.primary.main, '#1976d2'),
                    }}
                />
                <Box sx={{px: 3, py: 1.5}}>
                    <Typography
                        variant="h2"
                        sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>
                        {text}
                    </Typography>
                </Box>
            </Box>
        </Box>
    )
}

export default ClockPlate
