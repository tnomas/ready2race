import {describe, expect, test} from 'vitest'
import {ClockSync} from './serverClock.ts'

const MINUTE = 60_000

/** Probe mit Versatz und Latenz; `at` ist die monotone Uhr in Millisekunden. */
const ingest = (sync: ClockSync, offset: number, latency: number, at: number) =>
    sync.ingest({offset, latency}, at)

describe('ClockSync', () => {
    test('ohne Probe kein Versatz', () => {
        expect(new ClockSync().offset()).toBeNull()
    })

    test('die Probe mit der geringsten Latenz bestimmt den Versatz', () => {
        const sync = new ClockSync()
        ingest(sync, 100, 80, 0)
        ingest(sync, 40, 20, 5_000)
        ingest(sync, 70, 50, 10_000)
        expect(sync.offset()).toBe(40)
    })

    test('eine Drift von +180 ms wird innerhalb von fuenf Proben uebernommen', () => {
        const sync = new ClockSync()
        ingest(sync, 0, 15, 0)
        ingest(sync, 2, 25, 5_000)
        ingest(sync, -1, 30, 10_000)
        // Ab hier läuft die Geräteuhr 180 ms anders — jede weitere Probe zeigt es.
        let at = 15_000
        for (let i = 0; i < 5; i++) {
            ingest(sync, 180 + i, 30 + i, at)
            at += 5_000
        }
        expect(sync.offset()).toBeGreaterThanOrEqual(178)
        expect(sync.offset()).toBeLessThanOrEqual(186)
    })

    test('ein Ausreisser mit hoher Latenz gewinnt nicht', () => {
        const sync = new ClockSync()
        ingest(sync, 0, 15, 0)
        ingest(sync, 3, 20, 5_000)
        ingest(sync, -2, 25, 10_000)
        // Ein einzelner Netzschluckauf: riesige Latenz, unsinniger Versatz.
        ingest(sync, 500, 900, 15_000)
        expect(sync.offset()).toBe(0)
        // Auch die nächsten sauberen Proben lassen ihn nicht durch.
        ingest(sync, 1, 20, 20_000)
        ingest(sync, -1, 22, 25_000)
        expect(Math.abs(sync.offset() ?? 999)).toBeLessThanOrEqual(3)
    })

    test('eine alte Bestprobe verliert nach zehn Minuten ihren Vorrang', () => {
        const sync = new ClockSync()
        // Eine traumhaft schnelle Probe zu Beginn …
        ingest(sync, 0, 3, 0)
        // … und elf Minuten später nur noch gewöhnliche Proben mit anderem Versatz.
        ingest(sync, 120, 40, 11 * MINUTE)
        expect(sync.offset()).toBe(120)
    })

    test('ohne frische Proben bleibt der letzte Versatz erhalten, die Guete faellt auf DEGRADED', () => {
        const sync = new ClockSync()
        ingest(sync, 50, 20, 0)
        expect(sync.quality(5_000)).toBe('OK')
        expect(sync.offset()).toBe(50)
        expect(sync.quality(15 * MINUTE)).toBe('DEGRADED')
        expect(sync.offset()).toBe(50)
    })

    test('hoechstens acht Proben zaehlen: die neunte verdraengt die aelteste', () => {
        const sync = new ClockSync()
        ingest(sync, 0, 5, 0)
        for (let i = 1; i <= 8; i++) {
            ingest(sync, 100, 30, i * 5_000)
        }
        // Die schnelle Erstprobe ist aus dem Fenster gefallen, obwohl sie jünger als 10 min ist.
        expect(sync.offset()).toBe(100)
    })
})
