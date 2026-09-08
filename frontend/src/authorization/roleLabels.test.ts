import {describe, expect, it} from 'vitest'
import {jobName, roleDescription, roleLabel} from './roleLabels'

const t = (key: string) =>
    ({
        'job.TIMEKEEPER.name': 'Zeitnahme',
        'job.TIMEKEEPER.description': 'Nimmt Zeiten ab und trägt sie ein.',
    })[key] ?? key

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

describe('jobName', () => {
    it('übersetzt den Job-Schlüssel', () => {
        expect(jobName('TIMEKEEPER', t as never)).toBe('Zeitnahme')
    })
    it('fällt ohne Übersetzung auf den Schlüssel zurück', () => {
        expect(jobName('UNKNOWN', t as never)).toBe('UNKNOWN')
    })
})

describe('roleDescription', () => {
    it('zeigt bei gesetztem Job mit Übersetzung die Jobbeschreibung', () => {
        expect(roleDescription({description: undefined, job: 'TIMEKEEPER'}, t as never)).toBe('Nimmt Zeiten ab und trägt sie ein.')
    })
    it('zeigt bei gesetztem Job ohne Übersetzung die Datenbankbeschreibung', () => {
        expect(roleDescription({description: 'Eigene Beschreibung', job: 'UNKNOWN'}, t as never)).toBe('Eigene Beschreibung')
    })
    it('zeigt ohne Job die Datenbankbeschreibung', () => {
        expect(roleDescription({description: 'Eigene Beschreibung', job: undefined}, t as never)).toBe('Eigene Beschreibung')
    })
    it('ist leer, wenn beides fehlt', () => {
        expect(roleDescription({description: undefined, job: undefined}, t as never)).toBe('')
    })
})
