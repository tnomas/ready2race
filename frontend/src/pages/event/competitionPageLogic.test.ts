import {describe, expect, test} from 'vitest'
import {Privilege} from '@api/types.gen.ts'
import {
    adjacentCompetitions,
    canEditCompetition,
    COMPETITION_PAGE_TABS,
    competitionCrumbLabel,
    competitionTabSearch,
    CompetitionTabContext,
    resolveCompetitionTab,
    validateCompetitionSearch,
    visibleCompetitionTabs,
} from './competitionPageLogic.ts'

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

const closed: CompetitionTabContext = {
    challengeEvent: false,
    registrationCount: 0,
    registrationState: 'CLOSED',
}

const admin = {
    loggedIn: true,
    checkPrivilege: checkOf(p('UPDATE', 'EVENT'), p('READ', 'REGISTRATION'), p('READ', 'RESULT')),
}

describe('visibleCompetitionTabs', () => {
    test('Admin sieht alle Reiter in Arbeitsablauf-Reihenfolge', () => {
        expect(visibleCompetitionTabs(admin, closed)).toEqual([
            'general',
            'registrations',
            'teams',
            'setup',
            'timing',
            'execution',
            'places',
        ])
    })

    test('Anonym sieht nur Allgemein, auch bei offener Meldung', () => {
        const anonymous = {loggedIn: false, checkPrivilege: () => false}
        expect(
            visibleCompetitionTabs(anonymous, {...closed, registrationState: 'REGULAR'}),
        ).toEqual(['general'])
    })

    test('Meldungen für Angemeldete: offen, Nachmeldung oder vorhandene Meldungen', () => {
        const member = {loggedIn: true, checkPrivilege: () => false}
        expect(visibleCompetitionTabs(member, closed)).toEqual(['general'])
        expect(visibleCompetitionTabs(member, {...closed, registrationState: 'REGULAR'})).toEqual([
            'general',
            'registrations',
        ])
        expect(visibleCompetitionTabs(member, {...closed, registrationState: 'LATE'})).toEqual([
            'general',
            'registrations',
        ])
        expect(visibleCompetitionTabs(member, {...closed, registrationCount: 3})).toEqual([
            'general',
            'registrations',
        ])
    })

    test('Challenge blendet Rundenstruktur, Zeitnahme, Durchführung und Platzierungen aus', () => {
        expect(visibleCompetitionTabs(admin, {...closed, challengeEvent: true})).toEqual([
            'general',
            'registrations',
            'teams',
        ])
    })

    test('UPDATE EVENT nur OWN reicht nicht für die Arbeitsreiter', () => {
        const own = {loggedIn: true, checkPrivilege: checkOf(p('UPDATE', 'EVENT', 'OWN'))}
        expect(visibleCompetitionTabs(own, closed)).toEqual(['general'])
    })

    test('READ RESULT allein zeigt Platzierungen', () => {
        const results = {loggedIn: true, checkPrivilege: checkOf(p('READ', 'RESULT'))}
        expect(visibleCompetitionTabs(results, closed)).toEqual(['general', 'places'])
    })
})

describe('resolveCompetitionTab', () => {
    const visible = ['general', 'registrations', 'places'] as const

    test('sichtbarer Reiter bleibt', () => {
        expect(resolveCompetitionTab('places', [...visible])).toBe('places')
    })

    test('unsichtbarer, unbekannter oder fehlender Reiter fällt auf den ersten sichtbaren', () => {
        expect(resolveCompetitionTab('execution', [...visible])).toBe('general')
        expect(resolveCompetitionTab('xyz', [...visible])).toBe('general')
        expect(resolveCompetitionTab(undefined, [...visible])).toBe('general')
        expect(resolveCompetitionTab('setup', ['teams', 'setup'])).toBe('setup')
        expect(resolveCompetitionTab('places', ['teams', 'setup'])).toBe('teams')
    })

    test('ohne sichtbare Reiter: Allgemein', () => {
        expect(resolveCompetitionTab('places', [])).toBe('general')
    })
})

describe('validateCompetitionSearch', () => {
    test('nimmt bekannte Reiter, verwirft alles andere', () => {
        for (const tab of COMPETITION_PAGE_TABS) {
            expect(validateCompetitionSearch({tab})).toEqual({tab})
        }
        expect(validateCompetitionSearch({tab: 'xyz'})).toEqual({tab: undefined})
        expect(validateCompetitionSearch({tab: 3})).toEqual({tab: undefined})
        expect(validateCompetitionSearch({})).toEqual({tab: undefined})
    })
})

describe('competitionTabSearch', () => {
    test('Allgemein ohne Suchparameter, sonst mit', () => {
        expect(competitionTabSearch('general')).toEqual({tab: undefined})
        expect(competitionTabSearch('execution')).toEqual({tab: 'execution'})
    })
})

describe('adjacentCompetitions', () => {
    const list = [{id: 'a'}, {id: 'b'}, {id: 'c'}]

    test('Mitte hat beide Nachbarn', () => {
        expect(adjacentCompetitions(list, 'b')).toEqual({previous: {id: 'a'}, next: {id: 'c'}})
    })

    test('Ränder haben nur einen Nachbarn', () => {
        expect(adjacentCompetitions(list, 'a')).toEqual({previous: undefined, next: {id: 'b'}})
        expect(adjacentCompetitions(list, 'c')).toEqual({previous: {id: 'b'}, next: undefined})
    })

    test('unbekannter Wettkampf oder leere Liste: keine Nachbarn', () => {
        expect(adjacentCompetitions(list, 'x')).toEqual({})
        expect(adjacentCompetitions([], 'a')).toEqual({})
    })
})

describe('canEditCompetition', () => {
    test('UPDATE EVENT ab OWN wie in der Wettkampftabelle', () => {
        expect(canEditCompetition(checkOf(p('UPDATE', 'EVENT', 'OWN')))).toBe(true)
        expect(canEditCompetition(checkOf(p('UPDATE', 'EVENT')))).toBe(true)
        expect(canEditCompetition(checkOf(p('READ', 'EVENT')))).toBe(false)
    })
})

describe('competitionCrumbLabel', () => {
    test('Kennung plus Kurzname, sonst Name', () => {
        expect(competitionCrumbLabel({identifier: '12', name: 'Junioren', shortName: 'JM4x'})).toBe(
            '12 JM4x',
        )
        expect(competitionCrumbLabel({identifier: '12', name: 'Junioren'})).toBe('12 Junioren')
        expect(competitionCrumbLabel({identifier: '12', name: 'Junioren', shortName: ''})).toBe(
            '12 Junioren',
        )
    })
})
