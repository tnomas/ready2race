import {describe, expect, it} from 'vitest'
import {
    classifyStatus,
    failedAttempt,
    hasCredentialFor,
    orderForDrain,
    PendingTimeMark,
} from './offlineQueue.ts'

const item = (id: string, timestampMillis: number): PendingTimeMark => ({
    id,
    eventId: 'event-1',
    station: 'station-1',
    timestampMillis,
    attempts: 0,
})

describe('orderForDrain', () => {
    it('sendet in Erfassungsreihenfolge nach, nicht in Schlüsselordnung', () => {
        // getAll liefert nach UUID-Schlüssel — hier bewusst verdreht angeliefert.
        const ordered = orderForDrain([item('zz', 3000), item('aa', 1000), item('mm', 2000)])

        expect(ordered.map(i => i.id)).toEqual(['aa', 'mm', 'zz'])
    })

    it('lässt die Eingabe unverändert', () => {
        const input = [item('b', 2000), item('a', 1000)]
        orderForDrain(input)

        expect(input.map(i => i.id)).toEqual(['b', 'a'])
    })
})

/**
 * Die Warteschlange ist geräteweit: Eine Marke einer FREMDEN Veranstaltung (das Handy hing
 * gestern an einem anderen Posten-Link) hat mit dem heutigen Geräte-Token keine Berechtigung und
 * käme bei jedem Drain mit 401 zurück — retryable, also ewig. Ohne jede passende Berechtigung
 * wird sie deshalb gleich als tot mit Grund abgelegt, statt den Bediener mit einem Dauer-Banner zu
 * beschäftigen. Eine Nutzersitzung ist nicht an eine Veranstaltung gebunden: angemeldet wird
 * jede Marke versucht, der Server entscheidet.
 */
describe('hasCredentialFor', () => {
    it('Geräte-Token derselben Veranstaltung reicht', () => {
        expect(
            hasCredentialFor(item('a', 1), {deviceEventId: 'event-1', userLoggedIn: false}),
        ).toBe(true)
    })

    it('eine Nutzersitzung reicht für jede Veranstaltung', () => {
        expect(
            hasCredentialFor(item('a', 1), {deviceEventId: 'event-9', userLoggedIn: true}),
        ).toBe(true)
        expect(hasCredentialFor(item('a', 1), {deviceEventId: null, userLoggedIn: true})).toBe(
            true,
        )
    })

    it('Geräte-Token einer fremden Veranstaltung ohne Sitzung reicht nicht', () => {
        expect(
            hasCredentialFor(item('a', 1), {deviceEventId: 'event-9', userLoggedIn: false}),
        ).toBe(false)
        expect(hasCredentialFor(item('a', 1), {deviceEventId: null, userLoggedIn: false})).toBe(
            false,
        )
    })
})

describe('failedAttempt', () => {
    it('zählt den Versuch und merkt sich den Status', () => {
        const updated = failedAttempt({...item('a', 1), attempts: 2}, {
            outcome: 'retryable',
            status: 503,
        })
        expect(updated.attempts).toBe(3)
        expect(updated.lastStatus).toBe(503)
        expect(updated.deadReason).toBeUndefined()
    })

    it('behält den letzten Status, wenn der Versuch gar keine Antwort hatte', () => {
        const updated = failedAttempt({...item('a', 1), lastStatus: 500}, {outcome: 'retryable'})
        expect(updated.lastStatus).toBe(500)
    })

    it('Einträge aus der Zeit vor dem Zähler starten bei 1', () => {
        const legacy = {...item('a', 1)} as Partial<PendingTimeMark> as PendingTimeMark
        delete (legacy as Partial<PendingTimeMark>).attempts
        expect(failedAttempt(legacy, {outcome: 'retryable'}).attempts).toBe(1)
    })

    it('eine endgültig tote Marke trägt ihren Grund', () => {
        const updated = failedAttempt(item('a', 1), {
            outcome: 'permanent',
            reason: 'NO_CREDENTIAL',
        })
        expect(updated.deadReason).toBe('NO_CREDENTIAL')
    })

    it('ein Grund ohne Endgültigkeit wird nicht übernommen', () => {
        const updated = failedAttempt(item('a', 1), {
            outcome: 'retryable',
            reason: 'NO_CREDENTIAL',
        })
        expect(updated.deadReason).toBeUndefined()
    })
})

describe('classifyStatus', () => {
    it('hält Sitzungs- und Später-nochmal-Status in der Warteschlange', () => {
        // 401/403: die Sitzung ist das Problem, nicht die Marke — ein Dead-Letter würde
        // erfasste Zeiten wegwerfen, die eine Neuanmeldung problemlos übertragen hätte.
        for (const status of [401, 403, 408, 409, 425, 429]) {
            expect(classifyStatus(status)).toBe('retryable')
        }
    })

    it('behandelt Serverfehler als vorübergehend', () => {
        expect(classifyStatus(500)).toBe('retryable')
        expect(classifyStatus(503)).toBe('retryable')
    })

    it('erklärt semantisch abgelehnte Anfragen für endgültig', () => {
        expect(classifyStatus(400)).toBe('permanent')
        expect(classifyStatus(404)).toBe('permanent')
        expect(classifyStatus(422)).toBe('permanent')
    })
})
