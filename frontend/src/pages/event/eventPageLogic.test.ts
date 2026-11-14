import {describe, expect, test} from 'vitest'
import {Privilege} from '@api/types.gen.ts'
import {
    canEditEvent,
    eventDateRange,
    settingsAnchorFromHash,
    settingsAnchorId,
    visibleResultActions,
} from './eventPageLogic.ts'

const scopeLevel = {OWN: 1, GLOBAL: 2} as const

// Wie der Benutzerkontext: GLOBAL schließt OWN ein.
const checkOf =
    (...granted: Privilege[]) =>
    (privilege: Privilege) =>
        granted.some(
            p =>
                p.action === privilege.action &&
                p.resource === privilege.resource &&
                scopeLevel[p.scope] >= scopeLevel[privilege.scope],
        )

const p = (
    action: Privilege['action'],
    resource: Privilege['resource'],
    scope: Privilege['scope'] = 'GLOBAL',
): Privilege => ({action, resource, scope})

const anonymous = {checkPrivilege: () => false, loggedIn: false}
const regatta = {published: true, challengeEvent: false}
const draft = {published: false, challengeEvent: false}
const challengeDone = {published: true, challengeEvent: true, challengesFinished: true}
const challengeRunning = {published: true, challengeEvent: true, challengesFinished: false}

describe('canEditEvent', () => {
    test('wie das ⋮-Menü der Liste: UPDATE EVENT ab OWN', () => {
        expect(canEditEvent(checkOf())).toBe(false)
        expect(canEditEvent(checkOf(p('READ', 'EVENT')))).toBe(false)
        expect(canEditEvent(checkOf(p('UPDATE', 'EVENT', 'OWN')))).toBe(true)
        expect(canEditEvent(checkOf(p('UPDATE', 'EVENT', 'GLOBAL')))).toBe(true)
    })
})

describe('visibleResultActions', () => {
    test('anonym bei veröffentlichter Regatta: Ergebnisseite und Download', () => {
        expect(visibleResultActions(anonymous, regatta)).toEqual([
            'publicResults',
            'downloadResults',
        ])
    })

    test('anonym bei unveröffentlichter Veranstaltung: nur die Ergebnisseite', () => {
        expect(visibleResultActions(anonymous, draft)).toEqual(['publicResults'])
    })

    test('Veranstaltung lesen: alle Ergebnis-Dokumente, auch unveröffentlicht', () => {
        const viewer = {checkPrivilege: checkOf(p('READ', 'EVENT')), loggedIn: true}
        expect(visibleResultActions(viewer, draft)).toEqual([
            'publicResults',
            'downloadResults',
            'resultList',
            'awardCeremony',
            'awardCertificates',
        ])
    })

    test('Challenge: keine Ergebnis-Dokumente, Teilnahmeurkunden erst nach dem Ende', () => {
        const admin = {
            checkPrivilege: checkOf(p('READ', 'EVENT'), p('UPDATE', 'EVENT')),
            loggedIn: true,
        }
        expect(visibleResultActions(admin, challengeRunning)).toEqual(['publicResults'])
        expect(visibleResultActions(admin, challengeDone)).toEqual([
            'publicResults',
            'sendParticipationCertificates',
        ])
    })

    test('Verein bei beendeter Challenge: eigene Teilnahmeurkunden, nur mit Verein', () => {
        const check = checkOf(p('READ', 'CLUB', 'OWN'))
        expect(
            visibleResultActions(
                {checkPrivilege: check, loggedIn: true, clubId: 'c1'},
                challengeDone,
            ),
        ).toEqual(['publicResults', 'downloadParticipationCertificates'])
        expect(
            visibleResultActions(
                {checkPrivilege: check, loggedIn: true, clubId: null},
                challengeDone,
            ),
        ).toEqual(['publicResults'])
        expect(
            visibleResultActions(
                {checkPrivilege: check, loggedIn: true, clubId: 'c1'},
                challengeRunning,
            ),
        ).toEqual(['publicResults'])
    })

    test('niemand sieht Siegerurkunden oder Listen ohne Veranstaltungs-Leserecht', () => {
        const club = {
            checkPrivilege: checkOf(p('READ', 'CLUB', 'OWN')),
            loggedIn: true,
            clubId: 'c',
        }
        const actions = visibleResultActions(club, regatta)
        expect(actions).not.toContain('resultList')
        expect(actions).not.toContain('awardCeremony')
        expect(actions).not.toContain('awardCertificates')
    })
})

describe('eventDateRange', () => {
    test('ohne Tage null', () => {
        expect(eventDateRange([])).toBeNull()
        expect(eventDateRange(['kein Datum'])).toBeNull()
    })

    test('frühester und spätester Tag, unabhängig von der Reihenfolge', () => {
        expect(eventDateRange(['2026-08-16', '2026-08-14', '2026-08-15'])).toEqual({
            from: '2026-08-14',
            to: '2026-08-16',
        })
    })

    test('ein Tag: Anfang gleich Ende', () => {
        expect(eventDateRange(['2026-08-14'])).toEqual({from: '2026-08-14', to: '2026-08-14'})
    })
})

describe('Sprunganker der Einstellungen', () => {
    test('kurzer Anker, volle ID und unbekannte Werte', () => {
        expect(settingsAnchorFromHash('#timing')).toBe('timing')
        expect(settingsAnchorFromHash('documents')).toBe('documents')
        expect(settingsAnchorFromHash('#event-settings-execution')).toBe('execution')
        expect(settingsAnchorFromHash('#unbekannt')).toBeNull()
        expect(settingsAnchorFromHash('')).toBeNull()
        expect(settingsAnchorFromHash(undefined)).toBeNull()
    })

    test('Element-IDs tragen ein Präfix', () => {
        expect(settingsAnchorId('rating-categories')).toBe('event-settings-rating-categories')
    })
})
