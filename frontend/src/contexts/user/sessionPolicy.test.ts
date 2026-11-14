import {describe, expect, it} from 'vitest'
import {
    classifyLoginCheck,
    isDisplayPath,
    isLoginPath,
    isSessionRejection,
    loginRetryDelayMs,
} from './sessionPolicy.ts'

describe('classifyLoginCheck', () => {
    it('200 mit Nutzerangaben meldet an', () => {
        expect(classifyLoginCheck(200, true)).toBe('authenticated')
    })

    it('204 und 401 heißen: Sitzung unbekannt, Token darf weg', () => {
        expect(classifyLoginCheck(204, true)).toBe('anonymous')
        expect(classifyLoginCheck(401, false)).toBe('anonymous')
    })

    it('Serverfehler und Gateway-Fehler behalten den Token und versuchen es erneut', () => {
        for (const status of [500, 502, 503, 504, 429, 400]) {
            expect(classifyLoginCheck(status, false)).toBe('retry')
        }
    })

    it('200 ohne Nutzlast ist kaputt, nicht abgemeldet', () => {
        expect(classifyLoginCheck(200, false)).toBe('retry')
    })
})

describe('loginRetryDelayMs', () => {
    it('wächst bis 30 s und bleibt dort', () => {
        expect([0, 1, 2, 3, 4, 50].map(loginRetryDelayMs)).toEqual([
            2_000, 5_000, 10_000, 30_000, 30_000, 30_000,
        ])
    })

    it('verträgt negative Zähler', () => {
        expect(loginRetryDelayMs(-1)).toBe(2_000)
    })
})

describe('isDisplayPath', () => {
    it.each([
        '/board/e1/b1',
        '/board/e1',
        '/speaker',
        '/speaker/event/e1',
        '/event/e1/stream/s1',
        '/event/e1/timing/st1',
        '/event/e1/timing/st1/anzeige',
        '/event/e1/timing/leitstand',
    ])('%s ist eine Anzeige', path => {
        expect(isDisplayPath(path)).toBe(true)
    })

    it.each([
        '/',
        '/dashboard',
        '/login',
        '/event/e1',
        '/event/e1/streamPanel',
        '/event/e1/streamScenes',
        '/event/e1/timing',
        '/events',
        '/app/timing/st1',
        '/speakers',
    ])('%s ist keine Anzeige', path => {
        expect(isDisplayPath(path)).toBe(false)
    })

    it('berücksichtigt einen Basispfad', () => {
        expect(isDisplayPath('/r2r/board/e1/b1', '/r2r')).toBe(true)
        expect(isDisplayPath('/r2r/dashboard', '/r2r/')).toBe(false)
    })
})

describe('isLoginPath', () => {
    it('erkennt beide Anmeldeseiten, auch mit Basispfad', () => {
        expect(isLoginPath('/login')).toBe(true)
        expect(isLoginPath('/app/login/')).toBe(true)
        expect(isLoginPath('/r2r/login', '/r2r')).toBe(true)
        expect(isLoginPath('/dashboard')).toBe(false)
    })
})

describe('isSessionRejection', () => {
    const headers = (entries: Record<string, string>) => new Headers(entries)

    it('401 auf eine Anfrage mit Sitzung ist eine abgelaufene Sitzung', () => {
        expect(isSessionRejection(401, headers({'X-Api-Session': '{"token":"t"}'}))).toBe(true)
    })

    it('401 ohne Sitzung sagt nichts über die Sitzung', () => {
        expect(isSessionRejection(401, headers({}))).toBe(false)
    })

    it('401 mit Geräte-Token kann dem Geräte-Token gelten', () => {
        expect(
            isSessionRejection(
                401,
                headers({'X-Api-Session': '{"token":"t"}', 'X-Timing-Device-Token': 'd'}),
            ),
        ).toBe(false)
    })

    it('403 ist ein fehlendes Recht, keine abgelaufene Sitzung', () => {
        expect(isSessionRejection(403, headers({'X-Api-Session': '{"token":"t"}'}))).toBe(false)
    })
})
