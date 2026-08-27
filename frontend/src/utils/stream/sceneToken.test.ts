import {describe, expect, test} from 'vitest'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {
    clearStreamSceneDeviceToken,
    readStreamSceneDeviceTokens,
    streamSceneDeviceToken,
    writeStreamSceneDeviceToken,
} from './sceneToken.ts'

const memoryStorage = (): WebStorageLike & {dump: () => Record<string, string>} => {
    const map = new Map<string, string>()
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
        dump: () => Object.fromEntries(map),
    }
}

describe('stream sceneToken', () => {
    test('write/read Roundtrip', () => {
        const storage = memoryStorage()
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'abc123', storage)
        expect(streamSceneDeviceToken('event-1', 'scene-1', storage)).toBe('abc123')
    })

    test('mehrere Szenen liegen nebeneinander statt sich zu ueberschreiben', () => {
        const storage = memoryStorage()
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'abc123', storage)
        writeStreamSceneDeviceToken('event-1', 'scene-2', 'def456', storage)
        expect(streamSceneDeviceToken('event-1', 'scene-1', storage)).toBe('abc123')
        expect(streamSceneDeviceToken('event-1', 'scene-2', storage)).toBe('def456')
    })

    test('erneutes Teilen derselben Szene ersetzt ihr Token', () => {
        const storage = memoryStorage()
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'alt', storage)
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'neu', storage)
        expect(streamSceneDeviceToken('event-1', 'scene-1', storage)).toBe('neu')
        expect(Object.keys(readStreamSceneDeviceTokens(storage))).toHaveLength(1)
    })

    test('streamSceneDeviceToken liefert nur bei passender Szene und Veranstaltung', () => {
        const storage = memoryStorage()
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'abc123', storage)
        expect(streamSceneDeviceToken('event-1', 'scene-2', storage)).toBeNull()
        expect(streamSceneDeviceToken('event-2', 'scene-1', storage)).toBeNull()
    })

    test('kaputte Ablage wird aufgeraeumt statt zu werfen', () => {
        const storage = memoryStorage()
        storage.setItem('stream.sceneDeviceTokens', '{nope')
        expect(readStreamSceneDeviceTokens(storage)).toEqual({})
        expect(storage.dump()).toEqual({})
    })

    test('unbrauchbare Eintraege fallen einzeln weg, der Rest bleibt nutzbar', () => {
        const storage = memoryStorage()
        storage.setItem(
            'stream.sceneDeviceTokens',
            JSON.stringify({'event-1/scene-1': 'abc123', 'event-1/scene-2': 42}),
        )
        expect(readStreamSceneDeviceTokens(storage)).toEqual({'event-1/scene-1': 'abc123'})
        expect(streamSceneDeviceToken('event-1', 'scene-1', storage)).toBe('abc123')
        expect(streamSceneDeviceToken('event-1', 'scene-2', storage)).toBeNull()
    })

    test('clearStreamSceneDeviceToken entfernt nur die eine Szene', () => {
        const storage = memoryStorage()
        writeStreamSceneDeviceToken('event-1', 'scene-1', 'abc123', storage)
        writeStreamSceneDeviceToken('event-1', 'scene-2', 'def456', storage)
        clearStreamSceneDeviceToken('event-1', 'scene-1', storage)
        expect(streamSceneDeviceToken('event-1', 'scene-1', storage)).toBeNull()
        expect(streamSceneDeviceToken('event-1', 'scene-2', storage)).toBe('def456')
    })
})
