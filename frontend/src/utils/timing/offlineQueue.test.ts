import {describe, expect, it} from 'vitest'
import {classifyStatus, orderForDrain, PendingTimeMark} from './offlineQueue.ts'

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
