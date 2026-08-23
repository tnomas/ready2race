import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {
    EVENT_CHANGE_DEBOUNCE_MS,
    EVENT_CHANGE_POLL_STRETCH,
    buildEventChangeWsUrl,
    createChangeDebouncer,
    parseEventChangeMessage,
    shouldRefetchOnConnect,
    stretchedPollMs,
} from './eventChangePush'

describe('stretchedPollMs', () => {
    it('streckt den Takt, solange der Push-Kanal steht', () => {
        expect(stretchedPollMs(15_000, true)).toBe(15_000 * EVENT_CHANGE_POLL_STRETCH)
    })

    it('lässt den Takt ohne Verbindung unverändert — kein Board wird ohne Socket schlechter', () => {
        expect(stretchedPollMs(15_000, false)).toBe(15_000)
    })
})

describe('buildEventChangeWsUrl', () => {
    it('baut aus einer absoluten API-Basis die ws-URL', () => {
        expect(
            buildEventChangeWsUrl('http://localhost:8140/api', 'http://localhost:5180/', 'ev-1'),
        ).toBe('ws://localhost:8140/api/ws/event/ev-1/info')
    })

    it('löst eine relative Basis gegen die Seite auf und wählt wss bei https', () => {
        expect(buildEventChangeWsUrl('/api', 'https://regatta.example.org/board/x', 'ev-2')).toBe(
            'wss://regatta.example.org/api/ws/event/ev-2/info',
        )
    })

    it('verkraftet eine Basis mit Schluss-Schrägstrich ohne doppelten Pfadtrenner', () => {
        expect(
            buildEventChangeWsUrl('http://localhost:8140/api/', 'http://localhost:5180/', 'ev-3'),
        ).toBe('ws://localhost:8140/api/ws/event/ev-3/info')
    })
})

describe('parseEventChangeMessage', () => {
    it('liefert den Markerstand einer gültigen Nachricht', () => {
        expect(parseEventChangeMessage('{"type":"changed","marker":42}')).toBe(42)
    })

    it('liefert null für kaputtes JSON', () => {
        expect(parseEventChangeMessage('nicht json')).toBeNull()
    })

    it('liefert null für unbekannte Typen — künftige Nachrichten stören alte Clients nicht', () => {
        expect(parseEventChangeMessage('{"type":"somethingNew","payload":1}')).toBeNull()
    })

    it('liefert null, wenn der Marker fehlt oder keine Zahl ist', () => {
        expect(parseEventChangeMessage('{"type":"changed"}')).toBeNull()
        expect(parseEventChangeMessage('{"type":"changed","marker":"7"}')).toBeNull()
    })
})

describe('createChangeDebouncer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('sammelt einen Schub von Bumps zu genau einem Feuern nach der letzten Nachricht', () => {
        const fire = vi.fn()
        const debouncer = createChangeDebouncer(fire)

        // Acht Boote einer Welle: acht Bumps in kurzer Folge.
        for (let i = 0; i < 8; i++) {
            debouncer.bump()
            vi.advanceTimersByTime(100)
        }
        expect(fire).not.toHaveBeenCalled()
        expect(debouncer.pending()).toBe(true)

        vi.advanceTimersByTime(EVENT_CHANGE_DEBOUNCE_MS)
        expect(fire).toHaveBeenCalledTimes(1)
        expect(debouncer.pending()).toBe(false)
    })

    it('feuert für getrennte Schübe je einmal', () => {
        const fire = vi.fn()
        const debouncer = createChangeDebouncer(fire)

        debouncer.bump()
        vi.advanceTimersByTime(EVENT_CHANGE_DEBOUNCE_MS)
        debouncer.bump()
        vi.advanceTimersByTime(EVENT_CHANGE_DEBOUNCE_MS)

        expect(fire).toHaveBeenCalledTimes(2)
    })

    it('cancel verwirft einen ausstehenden Push', () => {
        const fire = vi.fn()
        const debouncer = createChangeDebouncer(fire)

        debouncer.bump()
        debouncer.cancel()
        vi.advanceTimersByTime(EVENT_CHANGE_DEBOUNCE_MS * 2)

        expect(fire).not.toHaveBeenCalled()
        expect(debouncer.pending()).toBe(false)
    })
})

describe('shouldRefetchOnConnect', () => {
    it('lädt beim allerersten glatten Verbinden nicht doppelt', () => {
        expect(shouldRefetchOnConnect(false, false)).toBe(false)
    })

    it('lädt nach einem Abriss oder Fehlversuch sofort nach', () => {
        expect(shouldRefetchOnConnect(true, false)).toBe(true)
        expect(shouldRefetchOnConnect(false, true)).toBe(true)
    })
})
