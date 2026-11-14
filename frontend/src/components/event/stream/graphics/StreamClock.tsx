import {useEffect, useRef, useState} from 'react'
import {Box, Typography} from '@mui/material'
import PauseIcon from '@mui/icons-material/Pause'
import {useTranslation} from 'react-i18next'
import {AthleteBoardMatch, StreamGraphicSize} from '@api/types.gen'
import {formatCountdown, formatElapsed, streamClockState} from '../../board/streamClock.ts'
import {competitionLabel} from '../../board/streamOverlay/streamDisplay.ts'
import StreamPlate from './design/StreamPlate.tsx'
import {STREAM_DISPLAY_FONT, STREAM_PLATE, useStreamAccent} from './design/streamTheme.ts'

interface StreamClockProps {
    match: AthleteBoardMatch
    /** Anker der laufenden Startsequenz — null/fehlend, solange keine läuft. */
    sequenceStartedAt?: string | null
    /** Zeitpunkt, an dem der Start tatsächlich fällt (Anker + Vorlauf) — dahin zählt der
     *  Countdown herunter. Ohne ihn zeigt die Uhr während der Sequenz lieber nichts, siehe
     *  `streamClockState`-KDoc. */
    sequenceFiresAt?: string | null
    /** Beginn der laufenden Pause der Sequenz — nur gesetzt, solange sie angehalten ist.
     *  Friert den Countdown auf dem Reststand des Pausenbeginns ein (`streamClockState`). */
    sequencePausedAt?: string | null
    clockOffsetMs: number
    size: StreamGraphicSize
}

type ClockPhase = 'countdown' | 'running' | 'frozen'

/**
 * CLOCK: zählt bereits während der Startsequenz auf `sequenceFiresAt` HERUNTER und wechselt
 * beim gestempelten Start (`match.actualStartTime`) nahtlos auf die positive Laufzeit —
 * dieselbe reine Zustandsfunktion `streamClockState` wie die Board-Kachel. Über den Ziffern
 * steht, was sie zeigen („Start in" / „Rennzeit" / „Pause"), rechts davon das Wettkampfkürzel.
 *
 * Antrieb per `requestAnimationFrame` statt Intervall: Der Loop berechnet bei JEDEM Frame den
 * Anzeigetext neu, setzt den React-State aber NUR, wenn sich der TEXT tatsächlich ändert.
 *
 * ZUSÄTZLICH ein grobes `setInterval` (250 ms) als Fallback: Browser setzen
 * `requestAnimationFrame` in einem verdeckten Dokument aus — genau der Zustand, den eine
 * Wirecast/CEF-Aufnahmequelle dauerhaft melden kann, obwohl sie aktiv aufnimmt. Ohne den
 * Fallback fröre die Uhr in genau diesem Fall ein, obwohl frische Pushes ankommen. Beide
 * Antriebe rufen denselben `tick` auf und schreiben nur über denselben Text-Vergleich.
 *
 * `match`/Sequenzfelder/`clockOffsetMs` reisen als Refs in den Loop: Der Loop startet nur neu,
 * wenn `match.matchId` wechselt — nicht bei jedem Push mit fortschreitenden Zwischenständen.
 * Ein Neustart bei JEDER Match-Aktualisierung würde außerdem den Einfrier-Ref fälschlich
 * zurücksetzen.
 *
 * Einfrieren: `streamClockState` ist rein und kennt keine Historie — ihr RÜCKFALL-Wert im
 * `frozen`-Fall (keine parsebare Bootszeit, `anchored: false`) liefe bei fortschreitender Zeit
 * weiter. Nur dieser wird in einem Ref festgehalten; der aus den Bootszeiten abgeleitete Wert
 * (`anchored: true`) wird bei jedem Tick neu genommen, damit eine korrigierte Zielzeit
 * (6:06.8 → 6:10.0) auch die Uhr erreicht. Verlässt die Uhr die Phase `frozen` (Wertung
 * zurückgenommen, neuer Lauf), fällt der Ref weg.
 */
