import {DEFAULT_CAPTURE_TONE} from '@utils/timing/tonePlan.ts'

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
 * Hüllkurve (die Ist-Kurve seit jeher, hier destilliert): Lautstärke 0.2 beim Einsatz, dann
 * `exponentialRampToValueAtTime` auf 0.0001 (≈ −66 dB — ein >0-Zielwert, weil die exponentielle
 * Rampe 0 nicht erreichen kann) — das ist zugleich die Anti-Knacks-Rampe am Tonende, einen
 * eigenen Attack gab es nie. OHNE Ausklingzeit läuft dieser Abfall wie bisher über die GESAMTE
 * Nenndauer; MIT Ausklingzeit hält der Ton die Nenndauer voll durch (expliziter Stütz-Anker bei
 * duration, sonst rampte WebAudio ab dem Einsatz) und fällt erst danach über `releaseSeconds` ab
 * — Gesamtklang = duration + release. Exponentiell statt linear ist eine Klangentscheidung: das
 * Ohr hört Lautstärke logarithmisch, eine lineare Rampe klänge erst „hängend" und risse am Ende
 * hörbar ab, während die exponentielle gleichmäßig und natürlich ausklingt.
 */
function playTone(frequency: number, durationSeconds: number, releaseSeconds = 0) {
    try {
        unlockAudio()
        if (ctx === null) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        if (releaseSeconds > 0) {
            gain.gain.setValueAtTime(0.2, ctx.currentTime + durationSeconds)
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                ctx.currentTime + durationSeconds + releaseSeconds,
            )
        } else {
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds)
        }
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + durationSeconds + releaseSeconds)
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
}) {
    const effective = tone ?? DEFAULT_CAPTURE_TONE
    playTone(effective.frequencyHz, effective.durationMillis / 1000, (tone?.releaseMillis ?? 0) / 1000)
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
}) {
    playTone(step.frequencyHz, step.durationMillis / 1000, (step.releaseMillis ?? 0) / 1000)
}
