import {afterEach, describe, expect, test, vi} from 'vitest'
import {TONE_HELD_MIN_RELEASE_MILLIS} from './tonePlan.ts'

/**
 * Nachbau des Browser-`AudioContext` für die Node-Testumgebung: startet gesperrt (`suspended`)
 * und wird erst durch `resume()` laufend — genau die iOS-Mechanik, um die es hier geht.
 */
class FakeAudioContext {
    state = 'suspended'
    resume() {
        this.state = 'running'
        return Promise.resolve()
    }
}

/** Frischer Modulzustand je Test — `feedback.ts` hält den Kontext als Modul-Singleton. */
const load = async () => {
    vi.resetModules()
    return await import('./feedback.ts')
}

describe('audio unlock', () => {
    afterEach(() => vi.unstubAllGlobals())

    test('ohne Nutzergeste bleibt der Ton gesperrt', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const {isAudioUnlocked} = await load()
        expect(isAudioUnlocked()).toBe(false)
    })

    test('unlockAudio entsperrt und benachrichtigt Abonnenten', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const {unlockAudio, isAudioUnlocked, subscribeAudioUnlocked} = await load()
        let calls = 0
        subscribeAudioUnlocked(() => calls++)
        unlockAudio()
        await Promise.resolve()
        expect(isAudioUnlocked()).toBe(true)
        expect(calls).toBe(1)
    })

    test('mehrfaches Entsperren benachrichtigt nur einmal', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const {unlockAudio, subscribeAudioUnlocked} = await load()
        let calls = 0
        subscribeAudioUnlocked(() => calls++)
        unlockAudio()
        await Promise.resolve()
        unlockAudio()
        await Promise.resolve()
        expect(calls).toBe(1)
    })

    test('abbestellte Abonnenten hoeren nichts mehr', async () => {
        vi.stubGlobal('AudioContext', FakeAudioContext)
        const {unlockAudio, subscribeAudioUnlocked} = await load()
        let calls = 0
        const unsubscribe = subscribeAudioUnlocked(() => calls++)
        unsubscribe()
        unlockAudio()
        await Promise.resolve()
        expect(calls).toBe(0)
    })

    test('ohne AudioContext bleibt alles still statt zu werfen', async () => {
        const {unlockAudio, isAudioUnlocked} = await load()
        expect(() => unlockAudio()).not.toThrow()
        expect(isAudioUnlocked()).toBe(false)
    })
})

// --- Hüllkurve -----------------------------------------------------------------------------------

/** Gain-Attrappe: zeichnet die geplanten Lautstärke-Punkte auf, mehr braucht der Test nicht. */
class FakeGain {
    gain = {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    }
    connected: unknown = null
    connect(node: unknown) {
        this.connected = node
        return node
    }
}

class FakeOscillator {
    frequency = {value: 0}
    // Browser-Default des OscillatorNode — bleibt 'sine', solange niemand die Form setzt.
    type = 'sine'
    start = vi.fn()
    stop = vi.fn()
    connect(node: unknown) {
        return node
    }
}

/** Läuft sofort (state `running`), damit `playToneStep` ohne Geste durchspielt. */
class RecordingAudioContext {
    state = 'running'
    currentTime = 100
    destination = {}
    gains: FakeGain[] = []
    oscillators: FakeOscillator[] = []
    resume() {
        return Promise.resolve()
    }
    createGain() {
        const gain = new FakeGain()
        this.gains.push(gain)
        return gain
    }
    createOscillator() {
        const oscillator = new FakeOscillator()
        this.oscillators.push(oscillator)
        return oscillator
    }
}

