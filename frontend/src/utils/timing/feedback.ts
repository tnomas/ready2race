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
