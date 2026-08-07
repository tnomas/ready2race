import {describe, expect, test} from 'vitest'
import {CheckSeverityConfigDto, CheckSeverityEntryDto, CheckSeverityRowDefaultDto} from '@api/types.gen.ts'
import {rowSummary, severityAt} from './checkSeverity.ts'

describe('rowSummary', () => {
    test('nennt den Wert, wenn alle Wettkämpfe ihn teilen', () => {
        expect(rowSummary(['CRITICAL', 'CRITICAL'])).toEqual({kind: 'uniform', severity: 'CRITICAL'})
    })

    test('meldet gemischt, sobald ein Wettkampf abweicht', () => {
        expect(rowSummary(['CRITICAL', 'WARNING'])).toEqual({kind: 'mixed'})
    })

    test('ohne Wettkämpfe gibt es nichts zu verdichten - das darf der Aufrufer nicht mehr versuchen', () => {
        expect(() => rowSummary([])).toThrow()
    })
})

describe('severityAt', () => {
    const config = (defaults: CheckSeverityRowDefaultDto[]): CheckSeverityConfigDto => ({
        competitions: [],
        rows: [],
        defaults,
        entries: [],
    })

    test('ein vorhandener Eintrag schlägt den Standard', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'OK'},
        ]
        const cfg = config([{checkType: 'INVOICE_OPEN', requirementId: null, severity: 'CRITICAL'}])
        expect(severityAt(cfg, entries, 'c1', 'INVOICE_OPEN', null)).toBe('OK')
    })

    test('ein fehlender Eintrag ergibt den Standard der passenden Zeile', () => {
        const cfg = config([{checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'}])
        expect(severityAt(cfg, [], 'c1', 'INVOICE_OPEN', null)).toBe('WARNING')
    })

    test('ein Eintrag eines anderen Wettkampfs wirkt nicht', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'anderer-wettkampf', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'OK'},
        ]
        const cfg = config([{checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'}])
        expect(severityAt(cfg, entries, 'c1', 'INVOICE_OPEN', null)).toBe('WARNING')
    })

    test('ein Eintrag einer anderen Bedingung wirkt nicht', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'REQUIREMENT', requirementId: 'req-1', severity: 'OK'},
        ]
        const cfg = config([{checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'}])
        expect(severityAt(cfg, entries, 'c1', 'INVOICE_OPEN', null)).toBe('WARNING')
    })

    test('requirementId als null im Eintrag und als undefined in der Abfrage werden gleich behandelt', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'OK'},
        ]
        const cfg = config([])
        expect(severityAt(cfg, entries, 'c1', 'INVOICE_OPEN', null)).toBe('OK')
    })

    test('requirementId als undefined im Eintrag und als null in der Abfrage werden gleich behandelt', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', severity: 'OK'},
        ]
        const cfg = config([])
        expect(severityAt(cfg, entries, 'c1', 'INVOICE_OPEN', null)).toBe('OK')
    })

    test('requirementId als undefined im Standard und als null in der Abfrage werden gleich behandelt', () => {
        const cfgWithUndefinedDefault: CheckSeverityConfigDto = {
            competitions: [],
            rows: [],
            defaults: [{checkType: 'INVOICE_OPEN', severity: 'WARNING'}],
            entries: [],
        }
        expect(severityAt(cfgWithUndefinedDefault, [], 'c1', 'INVOICE_OPEN', null)).toBe('WARNING')
    })

    test('ein Standard einer anderen requirementId wirkt nicht', () => {
        const cfg = config([{checkType: 'REQUIREMENT', requirementId: 'req-1', severity: 'WARNING'}])
        expect(severityAt(cfg, [], 'c1', 'REQUIREMENT', 'req-2')).toBe('CRITICAL')
    })

    test('ohne Eintrag und ohne passenden Standard bleibt der fest verdrahtete Ersatzwert', () => {
        const cfg = config([])
        expect(severityAt(cfg, [], 'c1', 'INVOICE_OPEN', null)).toBe('CRITICAL')
    })
})