describe('playToneStep envelope', () => {
    afterEach(() => vi.unstubAllGlobals())

    const playStep = async (step: {
        frequencyHz: number
        durationMillis: number
        releaseMillis?: number | null
        waveform?: 'SINE' | 'TRIANGLE' | 'SQUARE' | 'SAWTOOTH' | null
    }) => {
        const contexts: RecordingAudioContext[] = []
        vi.stubGlobal(
            'AudioContext',
            class extends RecordingAudioContext {
                constructor() {
                    super()
                    contexts.push(this)
                }
            },
        )
        const {playToneStep} = await load()
        playToneStep(step)
        const ctx = contexts[0]
        return {gain: ctx.gains[0].gain, oscillator: ctx.oscillators[0]}
    }

    const play = (releaseMillis?: number | null) =>
        playStep({frequencyHz: 900, durationMillis: 400, releaseMillis})

    test('Abfallend (releaseMillis fehlt): Abfall ueber die GESAMTE Nenndauer', async () => {
        const {gain, oscillator} = await play(undefined)
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.2, 100]])
        expect(gain.exponentialRampToValueAtTime.mock.calls.length).toBe(1)
        const [target, at] = gain.exponentialRampToValueAtTime.mock.calls[0]
        expect(target).toBeCloseTo(0.0001, 8)
        expect(at).toBeCloseTo(100.4, 6)
        expect(oscillator.stop.mock.calls[0][0]).toBeCloseTo(100.4, 6)
    })

    test('Abfallend (releaseMillis null): identisch zum fehlenden Wert', async () => {
        const {gain} = await play(null)
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.2, 100]])
        expect(gain.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(100.4, 6)
    })

    test('Gehalten mit 0 ms: Halte-Anker + Mini-Entknackung statt hartem Stopp', async () => {
        const {gain, oscillator} = await play(0)
        // Zwei Anker: Einsatz UND Ende der Haltezeit — dazwischen bleibt die Lautstaerke voll.
        expect(gain.setValueAtTime.mock.calls).toEqual([
            [0.2, 100],
            [0.2, 100.4],
        ])
        const [, rampEnd] = gain.exponentialRampToValueAtTime.mock.calls[0]
        expect(rampEnd).toBeCloseTo(100.4 + TONE_HELD_MIN_RELEASE_MILLIS / 1000, 6)
        expect(oscillator.stop.mock.calls[0][0]).toBeCloseTo(
            100.4 + TONE_HELD_MIN_RELEASE_MILLIS / 1000,
            6,
        )
    })

    test('Gehalten mit 1 ms klingt wie 0 ms — kein Klangsprung innerhalb des Modus', async () => {
        const zero = await play(0)
        const one = await play(1)
        expect(one.gain.setValueAtTime.mock.calls).toEqual(zero.gain.setValueAtTime.mock.calls)
        expect(one.gain.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(
            zero.gain.exponentialRampToValueAtTime.mock.calls[0][1],
            6,
        )
    })

    test('Gehalten mit 800 ms: Haltezeit voll, danach 800 ms Abfall', async () => {
        const {gain, oscillator} = await play(800)
        expect(gain.setValueAtTime.mock.calls).toEqual([
            [0.2, 100],
            [0.2, 100.4],
        ])
        expect(gain.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(101.2, 6)
        expect(oscillator.stop.mock.calls[0][0]).toBeCloseTo(101.2, 6)
    })
})

// --- Wellenform ----------------------------------------------------------------------------------

describe('playToneStep waveform', () => {
    afterEach(() => vi.unstubAllGlobals())

    const playStep = async (step: {
        frequencyHz: number
        durationMillis: number
        releaseMillis?: number | null
        waveform?: 'SINE' | 'TRIANGLE' | 'SQUARE' | 'SAWTOOTH' | null
    }) => {
        const contexts: RecordingAudioContext[] = []
        vi.stubGlobal(
            'AudioContext',
            class extends RecordingAudioContext {
                constructor() {
                    super()
                    contexts.push(this)
                }
            },
        )
        const {playToneStep} = await load()
        playToneStep(step)
        const ctx = contexts[0]
        return {gain: ctx.gains[0].gain, oscillator: ctx.oscillators[0]}
    }

    test('Alt-Ton ohne waveform: Oszillator bleibt Sinus, Gain bleibt 0.2 — kein Klangdrift', async () => {
        const {gain, oscillator} = await playStep({frequencyHz: 880, durationMillis: 150})
        expect(oscillator.type).toBe('sine')
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.2, 100]])
    })

    test('SINE explizit klingt exakt wie nicht gesetzt', async () => {
        const {gain, oscillator} = await playStep({
            frequencyHz: 880,
            durationMillis: 150,
            waveform: 'SINE',
        })
        expect(oscillator.type).toBe('sine')
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.2, 100]])
    })

    test('SQUARE: type square und der Formfaktor 0.12 statt 0.2', async () => {
        const {gain, oscillator} = await playStep({
            frequencyHz: 440,
            durationMillis: 300,
            waveform: 'SQUARE',
        })
        expect(oscillator.type).toBe('square')
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.12, 100]])
    })

    test('SAWTOOTH: type sawtooth, Formfaktor 0.14', async () => {
        const {gain, oscillator} = await playStep({
            frequencyHz: 440,
            durationMillis: 3000,
            waveform: 'SAWTOOTH',
        })
        expect(oscillator.type).toBe('sawtooth')
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.14, 100]])
    })

    test('TRIANGLE: type triangle, Formfaktor 0.22', async () => {
        const {oscillator, gain} = await playStep({
            frequencyHz: 600,
            durationMillis: 100,
            waveform: 'TRIANGLE',
        })
        expect(oscillator.type).toBe('triangle')
        expect(gain.setValueAtTime.mock.calls).toEqual([[0.22, 100]])
    })

    test('Gehalten + SQUARE: BEIDE Lautstaerke-Anker tragen den Formfaktor', async () => {
        const {gain} = await playStep({
            frequencyHz: 440,
            durationMillis: 400,
            releaseMillis: 800,
            waveform: 'SQUARE',
        })
        expect(gain.setValueAtTime.mock.calls).toEqual([
            [0.12, 100],
            [0.12, 100.4],
        ])
    })
})
