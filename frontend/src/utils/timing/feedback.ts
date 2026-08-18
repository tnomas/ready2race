let ctx: AudioContext | null = null

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
            void ctx.resume()
        }
    } catch {
        // audio unavailable — ignore
    }
}

/** Synthesized single tone, fire-and-forget. Silent (never throwing) when audio is unavailable. */
function playTone(frequency: number, durationSeconds: number) {
    try {
        unlockAudio()
        if (ctx === null) return
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = frequency
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSeconds)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + durationSeconds)
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
 */
export function playCaptureFeedback() {
    playTone(880, 0.15)
    navigator.vibrate?.(80)
}

/**
 * Countdown beep for a running start sequence: a short 600Hz tick for T-5..T-1 (`final: false`), a
 * longer 900Hz tone for T-0 (`final: true`). Same synthesized-WebAudio pattern as
 * `playCaptureFeedback` — fire-and-forget, never throws, no audio assets. Each board plays its own
 * beeps from its own countdown loop (driven by the shared server clock), so no explicit
 * synchronization is needed beyond every board reading the same `now()`.
 */
export function playCountdownBeep(final: boolean) {
    playTone(final ? 900 : 600, final ? 0.4 : 0.1)
}
