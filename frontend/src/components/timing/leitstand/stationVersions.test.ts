import {describe, expect, test} from 'vitest'
import {StationVersions} from './stationVersions.ts'

/**
 * Der initiale GET je Posten läuft, während Websocket-Pushes für denselben Posten eintreffen
 * können. Der Push ist immer jünger als der Schnappschuss, den der GET liefert — kommt zwischen
 * Anfrage und Antwort ein Push, ist die Antwort veraltet und darf den Stand nicht überschreiben.
 */
describe('StationVersions', () => {
    test('ohne Push zwischendurch ist die Antwort frisch', () => {
        const versions = new StationVersions()
        const snapshot = versions.snapshot('s1')
        expect(versions.isStale('s1', snapshot)).toBe(false)
    })

    test('ein Push fuer denselben Posten macht die laufende Antwort veraltet', () => {
        const versions = new StationVersions()
        const snapshot = versions.snapshot('s1')
        versions.bump('s1')
        expect(versions.isStale('s1', snapshot)).toBe(true)
    })

    test('ein Push fuer einen anderen Posten stoert nicht', () => {
        const versions = new StationVersions()
        const snapshot = versions.snapshot('s1')
        versions.bump('s2')
        expect(versions.isStale('s1', snapshot)).toBe(false)
    })

    test('ein Push vor der Anfrage zaehlt nicht gegen sie', () => {
        const versions = new StationVersions()
        versions.bump('s1')
        const snapshot = versions.snapshot('s1')
        expect(versions.isStale('s1', snapshot)).toBe(false)
    })
})
