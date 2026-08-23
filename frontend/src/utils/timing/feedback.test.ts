import {afterEach, describe, expect, test, vi} from 'vitest'

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
