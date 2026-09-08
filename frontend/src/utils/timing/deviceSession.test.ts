import {describe, expect, test} from 'vitest'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {
    clearDeviceSession,
    deviceSessionForEvent,
    deviceSessionForStation,
    readDeviceSession,
    readTokenFromLocation,
    writeDeviceSession,
} from './deviceSession.ts'

const memoryStorage = (): WebStorageLike & {dump: () => Record<string, string>} => {
    const map = new Map<string, string>()
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
        dump: () => Object.fromEntries(map),
    }
}

const session = {token: 'abc123', event: 'event-1', station: 'station-1'}

describe('deviceSession', () => {
    test('write/read Roundtrip', () => {
        const storage = memoryStorage()
        writeDeviceSession(session, storage)
        expect(readDeviceSession(storage)).toEqual(session)
    })

    test('kaputte Ablage wird aufgeraeumt statt zu werfen', () => {
        const storage = memoryStorage()
        storage.setItem('timing.deviceSession', '{nope')
        expect(readDeviceSession(storage)).toBeNull()
        expect(storage.dump()).toEqual({})
    })

    test('unvollstaendige Ablage (fehlendes Feld) zaehlt als keine', () => {
        const storage = memoryStorage()
        storage.setItem('timing.deviceSession', JSON.stringify({token: 'abc'}))
        expect(readDeviceSession(storage)).toBeNull()
    })

    test('deviceSessionForEvent liefert nur bei passender Veranstaltung', () => {
        const storage = memoryStorage()
        writeDeviceSession(session, storage)
        expect(deviceSessionForEvent('event-1', storage)).toEqual(session)
        expect(deviceSessionForEvent('event-2', storage)).toBeNull()
    })

    test('deviceSessionForStation verlangt zusaetzlich den Posten', () => {
        const storage = memoryStorage()
        writeDeviceSession(session, storage)
        expect(deviceSessionForStation('event-1', 'station-1', storage)).toEqual(session)
        expect(deviceSessionForStation('event-1', 'station-2', storage)).toBeNull()
        expect(deviceSessionForStation('event-2', 'station-1', storage)).toBeNull()
    })

    test('clearDeviceSession entfernt die Ablage', () => {
        const storage = memoryStorage()
        writeDeviceSession(session, storage)
        clearDeviceSession(storage)
        expect(readDeviceSession(storage)).toBeNull()
    })
})

/**
 * Das Token reist im Fragment (`#token=…`), das der Browser nie an den Server schickt — es taucht
 * damit weder in Server- noch in Proxy-Protokollen noch im Referer auf. Alte Links mit `?token=`
 * müssen weiter funktionieren, der Query-Parameter ist der Rückfall.
 */
describe('readTokenFromLocation', () => {
    test('liest das Token aus dem Fragment', () => {
        expect(readTokenFromLocation('#token=abc123', undefined)).toBe('abc123')
    })

    test('findet das Token auch neben anderen Fragment-Parametern', () => {
        expect(readTokenFromLocation('#foo=1&token=abc123&bar=2', undefined)).toBe('abc123')
    })

    test('dekodiert URL-kodierte Zeichen', () => {
        expect(readTokenFromLocation('#token=a%2Fb%3Dc', undefined)).toBe('a/b=c')
    })

    test('faellt auf den Query-Parameter alter Links zurueck', () => {
        expect(readTokenFromLocation('', 'alt456')).toBe('alt456')
        expect(readTokenFromLocation('#other=1', 'alt456')).toBe('alt456')
    })

    test('das Fragment geht vor dem Query-Parameter', () => {
        expect(readTokenFromLocation('#token=neu', 'alt')).toBe('neu')
    })

    test('ohne Token null, leere Werte zaehlen nicht', () => {
        expect(readTokenFromLocation('', undefined)).toBeNull()
        expect(readTokenFromLocation('#token=', undefined)).toBeNull()
        expect(readTokenFromLocation('#token=', '')).toBeNull()
        expect(readTokenFromLocation('#section', undefined)).toBeNull()
    })
})
