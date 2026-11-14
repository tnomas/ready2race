import {describe, expect, test} from 'vitest'
import {parseServerLocalDateTime, zoneOffsetFromPair} from './serverTime.ts'

/** Sommerzeit Europe/Berlin: die Wanduhr des Servers geht zwei Stunden vor UTC. */
const BERLIN_SUMMER = 2 * 60 * 60_000

describe('parseServerLocalDateTime', () => {
    test('zonenlose Wanduhrzeit wird mit dem Zonenversatz des Servers gedeutet', () => {
        expect(parseServerLocalDateTime('2026-08-14T10:30:00', BERLIN_SUMMER)).toBe(
            Date.UTC(2026, 7, 14, 8, 30, 0),
        )
    })

    test('Millisekunden bleiben erhalten', () => {
        expect(parseServerLocalDateTime('2026-08-14T10:30:00.250', BERLIN_SUMMER)).toBe(
            Date.UTC(2026, 7, 14, 8, 30, 0, 250),
        )
    })

    test('ohne Sekunden geht es auch', () => {
        expect(parseServerLocalDateTime('2026-08-14T10:30', BERLIN_SUMMER)).toBe(
            Date.UTC(2026, 7, 14, 8, 30, 0),
        )
    })

    test('ohne bekannten Versatz gilt die Geraetezeit (bisheriges Verhalten)', () => {
        expect(parseServerLocalDateTime('2026-08-14T10:30:00', null)).toBe(
            new Date(2026, 7, 14, 10, 30, 0).getTime(),
        )
    })

    test('eine Zeit mit eigener Zone braucht keinen Versatz', () => {
        expect(parseServerLocalDateTime('2026-08-14T10:30:00Z', BERLIN_SUMMER)).toBe(
            Date.UTC(2026, 7, 14, 10, 30, 0),
        )
        expect(parseServerLocalDateTime('2026-08-14T10:30:00+02:00', null)).toBe(
            Date.UTC(2026, 7, 14, 8, 30, 0),
        )
    })

    test('Unlesbares ergibt NaN, wie Date.parse', () => {
        expect(parseServerLocalDateTime('gestern', BERLIN_SUMMER)).toBeNaN()
        expect(parseServerLocalDateTime('', null)).toBeNaN()
    })
})

describe('zoneOffsetFromPair', () => {
    test('aus Wanduhrzeit und Epoch-Millis desselben Augenblicks folgt der Zonenversatz', () => {
        expect(zoneOffsetFromPair('2026-08-14T10:30:00', Date.UTC(2026, 7, 14, 8, 30, 0))).toBe(
            BERLIN_SUMMER,
        )
    })

    test('Winterzeit: eine Stunde', () => {
        expect(zoneOffsetFromPair('2026-01-14T10:30:00', Date.UTC(2026, 0, 14, 9, 30, 0))).toBe(
            60 * 60_000,
        )
    })

    test('unlesbare Wanduhrzeit ergibt null', () => {
        expect(zoneOffsetFromPair('heute', 0)).toBeNull()
    })
})
