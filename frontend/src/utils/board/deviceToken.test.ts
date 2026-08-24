import {describe, expect, test} from 'vitest'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {
    boardDeviceToken,
    boardDeviceTokenForEvent,
    clearBoardDeviceToken,
    clearBoardDeviceTokens,
    readBoardDeviceTokens,
    writeBoardDeviceToken,
} from './deviceToken.ts'

const memoryStorage = (): WebStorageLike & {dump: () => Record<string, string>} => {
    const map = new Map<string, string>()
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
        dump: () => Object.fromEntries(map),
    }
}

describe('board deviceToken', () => {
    test('write/read Roundtrip', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        expect(boardDeviceToken('event-1', 'board-1', storage)).toBe('abc123')
    })

    test('mehrere Boards liegen nebeneinander statt sich zu ueberschreiben', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        writeBoardDeviceToken('event-1', 'board-2', 'def456', storage)
        expect(boardDeviceToken('event-1', 'board-1', storage)).toBe('abc123')
        expect(boardDeviceToken('event-1', 'board-2', storage)).toBe('def456')
    })

    test('erneutes Teilen desselben Boards ersetzt sein Token', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'alt', storage)
        writeBoardDeviceToken('event-1', 'board-1', 'neu', storage)
        expect(boardDeviceToken('event-1', 'board-1', storage)).toBe('neu')
        expect(Object.keys(readBoardDeviceTokens(storage))).toHaveLength(1)
    })

    test('boardDeviceToken liefert nur bei passendem Board und passender Veranstaltung', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        expect(boardDeviceToken('event-1', 'board-2', storage)).toBeNull()
        expect(boardDeviceToken('event-2', 'board-1', storage)).toBeNull()
    })

    test('boardDeviceTokenForEvent liefert irgendein Token der Veranstaltung', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        writeBoardDeviceToken('event-2', 'board-9', 'fremd', storage)
        expect(boardDeviceTokenForEvent('event-1', storage)).toBe('abc123')
        expect(boardDeviceTokenForEvent('event-2', storage)).toBe('fremd')
        expect(boardDeviceTokenForEvent('event-3', storage)).toBeNull()
    })

    test('kaputte Ablage wird aufgeraeumt statt zu werfen', () => {
        const storage = memoryStorage()
        storage.setItem('board.deviceTokens', '{nope')
        expect(readBoardDeviceTokens(storage)).toEqual({})
        expect(storage.dump()).toEqual({})
    })

    test('unbrauchbare Eintraege fallen einzeln weg, der Rest bleibt nutzbar', () => {
        const storage = memoryStorage()
        storage.setItem(
            'board.deviceTokens',
            JSON.stringify({'event-1/board-1': 'abc123', 'event-1/board-2': 42}),
        )
        expect(readBoardDeviceTokens(storage)).toEqual({'event-1/board-1': 'abc123'})
        expect(boardDeviceToken('event-1', 'board-1', storage)).toBe('abc123')
        expect(boardDeviceToken('event-1', 'board-2', storage)).toBeNull()
    })

    test('clearBoardDeviceToken entfernt nur das eine Board', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        writeBoardDeviceToken('event-1', 'board-2', 'def456', storage)
        clearBoardDeviceToken('event-1', 'board-1', storage)
        expect(boardDeviceToken('event-1', 'board-1', storage)).toBeNull()
        expect(boardDeviceToken('event-1', 'board-2', storage)).toBe('def456')
    })

    test('clearBoardDeviceTokens entfernt die ganze Ablage', () => {
        const storage = memoryStorage()
        writeBoardDeviceToken('event-1', 'board-1', 'abc123', storage)
        writeBoardDeviceToken('event-2', 'board-9', 'fremd', storage)
        clearBoardDeviceTokens(storage)
        expect(readBoardDeviceTokens(storage)).toEqual({})
        expect(storage.dump()).toEqual({})
    })
})
