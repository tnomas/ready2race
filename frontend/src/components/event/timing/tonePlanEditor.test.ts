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
        })
        expect(step).toEqual({offsetMillis: -2500, frequencyHz: 700, durationMillis: 120})
    })

    test('leere oder unsinnige Felder machen die Zeile ungueltig', () => {
        const base = {key: 1, secondsBeforeStart: '5', frequencyHz: '600', durationMillis: '100'}
        expect(stepFromRow({...base, secondsBeforeStart: ''})).toBeNull()
        expect(stepFromRow({...base, frequencyHz: 'abc'})).toBeNull()
        expect(stepFromRow({...base, frequencyHz: '600.5'})).toBeNull()
        expect(stepFromRow({...base, durationMillis: ''})).toBeNull()
        // Grenzen aus tonePlan.ts greifen auch hier.
        expect(stepFromRow({...base, secondsBeforeStart: '-1'})).toBeNull()
        expect(stepFromRow({...base, frequencyHz: '99'})).toBeNull()
        expect(stepFromRow({...base, durationMillis: '2001'})).toBeNull()
    })

    test('planFromRows liefert null, sobald eine Zeile kaputt ist, sonst sortiert', () => {
        const rows = rowsFromPlan([
            {offsetMillis: 0, frequencyHz: 900, durationMillis: 400},
            {offsetMillis: -3000, frequencyHz: 600, durationMillis: 100},
        ])
        expect(planFromRows(rows)?.map(step => step.offsetMillis)).toEqual([-3000, 0])
        expect(planFromRows([...rows, {key: 99, secondsBeforeStart: 'x', frequencyHz: '600', durationMillis: '100'}])).toBeNull()
    })
})
