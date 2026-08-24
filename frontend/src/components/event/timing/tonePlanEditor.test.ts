import {describe, expect, test} from 'vitest'
import {DEFAULT_START_TONE_PLAN} from '@utils/timing/tonePlan.ts'
import {planFromRows, rowsFromPlan, stepFromRow} from './tonePlanEditor.ts'

describe('tonePlanEditor', () => {
    test('Roundtrip: Plan -> Zeilen -> Plan bleibt identisch', () => {
        expect(planFromRows(rowsFromPlan(DEFAULT_START_TONE_PLAN))).toEqual(DEFAULT_START_TONE_PLAN)
    })

    test('Sekunden vor Start: 10 wird zu Offset -10000, 0 bleibt der Start', () => {
        const rows = rowsFromPlan([
            {offsetMillis: -10_000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
        ])
        expect(rows.map(row => row.secondsBeforeStart)).toEqual(['10', '0'])
        expect(planFromRows(rows)?.map(step => step.offsetMillis)).toEqual([-10_000, 0])
    })

    test('Dezimalsekunden werden auf Millisekunden gerundet', () => {
        const step = stepFromRow({
            key: 1,
            secondsBeforeStart: '2.5',
            frequencyHz: '700',
            durationMillis: '120',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '',
        })
        expect(step).toEqual({offsetMillis: -2500, frequencyHz: 700, durationMillis: 120})
    })

    test('Huellkurve: null wird zur Zeile "Abfallend", jede Zahl (auch 0) zu "Gehalten"', () => {
        const rows = rowsFromPlan([
            {offsetMillis: -1000, frequencyHz: 600, durationMillis: 100},
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        expect(rows[0].envelope).toBe('DECAY')
        expect(rows[0].releaseMillis).toBe('')
        expect(rows[1].envelope).toBe('HELD')
        expect(rows[1].releaseMillis).toBe('800')
        // 0 ist ein legitimer Gehalten-Wert und bleibt beim Roundtrip erhalten — KEINE
        // Normalisierung mehr zu "nicht gesetzt", sonst spraenge die Klanggestalt.
        const zeroRows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 0},
        ])
        expect(zeroRows[0].envelope).toBe('HELD')
        expect(zeroRows[0].releaseMillis).toBe('0')
        expect(planFromRows(zeroRows)).toEqual([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 0},
        ])
    })

    test('Ausklingen: Roundtrip erhaelt den Wert, "Abfallend" traegt nie ein releaseMillis', () => {
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        expect(planFromRows(rows)).toEqual([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400, releaseMillis: 800},
        ])
        // "Abfallend" ignoriert einen (noch) eingetragenen Ausklingen-Text — das Feld hat in
        // diesem Modus keine Bedeutung und darf die Zeile weder praegen noch kaputt machen.
        const decay = stepFromRow({
            key: 1,
            secondsBeforeStart: '0',
            frequencyHz: '900',
            durationMillis: '400',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '800',
        })
        expect(decay).toEqual({offsetMillis: 0, frequencyHz: 900, durationMillis: 400})
    })

    test('leere oder unsinnige Felder machen die Zeile ungueltig', () => {
        const base = {
            key: 1,
            secondsBeforeStart: '5',
            frequencyHz: '600',
            durationMillis: '100',
            envelope: 'DECAY',
            waveform: 'SINE',
        } as const
        const decayBase = {...base, releaseMillis: ''}
        expect(stepFromRow({...decayBase, secondsBeforeStart: ''})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: 'abc'})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: '600.5'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: ''})).toBeNull()
        // Grenzen aus tonePlan.ts greifen auch hier (Dauer seit dem Fehlstart-Ton bis 10 s).
        expect(stepFromRow({...decayBase, secondsBeforeStart: '-1'})).toBeNull()
        expect(stepFromRow({...decayBase, frequencyHz: '99'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: '10001'})).toBeNull()
        expect(stepFromRow({...decayBase, durationMillis: '2001'})).not.toBeNull()
        // Gehalten: 0-5000 ganze ms, ein leeres Feld ist hier ein FEHLER (der Wert hat Bedeutung).
        const held = {...base, envelope: 'HELD'} as const
        expect(stepFromRow({...held, releaseMillis: ''})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '-1'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '5001'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '2.5'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: 'abc'})).toBeNull()
        expect(stepFromRow({...held, releaseMillis: '0'})).toEqual({
            offsetMillis: -5000,
            frequencyHz: 600,
            durationMillis: 100,
            releaseMillis: 0,
        })
        expect(stepFromRow({...held, releaseMillis: '5000'})).not.toBeNull()
    })

    test('Wellenform: Roundtrip erhaelt sie, explizites SINE wird zu "nicht gesetzt"', () => {
        // Gespeichertes Rechteck kommt als Rechteck-Zeile wieder hoch und geht als Rechteck zurueck.
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 440, durationMillis: 300, waveform: 'SQUARE'},
        ])
        expect(rows[0].waveform).toBe('SQUARE')
        expect(planFromRows(rows)).toEqual([
            {offsetMillis: 0, frequencyHz: 440, durationMillis: 300, waveform: 'SQUARE'},
        ])
        // Ohne waveform (Alt-Bestand) zeigt die Zeile Sinus.
        expect(rowsFromPlan([{offsetMillis: 0, frequencyHz: 900, durationMillis: 400}])[0].waveform).toBe(
            'SINE',
        )
        // Explizit gewaehlter Sinus wird zu "nicht gesetzt" normalisiert: SINE und null sind
        // KLANGGLEICH (gleicher Oszillatortyp, gleicher Formfaktor) — hier verschluckt die
        // Normalisierung also keine Bedeutung, anders als es bei releaseMillis 0 vs null waere.
        const sineStep = stepFromRow({
            key: 1,
            secondsBeforeStart: '0',
            frequencyHz: '900',
            durationMillis: '400',
            envelope: 'DECAY',
            waveform: 'SINE',
            releaseMillis: '',
        })
        expect(sineStep).toEqual({offsetMillis: 0, frequencyHz: 900, durationMillis: 400})
        // Wellenform und Huellkurve sind unabhaengig: gehaltener Saegezahn traegt beides.
        const held = stepFromRow({
            key: 2,
            secondsBeforeStart: '0',
            frequencyHz: '440',
            durationMillis: '800',
            envelope: 'HELD',
            waveform: 'SAWTOOTH',
            releaseMillis: '800',
        })
        expect(held).toEqual({
            offsetMillis: 0,
            frequencyHz: 440,
            durationMillis: 800,
            releaseMillis: 800,
            waveform: 'SAWTOOTH',
        })
    })

    test('planFromRows liefert null, sobald eine Zeile kaputt ist, sonst sortiert', () => {
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -3000, frequencyHz: 600, durationMillis: 100},
        ])
        expect(planFromRows(rows)?.map(step => step.offsetMillis)).toEqual([-3000, 0])
        expect(
            planFromRows([
                ...rows,
                {
                    key: 99,
                    secondsBeforeStart: 'x',
                    frequencyHz: '600',
                    durationMillis: '100',
                    envelope: 'DECAY',
                    waveform: 'SINE',
                    releaseMillis: '',
                },
            ]),
        ).toBeNull()
    })
})
