import {describe, expect, it} from 'vitest'
import {roleLabel} from './roleLabels'

const t = (key: string) => (key === 'job.TIMEKEEPER.name' ? 'Zeitnahme' : key)

describe('roleLabel', () => {
    it('zeigt bei statischen Rollen den übersetzten Jobnamen', () => {
        expect(roleLabel({name: 'Timekeeper', job: 'TIMEKEEPER', static: true}, t as never)).toBe('Zeitnahme')
    })
    it('zeigt bei Kopien den eigenen Namen', () => {
        expect(roleLabel({name: 'Zeitnahme Steg B', job: 'TIMEKEEPER', static: false}, t as never)).toBe('Zeitnahme Steg B')
    })
    it('fällt ohne Übersetzung auf den Datenbanknamen zurück', () => {
        expect(roleLabel({name: 'Admin', job: 'ADMIN', static: true}, t as never)).toBe('Admin')
    })
})
