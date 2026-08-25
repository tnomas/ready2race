import {
    DEFAULT_CAPTURE_TONE,
    ToneWaveform,
    effectiveReleaseMillis,
    oscillatorType,
    toneGain,
} from '@utils/timing/tonePlan.ts'

let ctx: AudioContext | null = null

// --- Entsperr-Zustand für sichtbare Hinweise -----------------------------------------------------
//
// Gerade auf iOS bleibt WebAudio bis zur ersten Nutzergeste stumm. Eine reine Anzeige (der
// Startbildschirm) wird aber womöglich nie angetippt — dafür gibt es einen sichtbaren Hinweis,
// der wissen muss, OB schon entsperrt wurde. Der Zustand lebt hier beim Kontext-Singleton;
// benachrichtigt wird genau einmal, beim Übergang gesperrt → laufend.
let unlockNotified = false
const unlockListeners = new Set<() => void>()

/** Ob der geteilte `AudioContext` läuft — also Beeps tatsächlich hörbar wären. */
export function isAudioUnlocked(): boolean {
    return ctx !== null && ctx.state === 'running'
}

/** Über das erste erfolgreiche Entsperren informieren lassen; Rückgabe bestellt wieder ab. */
export function subscribeAudioUnlocked(listener: () => void): () => void {
    unlockListeners.add(listener)
    return () => void unlockListeners.delete(listener)
}

function notifyUnlocked() {
    if (unlockNotified) return
    unlockNotified = true
    unlockListeners.forEach(listener => listener())
}

/**
 * Create (and resume) the shared `AudioContext` from inside a user gesture.
 *
 * Browsers only allow an `AudioContext` to leave the `suspended` state from a user-gesture handler.
 * A board that never taps its own capture button — e.g. a second device that only *watches* a
 * sequence someone else started — would therefore stay silent for the countdown beeps, because the
 * first `playCountdownBeep` runs from a `requestAnimationFrame` callback and has no gesture to
 * borrow. So this is wired to a `pointerdown` listener on the sequence panel root (and to the
 * capture button): *any* touch anywhere on the board unlocks audio for the rest of the session.
 *
 * Idempotent and best-effort: no WebAudio, or a context that refuses to resume, must never throw.
 */
export function unlockAudio() {
    try {
        ctx = ctx ?? new AudioContext()
        if (ctx.state === 'suspended') {
            void ctx
                .resume()
                .then(notifyUnlocked)
                .catch(() => {
                    // Entsperren verweigert (keine echte Geste) — der Hinweis bleibt stehen.
                })
        } else if (ctx.state === 'running') {
            notifyUnlocked()
        }
    } catch {
        // audio unavailable — ignore
    }
}

/**
 * Synthesized single tone, fire-and-forget. Silent (never throwing) when audio is unavailable.
 *
 * Zwei ausdrücklich VERSCHIEDENE Hüllkurven, gewählt über `releaseMillis` (siehe
 * [ToneStep.releaseMillis] in `tonePlan.ts` — der Wert ist ein Modellschalter, kein Regler):
 *
 * - „Abfallend" (`releaseMillis` null/nicht gesetzt): Lautstärke 0.2 beim Einsatz, dann
 *   `exponentialRampToValueAtTime` auf 0.0001 (≈ −66 dB — ein >0-Zielwert, weil die exponentielle
 *   Rampe 0 nicht erreichen kann) über die GESAMTE Nenndauer — der Ton ist ein einziges
 *   Abklingen, die Rampe ist zugleich die Anti-Knacks-Rampe am Ende; einen eigenen Attack gab
 *   es nie.
 * - „Gehalten" (`releaseMillis` 0–5000): der Ton hält die Nenndauer voll durch (expliziter
 *   Stütz-Anker bei duration, sonst rampte WebAudio ab dem Einsatz) und fällt erst danach ab —
 *   Gesamtklang = duration + release. Der Abfall dauert nie unter der Mini-Entknackung
 *   ([TONE_HELD_MIN_RELEASE_MILLIS], via [effectiveReleaseMillis]): ein bei voller Lautstärke
 *   gestoppter Oszillator knackte hörbar, und so klingen 0, 1 und 10 ms praktisch gleich —
 *   innerhalb des Modus gibt es keinen Klangsprung.
 *
 * Exponentiell statt linear ist eine Klangentscheidung: das Ohr hört Lautstärke logarithmisch,
 * eine lineare Rampe klänge erst „hängend" und risse am Ende hörbar ab, während die
 * exponentielle gleichmäßig und natürlich ausklingt.
 *
 * Die WELLENFORM (`waveform`, nicht gesetzt = Sinus) ist von der Hüllkurve unabhängig und wird
 * direkt auf den `OscillatorNode` gesetzt. Ihr Spitzen-Gain kommt aus [toneGain] statt fix 0.2:
 * Rechteck/Sägezahn tragen bei gleichem Gain deutlich mehr Energie als der Sinus und klängen
 * sonst erheblich lauter — der feste Formfaktor je Form gleicht das an, damit ein
 * Wellenform-Wechsel im Editor kein Lautstärkesprung ist (Begründung der Werte in `tonePlan.ts`).
 */