const StreamClock = ({
    match,
    sequenceStartedAt,
    sequenceFiresAt,
    sequencePausedAt,
    clockOffsetMs,
    size,
}: StreamClockProps) => {
    const {t} = useTranslation()
    const accent = useStreamAccent()
    const [text, setText] = useState<string | null>(null)
    const [phase, setPhase] = useState<ClockPhase>('running')
    // Pausiert muss man auch im Stream SEHEN, nicht nur am stehenden Zahlenwert erraten —
    // eine eingefrorene Ziffer allein ist von einer hängenden Quelle nicht zu unterscheiden.
    const [paused, setPaused] = useState(false)

    const matchRef = useRef(match)
    matchRef.current = match
    const sequenceStartedAtRef = useRef(sequenceStartedAt)
    sequenceStartedAtRef.current = sequenceStartedAt
    const sequenceFiresAtRef = useRef(sequenceFiresAt)
    sequenceFiresAtRef.current = sequenceFiresAt
    const sequencePausedAtRef = useRef(sequencePausedAt)
    sequencePausedAtRef.current = sequencePausedAt
    const clockOffsetRef = useRef(clockOffsetMs)
    clockOffsetRef.current = clockOffsetMs

    const frozenElapsedMsRef = useRef<number | null>(null)
    const lastTextRef = useRef<string | null>(null)
    const lastPausedRef = useRef(false)
    const lastPhaseRef = useRef<ClockPhase>('running')

    useEffect(() => {
        frozenElapsedMsRef.current = null
        lastTextRef.current = null
        lastPausedRef.current = false
        lastPhaseRef.current = 'running'
        setText(null)
        setPaused(false)
        setPhase('running')

        // Reine Berechnung + Text-Vergleich, OHNE sich selbst neu einzuplanen — das bleibt
        // Sache der beiden Antriebe unten.
        const tick = () => {
            const state = streamClockState(
                matchRef.current,
                Date.now(),
                clockOffsetRef.current,
                sequenceStartedAtRef.current,
                sequenceFiresAtRef.current,
                sequencePausedAtRef.current,
            )

            if (state.phase !== 'frozen') frozenElapsedMsRef.current = null

            let next: string | null
            let nextPhase: ClockPhase = 'running'
            switch (state.phase) {
                case 'countdown':
                    next = formatCountdown(state.remainingMs)
                    nextPhase = 'countdown'
                    break
                case 'running':
                    next = formatElapsed(state.elapsedMs)
                    break
                case 'frozen':
                    if (state.anchored) {
                        frozenElapsedMsRef.current = null
                        next = formatElapsed(state.elapsedMs)
                    } else {
                        frozenElapsedMsRef.current ??= state.elapsedMs
                        next = formatElapsed(frozenElapsedMsRef.current)
                    }
                    nextPhase = 'frozen'
                    break
                default:
                    next = null
            }

            if (next !== lastTextRef.current) {
                lastTextRef.current = next
                setText(next)
            }
            if (nextPhase !== lastPhaseRef.current) {
                lastPhaseRef.current = nextPhase
                setPhase(nextPhase)
            }
            const nextPaused = state.phase === 'countdown' && state.paused
            if (nextPaused !== lastPausedRef.current) {
                lastPausedRef.current = nextPaused
                setPaused(nextPaused)
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

    const caption = paused
        ? t('event.stream.clock.paused')
        : phase === 'countdown'
          ? t('event.stream.clock.countdown')
          : t('event.stream.clock.running')
    // Die Akzentkante kippt pausiert auf die Warnfarbe — dieselbe Sprache wie der
    // Startbildschirm, ohne Blinken (auf einer Sendebühne wäre das unruhiger als informativ).
    const edgeColor = paused ? STREAM_PLATE.warning : accent.main

    return (
        <StreamPlate form="plate" size={size} sx={{display: 'inline-flex', flexDirection: 'row'}}>
            <Box sx={{width: '0.6em', flexShrink: 0, backgroundColor: edgeColor}} />
            <Box sx={{px: '1.5em', py: '0.8em', display: 'flex', flexDirection: 'column', gap: '0.2em', minWidth: '13em'}}>
                <Box sx={{display: 'flex', alignItems: 'center', gap: '0.8em'}}>
                    <Typography
                        component="span"
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3em',
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 700,
                            fontSize: '1.3em',
                            lineHeight: 1,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            color: paused ? STREAM_PLATE.warning : STREAM_PLATE.muted,
                        }}>
                        {paused && <PauseIcon sx={{fontSize: '1.2em'}} />}
                        {caption}
                    </Typography>
                    <Typography
                        component="span"
                        noWrap
                        sx={{
                            fontFamily: STREAM_DISPLAY_FONT,
                            fontWeight: 600,
                            fontSize: '1.3em',
                            lineHeight: 1,
                            letterSpacing: '0.03em',
                            color: STREAM_PLATE.muted,
                            ml: 'auto',
                            maxWidth: '14em',
                        }}>
                        {competitionLabel(match.competitionName, match.competitionShortName, true)}
                    </Typography>
                </Box>
                <Typography
                    component="div"
                    sx={{
                        fontWeight: 700,
                        fontSize: '4.8em',
                        lineHeight: 1.05,
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: '-0.01em',
                    }}>
                    {text}
                </Typography>
            </Box>
        </StreamPlate>
    )
}

export default StreamClock
