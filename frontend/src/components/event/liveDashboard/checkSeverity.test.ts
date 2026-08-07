import {describe, expect, test} from 'vitest'
import {rowSummary} from './checkSeverity.ts'

describe('rowSummary', () => {
    test('nennt den Wert, wenn alle Wettkämpfe ihn teilen', () => {
        expect(rowSummary(['CRITICAL', 'CRITICAL'])).toEqual({kind: 'uniform', severity: 'CRITICAL'})
    })

    test('meldet gemischt, sobald ein Wettkampf abweicht', () => {
        expect(rowSummary(['CRITICAL', 'WARNING'])).toEqual({kind: 'mixed'})
    })

    test('ohne Wettkämpfe gibt es nichts zu verdichten', () => {
        expect(rowSummary([])).toEqual({kind: 'mixed'})
    })
})
