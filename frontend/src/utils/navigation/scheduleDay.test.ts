import {describe, expect, it} from 'vitest'
import {parseScheduleDay, resolveScheduleDay, SCHEDULE_ALL_DAYS} from './scheduleDay.ts'

describe('parseScheduleDay', () => {
    it('nimmt „all" und ISO-Daten an', () => {
        expect(parseScheduleDay('all')).toBe(SCHEDULE_ALL_DAYS)
        expect(parseScheduleDay('2026-08-14')).toBe('2026-08-14')
    })

    it('verwirft alles andere', () => {
        expect(parseScheduleDay(undefined)).toBeUndefined()
        expect(parseScheduleDay('')).toBeUndefined()
        expect(parseScheduleDay('heute')).toBeUndefined()
        expect(parseScheduleDay('14.08.2026')).toBeUndefined()
        expect(parseScheduleDay('2026-08-14T10:00')).toBeUndefined()
        expect(parseScheduleDay(20260814)).toBeUndefined()
        expect(parseScheduleDay(['2026-08-14'])).toBeUndefined()
    })
})

describe('resolveScheduleDay', () => {
    const days = ['2026-08-14', '2026-08-15', '2026-08-16']

    it('behält eine gültige Wahl', () => {
        expect(resolveScheduleDay('2026-08-15', days, '2026-08-14')).toBe('2026-08-15')
        expect(resolveScheduleDay('all', days, '2026-08-14')).toBe('all')
    })

    it('fällt ohne Wahl auf heute, wenn heute Läufe hat', () => {
        expect(resolveScheduleDay(undefined, days, '2026-08-15')).toBe('2026-08-15')
    })

    it('fällt ohne Wahl auf alle Tage, wenn heute keine Läufe hat', () => {
        expect(resolveScheduleDay(undefined, days, '2026-11-13')).toBe('all')
    })

    it('behandelt einen Tag ohne Läufe wie keine Wahl', () => {
        expect(resolveScheduleDay('2026-09-01', days, '2026-08-16')).toBe('2026-08-16')
        expect(resolveScheduleDay('2026-09-01', days, '2026-11-13')).toBe('all')
        expect(resolveScheduleDay('2026-08-14', [], '2026-08-14')).toBe('all')
    })
})
