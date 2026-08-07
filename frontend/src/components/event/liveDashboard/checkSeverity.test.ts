import {describe, expect, test} from 'vitest'
import {
    CheckSeverityCompetitionDto,
    CheckSeverityConfigDto,
    CheckSeverityEntryDto,
    CheckSeverityRowDefaultDto,
} from '@api/types.gen.ts'
import {buildSavePayload, preservedEntries, rowSummary, severityAt} from './checkSeverity.ts'

describe('rowSummary', () => {
    test('nennt den Wert, wenn alle Wettkämpfe ihn teilen', () => {
        expect(rowSummary(['CRITICAL', 'CRITICAL'])).toEqual({kind: 'uniform', severity: 'CRITICAL'})
    })

    test('meldet gemischt, sobald ein Wettkampf abweicht', () => {
        expect(rowSummary(['CRITICAL', 'WARNING'])).toEqual({kind: 'mixed'})
    })

    test('meldet leer, wenn kein Wettkampf diese Zeile hat', () => {
        expect(rowSummary([])).toEqual({kind: 'empty'})
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

    test('ohne Eintrag und ohne passenden Standard greift die Notbremse CRITICAL - eigentlich widersprüchliche Serverdaten', () => {
        const cfg = config([])
        expect(severityAt(cfg, [], 'c1', 'INVOICE_OPEN', null)).toBe('CRITICAL')
    })
})

describe('preservedEntries', () => {
    const competition = (
        competitionId: string,
        checkInOutRequired: boolean,
    ): CheckSeverityCompetitionDto => ({
        competitionId,
        identifier: competitionId,
        name: competitionId,
        checkInOutRequired,
    })

    const config = (
        competitions: CheckSeverityCompetitionDto[],
        entries: CheckSeverityEntryDto[],
    ): CheckSeverityConfigDto => ({
        competitions,
        rows: [],
        defaults: [],
        entries,
    })

    test('ein gespeicherter Wert für eine nicht mehr anwendbare Kombination wird erhalten', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'NOT_ON_WATER', requirementId: null, severity: 'OK'},
        ]
        const cfg = config([competition('c1', false)], entries)
        expect(preservedEntries(cfg)).toEqual(entries)
    })

    test('ein gespeicherter Wert für eine weiterhin anwendbare Kombination wird nicht erhalten', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'NOT_ON_WATER', requirementId: null, severity: 'OK'},
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'},
        ]
        const cfg = config([competition('c1', true)], entries)
        expect(preservedEntries(cfg)).toEqual([])
    })

    test('ein Eintrag zu einem inzwischen entfernten Wettkampf wird ebenfalls erhalten', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'geloescht', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'OK'},
        ]
        const cfg = config([], entries)
        expect(preservedEntries(cfg)).toEqual(entries)
    })
})

describe('buildSavePayload', () => {
    test('bewahrte Einträge nicht anwendbarer Kombinationen werden unverändert angehängt', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'},
        ]
        const preserved: CheckSeverityEntryDto[] = [
            {competitionId: 'c2', checkType: 'NOT_ON_WATER', requirementId: null, severity: 'OK'},
        ]
        expect(buildSavePayload(entries, preserved)).toEqual([...entries, ...preserved])
    })

    test('ohne bewahrte Einträge bleibt die Matrix unverändert', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'},
        ]
        expect(buildSavePayload(entries, [])).toEqual(entries)
    })

    test('ein bewahrter Eintrag, der in der Matrix schon vorkommt, wird nicht verdoppelt', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'WARNING'},
        ]
        const preserved: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'INVOICE_OPEN', requirementId: null, severity: 'CRITICAL'},
        ]
        expect(buildSavePayload(entries, preserved)).toEqual(entries)
    })

    test('requirementId als null und als undefined gelten als derselbe Schlüssel', () => {
        const entries: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'REQUIREMENT', requirementId: 'req-1', severity: 'WARNING'},
        ]
        const preserved: CheckSeverityEntryDto[] = [
            {competitionId: 'c1', checkType: 'REQUIREMENT', requirementId: 'req-1', severity: 'CRITICAL'},
        ]
        expect(buildSavePayload(entries, preserved)).toEqual(entries)
    })
})
