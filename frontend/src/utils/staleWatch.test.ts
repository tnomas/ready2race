import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createStaleWatch} from './staleWatch'

const INTERVAL = 15_000
const THRESHOLD = INTERVAL * 3

/** Sammelt die gemeldeten Umschaltungen; die Uhr ist die Testuhr von Vitest. */
const harness = () => {
    const reported: boolean[] = []
    const watch = createStaleWatch({onStale: v => reported.push(v)})
    const last = () => reported[reported.length - 1]
    return {watch, reported, last}
}

describe('createStaleWatch', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('meldet nichts, solange die Abrufe gelingen', () => {
        const {watch, reported} = harness()
        watch.markFresh(THRESHOLD)

        vi.advanceTimersByTime(THRESHOLD * 2)

        expect(reported).toEqual([])
        watch.stop()
    })

    /**
     * Der eigentliche Fehler: Die Warnung hing an einem erneuten Rendern. Nach dem ersten
     * Fehlversuch rendert aber nichts mehr — kein weiterer Abruf ändert den Zustand, und in den
     * Anzeigen tickt keine Uhr. Die Schwelle muss also von selbst zuschlagen.
     */
    it('meldet den alten Stand, ohne dass ein weiterer Abruf nötig ist', () => {
        const {watch, last} = harness()
        watch.markFresh(THRESHOLD)

        vi.setSystemTime(INTERVAL)
        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD)

        expect(last()).toBe(true)
        watch.stop()
    })

    it('meldet erst nach der Schwelle, nicht schon beim Fehlversuch', () => {
        const {watch, reported} = harness()
        watch.markFresh(THRESHOLD)

        vi.setSystemTime(INTERVAL)
        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD - INTERVAL - 1)

        expect(reported).toEqual([])
        watch.stop()
    })

    /**
     * Die Schwelle zählt ab dem letzten GUTEN Stand. Zählte sie ab dem letzten Fehlversuch,
     * schöbe jeder weitere Fehlversuch die Warnung vor sich her und sie käme nie.
     */
    it('schiebt die Schwelle nicht mit jedem weiteren Fehlversuch', () => {
        const {watch, last} = harness()
        watch.markFresh(THRESHOLD)

        vi.setSystemTime(INTERVAL)
        watch.markFailed()
        vi.setSystemTime(INTERVAL * 2)
        watch.markFailed()
        vi.setSystemTime(THRESHOLD)
        watch.markFailed()

        expect(last()).toBe(true)
        watch.stop()
    })

    it('nimmt die Warnung bei einem geglückten Abruf zurück', () => {
        const {watch, reported} = harness()
        watch.markFresh(THRESHOLD)
        vi.setSystemTime(INTERVAL)
        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD)

        watch.markFresh(THRESHOLD)

        expect(reported).toEqual([true, false])
        watch.stop()
    })

    it('meldet einen bereits gemeldeten Stand nicht erneut', () => {
        const {watch, reported} = harness()
        watch.markFresh(THRESHOLD)
        vi.setSystemTime(INTERVAL)
        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD)
        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD)

        expect(reported).toEqual([true])
        watch.stop()
    })

    /** Ohne je einen guten Stand trägt die Anzeige ihre eigene Fehlermeldung, nicht diese Warnung. */
    it('meldet ohne einen einzigen guten Stand nichts', () => {
        const {watch, reported} = harness()

        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD * 2)

        expect(reported).toEqual([])
        watch.stop()
    })

    it('lässt nach dem Anhalten keine Warnung mehr los', () => {
        const {watch, reported} = harness()
        watch.markFresh(THRESHOLD)
        vi.setSystemTime(INTERVAL)
        watch.markFailed()

        watch.stop()
        vi.advanceTimersByTime(THRESHOLD * 2)

        expect(reported).toEqual([])
    })

    /**
     * Die Schwelle hängt am Takt, den der Server vorgibt, und der kann sich zwischen zwei
     * Ständen ändern. Maßgeblich ist die des zuletzt gemeldeten guten Standes.
     */
    it('rechnet mit der Schwelle des letzten guten Standes', () => {
        const {watch, reported, last} = harness()
        watch.markFresh(THRESHOLD)
        vi.setSystemTime(INTERVAL)
        watch.markFresh(THRESHOLD * 4)

        watch.markFailed()
        vi.advanceTimersByTime(THRESHOLD)
        expect(reported).toEqual([])

        vi.advanceTimersByTime(THRESHOLD * 3)
        expect(last()).toBe(true)
        watch.stop()
    })
})
