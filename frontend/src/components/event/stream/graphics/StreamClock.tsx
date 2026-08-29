import {useEffect, useRef, useState} from 'react'
import {alpha, Box, Typography, useTheme} from '@mui/material'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import {formatCountdown, formatElapsed, streamClockState} from '../../board/streamClock.ts'

interface StreamClockProps {
    match: AthleteBoardMatch
    /** Countdown-Anker der laufenden Startsequenz — null/fehlend, solange keine läuft. */
    sequenceStartedAt?: string | null
    clockOffsetMs: number
    size: StreamGraphicSize
}

/**
 * CLOCK-Bandgrafik: zählt bereits während der Startsequenz negativ ab `sequenceStartedAt`
 * und wechselt beim gestempelten Start (`match.actualStartTime`) nahtlos auf die positive
 * Laufzeit — dieselbe reine Zustandsfunktion `streamClockState` wie die Board-Kachel
 * (`board/streamOverlay/ClockPlate.tsx`), nur additiv um den Countdown-Fall erweitert
 * (siehe deren KDoc in `streamClock.ts`).
 *
 * Antrieb per `requestAnimationFrame` statt Intervall (Vorgabe der Aufgabe): Eine
 * mehrstündige OBS-Session soll nicht durch einen tickenden `setInterval` am Leben
 * gehalten werden, der stur weiterläuft, selbst wenn niemand hinschaut. Der rAF-Loop
 * berechnet bei JEDEM Frame den Anzeigetext neu, setzt den React-State aber NUR, wenn
 * sich der TEXT tatsächlich ändert (Sekunden- bzw. Zehntelsekundentakt je nach Phase,
 * nicht bei jedem Frame) — kein Re-Render, kein DOM-Schreiben, solange der sichtbare
 * Text gleich bleibt.
 *
 * ZUSÄTZLICH ein grobes `setInterval` (250 ms) als Fallback: Browser (allen voran Chrome)
 * setzen `requestAnimationFrame` in einem verdeckten Dokument aus — genau der Zustand, den
 * eine Wirecast/CEF-Aufnahmequelle dauerhaft melden kann, obwohl sie aktiv aufnimmt (siehe
 * `useStreamSceneSocket`, das aus demselben Grund keine Sichtbarkeits-Bedingung mehr kennt).
 * Ohne den Fallback fröre die Uhr in genau diesem Fall ein, obwohl frische Pushes ankommen.
 * Beide Antriebe rufen denselben `tick` auf und schreiben nur über denselben Text-Vergleich —
 * nebeneinander also harmlos, keiner der beiden plant den anderen neu.
 *
 * `match`/`sequenceStartedAt`/`clockOffsetMs` reisen als Refs in den Loop hinein: der
 * Loop selbst startet nur neu, wenn `match.matchId` wechselt (ein neuer Lauf, neuer
 * Zeitanker) — nicht bei jedem Push mit fortschreitenden Zwischenständen desselben
 * Laufs. Ein Neustart bei JEDER Match-Aktualisierung würde außerdem den Einfrier-Ref
 * unten fälschlich zurücksetzen.
 *
 * Einfrieren wie bei `ClockPlate`: `streamClockState` ist rein und kennt keine
 * Historie — ihr `elapsedMs` liefe im `frozen`-Fall bei fortschreitender Zeit einfach
 * weiter (siehe deren KDoc). Der erste eingefrorene Wert wird deshalb in einem Ref
 * festgehalten und danach nicht mehr aus der Funktion übernommen, bis ein neuer Lauf
 * (neue `matchId`) den Ref zurücksetzt.
 */
const StreamClock = ({match, sequenceStartedAt, clockOffsetMs, size}: StreamClockProps) => {
    const theme = useTheme()
    const compact = size === 'COMPACT'
    const [text, setText] = useState<string | null>(null)

    // Immer der jüngste Stand fürs Innere des Loops — Zuweisung während des Renderns ist
    // das etablierte React-Muster für einen "letzter Wert"-Ref ohne eigenen Effekt dafür.
    const matchRef = useRef(match)
    matchRef.current = match
    const sequenceStartedAtRef = useRef(sequenceStartedAt)
    sequenceStartedAtRef.current = sequenceStartedAt
    const clockOffsetRef = useRef(clockOffsetMs)
    clockOffsetRef.current = clockOffsetMs

    const frozenElapsedMsRef = useRef<number | null>(null)
    const lastTextRef = useRef<string | null>(null)

    useEffect(() => {
        frozenElapsedMsRef.current = null
        lastTextRef.current = null
        setText(null)

        // Reine Berechnung + Text-Vergleich, OHNE sich selbst neu einzuplanen — das bleibt
        // Sache der beiden Antriebe unten. Nur so bleiben rAF-Loop und Intervall-Fallback
        // unabhängig voneinander, statt sich bei jedem manuellen Aufruf gegenseitig weitere,
        // nie wieder eingefangene rAF-Ketten aufzuzwingen.
        const tick = () => {
            const state = streamClockState(
                matchRef.current,
                Date.now(),
                clockOffsetRef.current,
                sequenceStartedAtRef.current,
            )

            let next: string | null
            switch (state.phase) {
                case 'countdown':
                    next = formatCountdown(state.elapsedMs)
                    break
                case 'running':
                    next = formatElapsed(state.elapsedMs)
                    break
                case 'frozen':
                    frozenElapsedMsRef.current ??= state.elapsedMs
                    next = formatElapsed(frozenElapsedMsRef.current)
                    break
                default:
                    next = null
            }

            if (next !== lastTextRef.current) {
                lastTextRef.current = next
                setText(next)
            }
        }

        let frameId = requestAnimationFrame(function raf() {
            tick()
            frameId = requestAnimationFrame(raf)
        })
        const intervalId = window.setInterval(tick, 250)

        return () => {
            cancelAnimationFrame(frameId)
            window.clearInterval(intervalId)
        }
    }, [match.matchId])

    if (text === null) return null

    return (
        <Box
            sx={{
                display: 'inline-flex',
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: '0 20px 48px rgba(0, 0, 0, 0.5)',
                backgroundColor: alpha(theme.palette.common.black, 0.74),
                color: theme.palette.common.white,
            }}>
            <Box
                sx={{
                    width: compact ? '0.45rem' : '0.6rem',
                    flexShrink: 0,
                    backgroundColor: theme.palette.primary.main,
                }}
            />
            <Box sx={{px: compact ? 2.5 : 3.5, py: compact ? 1.25 : 1.75}}>
                <Typography
                    variant={compact ? 'h3' : 'h2'}
                    sx={{fontWeight: 700, fontVariantNumeric: 'tabular-nums'}}>
                    {text}
                </Typography>
            </Box>
        </Box>
    )
}

export default StreamClock
