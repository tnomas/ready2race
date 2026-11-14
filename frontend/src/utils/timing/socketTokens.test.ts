import {describe, expect, test} from 'vitest'
import {TokenStores, WebStorageLike} from '@contexts/user/sessionToken.ts'
import {socketTokens, timingSocketTokens, tokenRoundInProgress} from './socketTokens.ts'

const memoryStorage = (): WebStorageLike => {
    const map = new Map<string, string>()
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
    }
}

const now = 1_000

const stores = (entries: {app?: string; admin?: string; device?: unknown}): TokenStores => {
    const local = memoryStorage()
    if (entries.app !== undefined) {
        local.setItem('session.app', JSON.stringify({token: entries.app, lastUsedAt: now}))
    }
    if (entries.admin !== undefined) {
        local.setItem('session.admin', JSON.stringify({token: entries.admin, lastUsedAt: now}))
    }
    if (entries.device !== undefined) {
        local.setItem('timing.deviceSession', JSON.stringify(entries.device))
    }
    return {local, session: memoryStorage()}
}

describe('tokenRoundInProgress', () => {
    test('solange ein Token dieser Runde abgewiesen wurde, laeuft die Runde', () => {
        // Ein Netzfehler mitten in einer Token-Runde darf das Warten auf die stabile Verbindung
        // nicht aufheben — der nächste Versuch trägt womöglich wieder einen Token, der mit 1008
        // zurückkommt, und ein vorzeitiges „verbunden" würde das rote Banner flackern lassen.
        expect(tokenRoundInProgress(new Set(['abgewiesen']))).toBe(true)
    })

    test('ohne abgewiesene Tokens ist keine Runde offen', () => {
        expect(tokenRoundInProgress(new Set())).toBe(false)
    })
})

describe('timingSocketTokens: Lesen ohne Nebenwirkung', () => {
    test('ein alter Tab-gebundener Token wird angeboten, aber nicht in die Verwaltungsablage kopiert', () => {
        // Die HTTP-Seite (UserProvider) übernimmt den alten `sessionStorage['session']` einmalig in
        // `session.admin`. Der Live-Kanal liest nur — er darf diese Übernahme nicht nebenbei
        // auslösen und dabei die Tab-gebundene Ablage leeren.
        const s = stores({})
        s.session.setItem('session', 'alt-tab')
        expect(timingSocketTokens('event-1', false, now, s)).toEqual(['alt-tab'])
        expect(s.session.getItem('session')).toBe('alt-tab')
        expect(s.local.getItem('session.admin')).toBeNull()
    })
})

describe('timingSocketTokens', () => {
    test('Verwaltungsoberfläche: der Verwaltungstoken zuerst', () => {
        const s = stores({app: 'helfer', admin: 'verwaltung'})
        expect(timingSocketTokens('event-1', false, now, s)).toEqual(['verwaltung', 'helfer'])
    })

    test('Helferoberfläche: der Helfertoken zuerst', () => {
        const s = stores({app: 'helfer', admin: 'verwaltung'})
        expect(timingSocketTokens('event-1', true, now, s)).toEqual(['helfer', 'verwaltung'])
    })

    test('Geräte-Token kommt hinter die Sitzungen', () => {
        const s = stores({
            admin: 'verwaltung',
            device: {token: 'geraet', event: 'event-1', station: 'posten-1'},
        })
        expect(timingSocketTokens('event-1', false, now, s)).toEqual(['verwaltung', 'geraet'])
    })

    test('Geräte-Token einer anderen Veranstaltung bleibt draußen', () => {
        const s = stores({device: {token: 'geraet', event: 'event-2', station: 'posten-1'}})
        expect(timingSocketTokens('event-1', false, now, s)).toEqual([])
    })

    test('derselbe Token in beiden Ablagen wird nur einmal angeboten', () => {
        const s = stores({app: 'gleich', admin: 'gleich'})
        expect(timingSocketTokens('event-1', false, now, s)).toEqual(['gleich'])
    })

    test('abgelaufene Ablagen zählen nicht', () => {
        const s = stores({app: 'helfer', admin: 'verwaltung'})
        const spaeter = now + 6 * 60 * 60 * 1000 + 1
        expect(timingSocketTokens('event-1', false, spaeter, s)).toEqual([])
    })

    test('leere Ablage ergibt keine Kandidaten', () => {
        expect(timingSocketTokens('event-1', false, now, stores({}))).toEqual([])
    })
})

describe('socketTokens', () => {
    test('Board-Ausweis kommt hinter die Sitzungen', () => {
        const s = stores({app: 'helfer', admin: 'verwaltung'})
        expect(socketTokens(false, 'board-geraet', now, s)).toEqual([
            'verwaltung',
            'helfer',
            'board-geraet',
        ])
    })

    test('ohne Sitzung bleibt der Geräte-Ausweis allein übrig', () => {
        expect(socketTokens(false, 'board-geraet', now, stores({}))).toEqual(['board-geraet'])
    })
})
