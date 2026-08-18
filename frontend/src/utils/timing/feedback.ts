let ctx: AudioContext | null = null

/**
 * Fire-and-forget capture feedback: a short WebAudio beep plus a device vibration, so the operator
 * gets non-visual confirmation that a tap registered even without watching the screen. No audio
 * assets — the beep is synthesized. Both channels are best-effort: a browser without WebAudio (or
 * one that hasn't unlocked the audio context yet) or without the vibration API must not throw and
 * must not block the capture flow.
 */
export function playCaptureFeedback() {
    try {
        ctx = ctx ?? new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.15)
    } catch {
        // audio unavailable — ignore
    }
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
    try {
        ctx = ctx ?? new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const duration = final ? 0.4 : 0.1
        osc.frequency.value = final ? 900 : 600
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + duration)
    } catch {
        // audio unavailable — ignore
    }
}
