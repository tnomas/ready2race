import {useCallback, useEffect, useRef} from 'react'
import {CaptureToneDto, TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {playToneStep} from '@utils/timing/feedback.ts'
import {
    AttemptRetractedInfo,
    falseStartSuppressMillis,
    isAttemptRetractionFalseStart,
    isSequenceAbortFalseStart,
    shouldPlayFalseStart,
} from '@utils/timing/falseStart.ts'

/**
 * Spielt den konfigurierten Fehlstart-Ton auf einem Board (Start-Board oder Startbildschirm),
 * wenn eine der beiden Fehlstart-Gesten die GERADE geführte Sequenz trifft — die Bedingungen
 * selbst sind reine Funktionen in `falseStart.ts`, hier hängen nur die zwei Auslöser dran:
 *
 * - der Übergang RUNNING → ABORTED der eigenen Sequenz (beobachtet am `sequence`-Prop, das die
 *   `sequenceChanged`-Nachrichten bereits einspielt), und
 * - die `attemptRetracted`-Nachricht (der zurückgegebene Callback gehört in
 *   `useTimingBoardState`s gleichnamigen Parameter).
 *
 * Nie-nachholen-Regel: ein verdeckter Tab bleibt still (`document.visibilityState`-Prüfung im
 * Moment des Auslösers — WebSocket-Nachrichten kommen auch im Hintergrund an, und ein Fehlstart
 * von vor Minuten darf beim Zurückkehren nicht plötzlich hupen). Doppelte Auslöser in kurzer
 * Folge (Abbrechen + Zurücknehmen im Neustart-Griff) entprellt das Sperrfenster der
 * Gesamtklanglänge. iOS-Entsperrung wie bei allen Board-Tönen: `playToneStep` ist best-effort
 * und bleibt stumm, solange keine Geste den AudioContext entsperrt hat.
 */
export function useFalseStartTone(
    sequence: TimingSequenceDto | undefined,
    matches: readonly TimingMatchDto[],
    tone: CaptureToneDto,
): {onAttemptRetracted: (info: AttemptRetractedInfo) => void} {
    /** Der jeweils aktuelle Stand für die Callbacks — Nachrichten dürfen nie Altes sehen. */
    const sequenceRef = useRef(sequence)
    const matchesRef = useRef(matches)
    const toneRef = useRef(tone)
    useEffect(() => {
        matchesRef.current = matches
        toneRef.current = tone
    })

    const lastPlayedAtRef = useRef<number | null>(null)

    const tryPlay = useCallback(() => {
        // Nie nachholen: verdeckter Tab bleibt still — auch für Nachrichten, die im Hintergrund
        // eintrafen und deren Anlass beim Sichtbarwerden längst vorbei ist.
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (!shouldPlayFalseStart(lastPlayedAtRef.current, now, falseStartSuppressMillis(toneRef.current))) {
            return
        }
        lastPlayedAtRef.current = now
        playToneStep(toneRef.current)
    }, [])

    // Geste 1: Abbruch der laufenden Sequenz. Der Vergleich läuft gegen den Stand VOR diesem
    // Render (sequenceRef), damit genau der Übergang zählt und nicht der neue Zustand allein.
    useEffect(() => {
        const prev = sequenceRef.current
        sequenceRef.current = sequence
        if (sequence !== undefined && isSequenceAbortFalseStart(prev, sequence)) {
            tryPlay()
        }
    }, [sequence, tryPlay])

    // Geste 2: Versuchs-Rücknahme — nur wenn sie die gerade geführte Sequenz betrifft.
    const onAttemptRetracted = useCallback(
        (info: AttemptRetractedInfo) => {
            if (isAttemptRetractionFalseStart(info, matchesRef.current, sequenceRef.current)) {
                tryPlay()
            }
        },
        [tryPlay],
    )

    return {onAttemptRetracted}
}