function playTone(
    frequency: number,
    durationSeconds: number,
    releaseMillis?: number | null,
    waveform?: ToneWaveform | null,
    /**
     * Vorlauf in Sekunden: 0 = sofort, größer = die WebAudio-Uhr startet den Ton so viel später.
     * Das ist der ganze Trick der Tonfolgen — jeder Ton bekommt seinen Zeitpunkt direkt an den
     * Oszillator statt an ein `setTimeout`, siehe [playToneSequence].
     */
    delaySeconds = 0,
) {
    try {
        unlockAudio()
        if (ctx === null) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = frequency
        osc.type = oscillatorType(waveform)
        const peak = toneGain(waveform)
        // Alle Hüllkurven-Anker hängen an DIESEM Startzeitpunkt, nicht an `currentTime` — sonst
        // liefe die Rampe eines späteren Tons schon ab, bevor er überhaupt klingt.
        const startAt = ctx.currentTime + Math.max(delaySeconds, 0)
        gain.gain.setValueAtTime(peak, startAt)
        const release = effectiveReleaseMillis(releaseMillis)
        if (release !== null) {
            const releaseSeconds = release / 1000
            gain.gain.setValueAtTime(peak, startAt + durationSeconds)
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startAt + durationSeconds + releaseSeconds,
            )
            osc.connect(gain).connect(ctx.destination)
            osc.start(startAt)
            osc.stop(startAt + durationSeconds + releaseSeconds)
        } else {
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds)
            osc.connect(gain).connect(ctx.destination)
            osc.start(startAt)
            osc.stop(startAt + durationSeconds)
        }
    } catch {
        // audio unavailable — ignore
    }
}

/**
 * Fire-and-forget capture feedback: a short WebAudio beep plus a device vibration, so the operator
 * gets non-visual confirmation that a tap registered even without watching the screen. No audio
 * assets — the beep is synthesized. Both channels are best-effort: a browser without WebAudio (or
 * one that hasn't unlocked the audio context yet) or without the vibration API must not throw and
 * must not block the capture flow.
 *
 * Ohne `tone` klingt der Piep wie eh und je (880 Hz / 150 ms); Ziel- und Zwischenposten reichen
 * hier den je Postentyp konfigurierten Erfassungston aus den Zeitnahme-Einstellungen durch
 * (GET /timing/settings, live via settingsChanged). Gespielt wird NUR bei der Nutzergeste selbst
 * — das Nachsenden der Offline-Warteschlange bestätigt nichts, was der Bediener gerade tut, und
 * bleibt deshalb stumm.
 */
export function playCaptureFeedback(tone?: {
    frequencyHz: number
    durationMillis: number
    releaseMillis?: number | null
    waveform?: ToneWaveform | null
}) {
    const effective = tone ?? DEFAULT_CAPTURE_TONE
    // releaseMillis/waveform unveraendert durchreichen: null/fehlend = Abfallend bzw. Sinus.
    playTone(effective.frequencyHz, effective.durationMillis / 1000, tone?.releaseMillis, tone?.waveform)
    navigator.vibrate?.(80)
}

/**
 * Ein Eintrag eines Tonplans (Countdown-Pieps der Startsequenz oder Editor-Vorschau), gleiche
 * Fire-and-forget-Garantien wie `playCaptureFeedback`. Jedes Board spielt seine Töne aus der
 * eigenen Countdown-Schleife (getrieben von der geteilten Server-Uhr) — mehr Synchronisation als
 * dasselbe `now()` braucht es nicht; welcher Ton wann fällig ist, entscheidet die reine
 * `advanceTonePlan`-Logik in `tonePlan.ts`.
 */
export function playToneStep(step: {
    frequencyHz: number
    durationMillis: number
    releaseMillis?: number | null
    waveform?: ToneWaveform | null
}) {
    playTone(step.frequencyHz, step.durationMillis / 1000, step.releaseMillis, step.waveform)
}

/**
 * Eine ganze TONFOLGE auf einen Schlag anmelden — der Fehlstart-Rückruf („död, död, dööööd") und
 * jede Editor-Vorschau laufen hierüber.
 *
 * Die Zeitpunkte gehen an die WebAudio-Uhr, nicht an eine `setTimeout`-Kaskade: die Audio-Uhr
 * läuft in der Audio-Hardware und hält ihr Raster auch dann, wenn der Haupt-Thread gerade rendert
 * oder der Browser Timer drosselt — ein „kurz-kurz-lang" mit 100 ms Stille dazwischen wäre mit
 * Timern hörbar ungleichmäßig. Nebenbei fällt das Aufräumen weg: die Töne sind bereits an den
 * Oszillatoren angemeldet, es gibt keine Timer-Ids, die jemand vergessen könnte abzuräumen.
 *
 * Der Preis ist bewusst in Kauf genommen: eine einmal angemeldete Folge lässt sich nicht mehr
 * abbrechen. Für den Rückruf ist das richtig (er soll durchlaufen), und die Editor-Vorschau ist
 * kurz genug, dass Abbrechen nichts hilft.
 *
 * Fire-and-forget wie alle Board-Töne: ohne WebAudio bleibt es still, geworfen wird nie.
 */
export function playToneSequence(
    entries: readonly {
        atMillis: number
        step: {
            frequencyHz: number
            durationMillis: number
            releaseMillis?: number | null
            waveform?: ToneWaveform | null
        }
    }[],
) {
    entries.forEach(({atMillis, step}) => {
        playTone(
            step.frequencyHz,
            step.durationMillis / 1000,
            step.releaseMillis,
            step.waveform,
            atMillis / 1000,
        )
    })
}
