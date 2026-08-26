import {useCallback, useEffect, useRef} from 'react'
import {ToneStepDto, TimingMatchDto, TimingSequenceDto} from '@api/types.gen.ts'
import {playToneSequence} from '@utils/timing/feedback.ts'
import {sequenceSchedule} from '@utils/timing/tonePlan.ts'
import {
    AttemptRetractedInfo,
    falseStartSuppressMillis,
    falseStartToneForSequence,
    isAttemptRetractionFalseStart,
    isSequenceAbortFalseStart,
    shouldPlayFalseStart,
} from '@utils/timing/falseStart.ts'

/**
 * Spielt die konfigurierte Fehlstart-FOLGE auf einem Board (Start-Board oder Startbildschirm),
 * wenn eine der beiden Fehlstart-Gesten die GERADE geführte Sequenz trifft — die Bedingungen
 * selbst sind reine Funktionen in `falseStart.ts`, hier hängen nur die zwei Auslöser dran:
 *
 * - der Übergang RUNNING → ABORTED der eigenen Sequenz (beobachtet am `sequence`-Prop, das die
 *   `sequenceChanged`-Nachrichten bereits einspielt), und
 * - die `attemptRetracted`-Nachricht (der zurückgegebene Callback gehört in
 *   `useTimingBoardState`s gleichnamigen Parameter).
 *
 * Gespielt wird die GANZE Folge: die Zeitpunkte gehen als Vorlauf an die WebAudio-Uhr
 * ([playToneSequence]), nicht an eine `setTimeout`-Kaskade — das Raster eines „kurz-kurz-lang"
 * hält damit auch, wenn der Haupt-Thread gerade beschäftigt ist. Eine einmal angemeldete Folge
 * läuft durch; das ist beim Rückruf gewollt.
 *
 * WELCHE Folge gespielt wird, entscheidet die geführte Partie: Seit dem 26.08.2026 gehören die
 * Töne zum Zeitnahmetyp ([falseStartToneForSequence]), nicht mehr zur Veranstaltung — [defaultTone]
 * ist nur noch der Rückfall für eine Sequenz ohne auffindbare Partie oder ohne Zeitnahmetyp.
 *
 * Nie-nachholen-Regel: ein verdeckter Tab bleibt still (`document.visibilityState`-Prüfung im
 * Moment des Auslösers — WebSocket-Nachrichten kommen auch im Hintergrund an, und ein Fehlstart
 * von vor Minuten darf beim Zurückkehren nicht plötzlich hupen). Doppelte Auslöser in kurzer
 * Folge (Abbrechen + Zurücknehmen im Neustart-Griff) entprellt das Sperrfenster der Gesamtlänge
 * der FOLGE. iOS-Entsperrung wie bei allen Board-Tönen: das Abspielen ist best-effort und bleibt
 * stumm, solange keine Geste den AudioContext entsperrt hat.
 */
export function useFalseStartTone(
    sequence: TimingSequenceDto | undefined,
    matches: readonly TimingMatchDto[],
    defaultTone: ReadonlyArray<ToneStepDto>,
): {onAttemptRetracted: (info: AttemptRetractedInfo) => void} {
    /** Der jeweils aktuelle Stand für die Callbacks — Nachrichten dürfen nie Altes sehen. */
    const sequenceRef = useRef(sequence)
    const matchesRef = useRef(matches)
    const defaultToneRef = useRef(defaultTone)
    useEffect(() => {
        matchesRef.current = matches
        defaultToneRef.current = defaultTone
    })

    const lastPlayedAtRef = useRef<number | null>(null)

    const tryPlay = useCallback(() => {
        // Nie nachholen: verdeckter Tab bleibt still — auch für Nachrichten, die im Hintergrund
        // eintrafen und deren Anlass beim Sichtbarwerden längst vorbei ist.
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        // Erst jetzt auflösen, nicht beim Rendern: Der Rückruf gehört dem Lauf, der im Moment der
        // Geste geführt wird, und sequenceRef trägt genau diesen Stand.
        const tone = falseStartToneForSequence(
            matchesRef.current,
            sequenceRef.current,
            defaultToneRef.current,
        )
        // Das Sperrfenster misst DIESE Folge — ein Typ mit langem Rückruf entprellt länger als
        // einer mit kurzem.
        if (!shouldPlayFalseStart(lastPlayedAtRef.current, now, falseStartSuppressMillis(tone))) {
            return
        }
        lastPlayedAtRef.current = now
        playToneSequence(sequenceSchedule(tone))
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
