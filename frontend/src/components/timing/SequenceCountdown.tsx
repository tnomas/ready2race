import {useEffect, useRef} from 'react'
import {Typography} from '@mui/material'
import {SxProps, Theme} from '@mui/material/styles'
import {formatCountdown} from '@utils/timing/sequenceDisplay.ts'
import {playToneStep} from '@utils/timing/feedback.ts'
import {DEFAULT_START_TONE_PLAN, ToneStep, advanceTonePlan} from '@utils/timing/tonePlan.ts'

const COUNTDOWN_PLACEHOLDER = '--:--'

/**
 * Wie weit nach T-0 der Countdown noch `00:00` zeigt, bevor er auf das „läuft"-Label wechselt.
 * Ein kleines Gnadenfenster ist Absicht: der Scheduler feuert innerhalb eines Ticks um T-0, und
 * eine Anzeige, die im Moment des Überschreitens umspringt, würde bei jedem Start flackern.
 * Danach wäre ein eingefrorenes `00:00` eine Lüge — der Start ist passiert (oder der Scheduler
 * hängt) — also sagen wir das stattdessen.
 */
const OVERDUE_GRACE_MILLIS = 2000

export type SequenceCountdownProps = {
    targetMillis: number
    now: () => number | null
    overdueLabel: string
    /**
     * Der Tonplan des aufgelösten Zeitnahmetyps (aufsteigend sortiert, siehe
     * `tonePlanForSequence`); ohne Angabe der eingebaute Standard — so klingt der Countdown
     * unkonfiguriert exakt wie bisher.
     */
    tonePlan?: readonly ToneStep[]
    /** Zusätzliche Stile, z.B. eine größere Schrift für den Startbildschirm (Zeitnahme). */
    sx?: SxProps<Theme>
}

/**
 * Großer rAF-getriebener Countdown auf `targetMillis`, der direkt in das `textContent` eines
 * ref-Elements schreibt (wie die Uhr im `BoardHeader`), damit der Rest der Seite nicht in jedem
 * Frame neu rendert. Feuert außerdem die Countdown-Töne des Tonplans: welcher Ton wann fällig
 * ist (und dass Verpasstes nie nachgeholt wird), entscheidet die reine `advanceTonePlan`-Logik;
 * die Komponente hält nur den Fortschrittszeiger `playedUpToRef`. Der Zeiger wird zurückgesetzt,
 * sobald sich `targetMillis` ändert (im INTERVAL-Modus wandert das Ziel zum nächsten Eintrag,
 * sobald der aktuelle gefeuert hat — jedes Boot bekommt seinen eigenen Plan-Durchlauf).
 *
 * Herausgezogen, damit Startbildschirm (Zeitnahme) und Sequenz-Leiste denselben Countdown
 * zeigt — inklusive Töne, die die Athleten am Start hören sollen.
 */
const SequenceCountdown = ({targetMillis, now, overdueLabel, tonePlan, sx}: SequenceCountdownProps) => {
    const textRef = useRef<HTMLSpanElement | null>(null)
    const nowRef = useRef(now)
    const overdueLabelRef = useRef(overdueLabel)
    const tonePlanRef = useRef<readonly ToneStep[]>(tonePlan ?? DEFAULT_START_TONE_PLAN)
    const playedUpToRef = useRef(-1)

    useEffect(() => {
        nowRef.current = now
        overdueLabelRef.current = overdueLabel
        // Über die Ref statt als Effekt-Abhängigkeit: ein neues Plan-Array (z.B. frischer
        // Fetch mit gleichem Inhalt) darf den Fortschrittszeiger nicht zurücksetzen, sonst
        // wiederholte ein Re-Render bereits gespielte Töne.
        tonePlanRef.current = tonePlan ?? DEFAULT_START_TONE_PLAN
    })

    useEffect(() => {
        playedUpToRef.current = -1
        let rafId: number

        const tick = () => {
            const current = nowRef.current()
            const element = textRef.current
            if (current !== null && element) {
                const remaining = targetMillis - current
                const overdue = remaining < -OVERDUE_GRACE_MILLIS
                const text = overdue ? overdueLabelRef.current : formatCountdown(remaining)
                if (element.textContent !== text) element.textContent = text
                const overdueFlag = overdue ? 'true' : 'false'
                if (element.dataset.overdue !== overdueFlag) element.dataset.overdue = overdueFlag

                const advance = advanceTonePlan(
                    tonePlanRef.current,
                    targetMillis,
                    current,
                    playedUpToRef.current,
                )
                playedUpToRef.current = advance.playedUpTo
                if (advance.play !== null) playToneStep(advance.play)
            }
            rafId = requestAnimationFrame(tick)
        }

        rafId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(rafId)
    }, [targetMillis])

    return (
        <Typography
            ref={textRef}
            component="span"
            variant="h1"
            // MUI-Array-Form, damit aufrufende Seiten eigene Stile ergänzen können, ohne dass wir
            // ein beliebiges SxProps in ein Objekt spreaden müssten (das wäre nicht typsicher).
            sx={[
                {
                    fontFamily: 'monospace',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    '@keyframes sequenceOverduePulse': {
                        '0%': {opacity: 1},
                        '50%': {opacity: 0.4},
                        '100%': {opacity: 1},
                    },
                    '&[data-overdue="true"]': {
                        fontSize: '2.5rem',
                        animation: 'sequenceOverduePulse 1.2s ease-in-out infinite',
                    },
                },
                ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
            ]}>
            {COUNTDOWN_PLACEHOLDER}
        </Typography>
    )
}

export default SequenceCountdown
