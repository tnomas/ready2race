import {describe, expect, it} from 'vitest'
import {bandTypeOf, decideScan} from './scanDecision'

describe('bandTypeOf', () => {
    it('nennt eine leere Antwort unbekannt', () => {
        expect(bandTypeOf(null)).toBe('UNKNOWN')
    })

    it('unterscheidet Helfer- und Teilnehmerband am Typ', () => {
        const base = {firstname: 'A', lastname: 'B', qrCodeId: 'q', eventId: 'e'}
        expect(bandTypeOf({...base, type: 'User'})).toBe('USER')
        expect(bandTypeOf({...base, type: 'Participant'})).toBe('PARTICIPANT')
        // Ohne Typ ist es eine Teilnehmerantwort: nur die trägt Wettkämpfe.
        expect(bandTypeOf({...base, competitions: []})).toBe('PARTICIPANT')
    })
})

describe('decideScan – unbekanntes Band', () => {
    it('führt zur Zuweisung, wenn die Person Bänder verwalten darf, egal in welchem Modus', () => {
        expect(
            decideScan({band: 'UNKNOWN', rights: ['APP_QR_MANAGEMENT'], mode: null}),
        ).toEqual({kind: 'ASSIGN'})
        expect(
            decideScan({
                band: 'UNKNOWN',
                rights: ['APP_QR_MANAGEMENT', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_EVENT_REQUIREMENT',
            }),
        ).toEqual({kind: 'ASSIGN'})
    })

    it('ist sonst ein Fehler', () => {
        expect(
            decideScan({band: 'UNKNOWN', rights: ['APP_EVENT_REQUIREMENT'], mode: null}),
        ).toEqual({kind: 'UNKNOWN_NOT_ALLOWED'})
    })
})

describe('decideScan – bekanntes Band', () => {
    it('handelt mit genau einem Recht sofort', () => {
        expect(
            decideScan({band: 'PARTICIPANT', rights: ['APP_COMPETITION_CHECK'], mode: null}),
        ).toEqual({kind: 'ACT', mode: 'APP_COMPETITION_CHECK', canRemove: false})
        expect(decideScan({band: 'USER', rights: ['APP_QR_MANAGEMENT'], mode: null})).toEqual({
            kind: 'ACT',
            mode: 'APP_QR_MANAGEMENT',
            canRemove: true,
        })
    })

    it('fragt bei mehreren Rechten ohne Modus', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT'],
                mode: null,
            }),
        ).toEqual({kind: 'CHOOSE', options: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT']})
    })

    it('folgt dem gemerkten Modus und bietet das Entfernen als Nebenweg an', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_QR_MANAGEMENT', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_EVENT_REQUIREMENT',
            }),
        ).toEqual({kind: 'ACT', mode: 'APP_EVENT_REQUIREMENT', canRemove: true})
    })

    it('ignoriert einen Modus, den die Rechte nicht mehr decken', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_CATERER',
            }),
        ).toEqual({kind: 'CHOOSE', options: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT']})
        expect(
            decideScan({band: 'USER', rights: ['APP_CATERER'], mode: 'APP_QR_MANAGEMENT'}),
        ).toEqual({kind: 'ACT', mode: 'APP_CATERER', canRemove: false})
    })

    it('ist ohne Recht unbekannt-nicht-erlaubt gleichwertig: keine Rechte, keine Handlung', () => {
        expect(decideScan({band: 'PARTICIPANT', rights: [], mode: null})).toEqual({
            kind: 'CHOOSE',
            options: [],
        })
    })
})
