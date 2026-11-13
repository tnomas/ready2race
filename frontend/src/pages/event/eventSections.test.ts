import {describe, expect, test} from 'vitest'
import {Action, Privilege, Resource, Scope} from '@api/types.gen.ts'
import deTranslations from '@i18n/de/translations.json'
import enTranslations from '@i18n/en/translations.json'
import daTranslations from '@i18n/da/translations.json'
import {
    EVENT_SECTION_GROUP_LABEL_KEYS,
    EVENT_SECTION_KEYS,
    EVENT_SECTIONS,
    EventSectionAccess,
    EventSectionKey,
    groupEventSections,
    isEventSectionKey,
    resolveEventTab,
    sectionForRoute,
    showEventSectionGroupHeadings,
    validateEventSearch,
    visibleEventSections,
} from './eventSections.ts'
import {BETRIEB_ACTION_TILE, visibleBetriebActions} from './tabs/betriebTiles.ts'

// --- Testgerüst: dieselbe Rechte-Logik wie UserProvider (GLOBAL schließt OWN ein) ---

const scopeLevel: Record<Scope, number> = {OWN: 0, GLOBAL: 1}

const accessOf = (...granted: Privilege[]): EventSectionAccess => ({
    checkPrivilege: privilege =>
        granted.some(
            p =>
                p.action === privilege.action &&
                p.resource === privilege.resource &&
                scopeLevel[p.scope] >= scopeLevel[privilege.scope],
        ),
    getPrivilegeScope: (action: Action, resource: Resource) =>
        granted
            .filter(p => p.action === action && p.resource === resource)
            .reduce<
                Scope | undefined
            >((scope, p) => (scope === undefined || scopeLevel[p.scope] > scopeLevel[scope] ? p.scope : scope), undefined),
})

const g = (action: Action, resource: Resource): Privilege => ({action, resource, scope: 'GLOBAL'})
const o = (action: Action, resource: Resource): Privilege => ({action, resource, scope: 'OWN'})

const keysOf = (access: EventSectionAccess) => visibleEventSections(access).map(s => s.key)

/**
 * Die Reiter-Regeln der Veranstaltungsseite, wie sie bis zur Bereichsnavigation in EventPage.tsx
 * standen (13.11.2026) — wörtlich übertragen, damit der Vergleichstest unten belegt, dass das
 * Bereichsmodell niemandem etwas zeigt oder nimmt.
 */
const legacyTabs = (user: EventSectionAccess): EventSectionKey[] => {
    const c = user.checkPrivilege
    const tabs: EventSectionKey[] = ['general', 'competitions']
    if (c(o('READ', 'REGISTRATION')) || c(g('READ', 'REGISTRATION'))) tabs.push('participants')
    // Seit 13.11.2026 (P14b) auch mit Meldungen lesen OWN: das Backend liefert dann nur die
    // eigene Meldung. Die einzige gewollte Abweichung von den alten Reiter-Regeln.
    if (c(g('READ', 'EVENT')) || c(o('READ', 'REGISTRATION'))) tabs.push('registrations')
    if (c(g('READ', 'EVENT')) && c(g('READ', 'USER'))) tabs.push('organization')
    if (c(g('READ', 'EVENT'))) tabs.push('schedule')
    // Betrieb: mindestens eine Kachel (Stand vor der Regattabüro-Kachel)
    if (
        c(g('READ', 'LIVE_DASHBOARD')) ||
        c(g('READ', 'EVENT')) ||
        c(g('READ', 'BOARD')) ||
        c(g('UPDATE', 'EVENT')) ||
        c(g('READ', 'STREAM'))
    ) {
        tabs.push('betrieb')
    }
    if (c(g('READ', 'EVENT'))) tabs.push('settings')
    if ((user.getPrivilegeScope('READ', 'INVOICE') && true) || c(g('CREATE', 'INVOICE'))) {
        tabs.push('invoices')
    }
    return tabs
}

// --- Rollen, wie sie im Betrieb vorkommen ---

const admin = accessOf(
    g('READ', 'EVENT'),
    g('UPDATE', 'EVENT'),
    g('READ', 'USER'),
    g('READ', 'REGISTRATION'),
    g('READ', 'INVOICE'),
    g('CREATE', 'INVOICE'),
    g('READ', 'LIVE_DASHBOARD'),
    g('READ', 'BOARD'),
    g('READ', 'STREAM'),
)
const anonymous: EventSectionAccess = {
    checkPrivilege: () => false,
    getPrivilegeScope: () => undefined,
}
const clubRepresentative = accessOf(
    o('READ', 'CLUB'),
    o('READ', 'REGISTRATION'),
    o('CREATE', 'REGISTRATION'),
    o('READ', 'INVOICE'),
)
const referee = accessOf(g('READ', 'LIVE_DASHBOARD'))
const boardRole = accessOf(g('READ', 'BOARD'))
const streamRole = accessOf(g('READ', 'STREAM'))
const eventReader = accessOf(g('READ', 'EVENT'))
const eventReaderWithUsers = accessOf(g('READ', 'EVENT'), g('READ', 'USER'))
const invoiceClerk = accessOf(g('CREATE', 'INVOICE'))

describe('EVENT_SECTIONS', () => {
    test('enthält jeden Schlüssel genau einmal, Übersicht zuerst', () => {
        expect(EVENT_SECTIONS.map(s => s.key).sort()).toEqual([...EVENT_SECTION_KEYS].sort())
        expect(EVENT_SECTIONS[0].key).toBe('general')
        expect(EVENT_SECTIONS[0].group).toBeNull()
    })

    test('die bisherigen ?tab=-Schlüssel bleiben gültig, results kommt dazu', () => {
        for (const key of [
            'general',
            'competitions',
            'participants',
            'registrations',
            'organization',
            'schedule',
            'betrieb',
            'settings',
            'invoices',
            'results',
        ]) {
            expect(isEventSectionKey(key)).toBe(true)
        }
        expect(isEventSectionKey('organisation')).toBe(false)
        expect(isEventSectionKey(undefined)).toBe(false)
        expect(isEventSectionKey(3)).toBe(false)
    })

    test('Lebenszyklus-Gruppen nach der Ziel-Informationsarchitektur', () => {
        const groupOf = Object.fromEntries(EVENT_SECTIONS.map(s => [s.key, s.group]))
        expect(groupOf).toEqual({
            general: null,
            competitions: 'preparation',
            settings: 'preparation',
            registrations: 'registration',
            participants: 'registration',
            invoices: 'registration',
            schedule: 'raceDay',
            betrieb: 'raceDay',
            organization: 'raceDay',
            results: 'followUp',
        })
    })

    test('Gruppen stehen zusammenhängend (keine Gruppe taucht zweimal auf)', () => {
        const blocks = groupEventSections(EVENT_SECTIONS)
        expect(blocks.map(b => b.group)).toEqual([
            null,
            'preparation',
            'registration',
            'raceDay',
            'followUp',
        ])
    })

    test('jeder Bereich hat ein Icon', () => {
        for (const s of EVENT_SECTIONS) expect(s.icon).toBeTruthy()
    })

    test.each([
        ['de', deTranslations],
        ['en', enTranslations],
        ['da', daTranslations],
    ])('alle Beschriftungen sind in %s übersetzt', (_, translations) => {
        const lookup = (key: string): unknown =>
            key
                .split('.')
                .reduce<unknown>(
                    (node, part) =>
                        node !== null && typeof node === 'object'
                            ? (node as Record<string, unknown>)[part]
                            : undefined,
                    translations,
                )
        const keys = [
            ...EVENT_SECTIONS.map(s => s.labelKey),
            ...Object.values(EVENT_SECTION_GROUP_LABEL_KEYS),
            'nav.event.sectionSelect',
        ]
        for (const key of keys) {
            const value = lookup(key)
            expect(typeof value, key).toBe('string')
            expect((value as string).length, key).toBeGreaterThan(0)
        }
    })
})

describe('visibleEventSections je Rolle', () => {
    test('Administration sieht alle zehn Bereiche in Seitenleisten-Reihenfolge', () => {
        expect(keysOf(admin)).toEqual([
            'general',
            'competitions',
            'settings',
            'registrations',
            'participants',
            'invoices',
            'schedule',
            'betrieb',
            'organization',
            'results',
        ])
    })

    test('anonym: Übersicht, Wettkämpfe & Tage, Ergebnisse', () => {
        expect(keysOf(anonymous)).toEqual(['general', 'competitions', 'results'])
    })

    test('Vereinsvertretung: Übersicht · Wettkämpfe & Tage · Meldungen · Teilnehmende · Rechnungen · Ergebnisse', () => {
        expect(keysOf(clubRepresentative)).toEqual([
            'general',
            'competitions',
            'registrations',
            'participants',
            'invoices',
            'results',
        ])
    })

    test('Schiedsrichter-Rolle: Betrieb, aber keine Verwaltungsbereiche', () => {
        expect(keysOf(referee)).toEqual(['general', 'competitions', 'betrieb', 'results'])
    })

    test('Board-Rolle und Stream-Rolle finden ihren Betrieb', () => {
        expect(keysOf(boardRole)).toEqual(['general', 'competitions', 'betrieb', 'results'])
        expect(keysOf(streamRole)).toEqual(['general', 'competitions', 'betrieb', 'results'])
    })

    test('Veranstaltung lesen ohne Nutzerrecht: kein „Team & Helfer"', () => {
        const keys = keysOf(eventReader)
        expect(keys).toEqual([
            'general',
            'competitions',
            'settings',
            'registrations',
            'schedule',
            'betrieb',
            'results',
        ])
        expect(keysOf(eventReaderWithUsers)).toContain('organization')
    })

    test('Teilnehmende: Meldungen lesen OWN reicht, GLOBAL ebenso', () => {
        expect(keysOf(accessOf(o('READ', 'REGISTRATION')))).toContain('participants')
        expect(keysOf(accessOf(g('READ', 'REGISTRATION')))).toContain('participants')
        expect(keysOf(accessOf(o('CREATE', 'REGISTRATION')))).not.toContain('participants')
    })

    test('Meldungen: Veranstaltung lesen GLOBAL oder Meldungen lesen (OWN reicht)', () => {
        // Mit OWN liefert GET /event/{id}/eventRegistration nur die Meldung des eigenen Vereins.
        expect(keysOf(accessOf(o('READ', 'REGISTRATION')))).toContain('registrations')
        expect(keysOf(accessOf(g('READ', 'REGISTRATION')))).toContain('registrations')
        expect(keysOf(eventReader)).toContain('registrations')
        expect(keysOf(accessOf(o('CREATE', 'REGISTRATION')))).not.toContain('registrations')
        expect(keysOf(anonymous)).not.toContain('registrations')
    })

    test('Rechnungen: Leserecht in jedem Scope oder Erstellen-Recht', () => {
        expect(keysOf(accessOf(o('READ', 'INVOICE')))).toContain('invoices')
        expect(keysOf(accessOf(g('READ', 'INVOICE')))).toContain('invoices')
        expect(keysOf(invoiceClerk)).toEqual(['general', 'competitions', 'invoices', 'results'])
        expect(keysOf(accessOf(g('UPDATE', 'INVOICE')))).not.toContain('invoices')
    })

    test('nichts wird neu sichtbar, nichts verschwindet — gegen die alten Reiter-Regeln, alle Rechte-Kombinationen', () => {
        const relevant: Privilege[] = [
            g('READ', 'EVENT'),
            g('UPDATE', 'EVENT'),
            g('READ', 'USER'),
            o('READ', 'REGISTRATION'),
            g('READ', 'REGISTRATION'),
            o('READ', 'INVOICE'),
            g('READ', 'INVOICE'),
            g('CREATE', 'INVOICE'),
            g('READ', 'LIVE_DASHBOARD'),
            g('READ', 'BOARD'),
            g('READ', 'STREAM'),
        ]
        for (let mask = 0; mask < 1 << relevant.length; mask++) {
            const access = accessOf(...relevant.filter((_, i) => mask & (1 << i)))
            const now = keysOf(access).filter(k => k !== 'results')
            expect(new Set(now)).toEqual(new Set(legacyTabs(access)))
            // Ergebnisse & Urkunden hat jeder: der Link zur öffentlichen Ergebnisseite stand
            // bisher ungeprüft auf der Übersicht.
            expect(keysOf(access)).toContain('results')
        }
    })

    test('Sprünge aus dem Betrieb zeigen nur auf sichtbare Bereiche', () => {
        const relevant: Privilege[] = [
            g('READ', 'EVENT'),
            g('UPDATE', 'EVENT'),
            g('READ', 'USER'),
            g('READ', 'LIVE_DASHBOARD'),
            g('READ', 'BOARD'),
            g('READ', 'STREAM'),
        ]
        const target = {openSchedule: 'schedule', openShifts: 'organization'} as const
        for (let mask = 0; mask < 1 << relevant.length; mask++) {
            const access = accessOf(...relevant.filter((_, i) => mask & (1 << i)))
            const keys = keysOf(access)
            for (const action of visibleBetriebActions(access.checkPrivilege)) {
                expect(keys).toContain('betrieb')
                expect(BETRIEB_ACTION_TILE[action]).toBeTruthy()
                if (action === 'openSchedule' || action === 'openShifts') {
                    expect(keys).toContain(target[action])
                }
            }
        }
    })
})

describe('Gruppenüberschriften', () => {
    test('erst ab mehr als sechs sichtbaren Bereichen', () => {
        expect(showEventSectionGroupHeadings(visibleEventSections(clubRepresentative))).toBe(false)
        expect(showEventSectionGroupHeadings(visibleEventSections(anonymous))).toBe(false)
        expect(showEventSectionGroupHeadings(visibleEventSections(eventReader))).toBe(true)
        expect(showEventSectionGroupHeadings(visibleEventSections(admin))).toBe(true)
    })

    test('leere Gruppen fallen weg, Überschriften-Schlüssel je Gruppe', () => {
        const blocks = groupEventSections(visibleEventSections(referee))
        expect(blocks.map(b => [b.group, b.labelKey, b.sections.map(s => s.key)])).toEqual([
            [null, null, ['general']],
            ['preparation', 'nav.event.groups.preparation', ['competitions']],
            ['raceDay', 'nav.event.groups.raceDay', ['betrieb']],
            ['followUp', 'nav.event.groups.followUp', ['results']],
        ])
    })
})

describe('resolveEventTab', () => {
    const visibleAdmin = visibleEventSections(admin)
    const visibleClub = visibleEventSections(clubRepresentative)

    test('ohne Wunsch: Übersicht', () => {
        expect(resolveEventTab(undefined, visibleAdmin)).toBe('general')
    })

    test('sichtbarer Wunsch bleibt', () => {
        expect(resolveEventTab('betrieb', visibleAdmin)).toBe('betrieb')
        expect(resolveEventTab('results', visibleClub)).toBe('results')
        expect(resolveEventTab('invoices', visibleClub)).toBe('invoices')
    })

    test('unbekannter Wert fällt auf die Übersicht', () => {
        expect(resolveEventTab('organisation', visibleAdmin)).toBe('general')
        expect(resolveEventTab('', visibleAdmin)).toBe('general')
        expect(resolveEventTab(42, visibleAdmin)).toBe('general')
    })

    test('nicht erlaubter Bereich fällt auf die Übersicht (kein Panel mit 403-Fehlern)', () => {
        expect(resolveEventTab('settings', visibleClub)).toBe('general')
        expect(resolveEventTab('betrieb', visibleEventSections(anonymous))).toBe('general')
        expect(resolveEventTab('organization', visibleEventSections(eventReader))).toBe('general')
    })

    test('leere Sichtbarkeitsliste: trotzdem die Übersicht', () => {
        expect(resolveEventTab('settings', [])).toBe('general')
    })
})

describe('sectionForRoute', () => {
    const id = '5eed0001-0000-0000-0000-000000000001'

    test.each<[string, string | Record<string, unknown> | undefined, EventSectionKey]>([
        [`/event/${id}`, undefined, 'general'],
        [`/event/${id}/`, {}, 'general'],
        [`/event/${id}`, {tab: 'schedule'}, 'schedule'],
        [`/event/${id}`, '?tab=betrieb', 'betrieb'],
        [`/event/${id}`, 'tab=results', 'results'],
        [`/event/${id}`, {tab: 'unsinn'}, 'general'],
        [`/event/${id}/competition/abc`, {tab: 'settings'}, 'competitions'],
        [`/event/${id}/competition/abc/`, undefined, 'competitions'],
        [`/event/${id}/eventDay/def`, undefined, 'competitions'],
        [`/event/${id}/registration/ghi`, undefined, 'registrations'],
        [`/event/${id}/register`, undefined, 'registrations'],
        [`/event/${id}/info`, undefined, 'betrieb'],
        [`/event/${id}/streamScenes`, undefined, 'betrieb'],
        [`/event/${id}/streamPanel`, undefined, 'betrieb'],
        [`/event/${id}/liveDashboard`, undefined, 'betrieb'],
        [`/event/${id}/timing/leitstand`, undefined, 'betrieb'],
        [`/event/${id}/timing/station-1`, '?token=x', 'betrieb'],
        [`/event/${id}/timing/station-1/anzeige`, undefined, 'betrieb'],
        [`/event/${id}/stream/scene-1`, undefined, 'betrieb'],
        [`/event/${id}/unbekannt`, undefined, 'general'],
        [`/event/${id}/constructor`, undefined, 'general'],
    ])('%s %o → %s', (pathname, search, section) => {
        expect(sectionForRoute(pathname, search)).toEqual({eventId: id, section})
    })

    test.each([
        '/',
        '/event',
        '/event/',
        '/dashboard',
        `/results/event/${id}`,
        `/speaker/event/${id}`,
        `/board/${id}/board-1`,
        `/app/timing`,
    ])('außerhalb einer Veranstaltung: %s → null', pathname => {
        expect(sectionForRoute(pathname, {tab: 'betrieb'})).toBeNull()
    })

    test('basepath wird abgezogen', () => {
        expect(sectionForRoute(`/r2r/event/${id}/info`, undefined, '/r2r')).toEqual({
            eventId: id,
            section: 'betrieb',
        })
        expect(sectionForRoute(`/r2r/event/${id}`, {tab: 'settings'}, 'r2r/')).toEqual({
            eventId: id,
            section: 'settings',
        })
        // ohne passenden basepath keine Veranstaltung
        expect(sectionForRoute(`/event/${id}`, undefined, '/r2r')).toBeNull()
        expect(sectionForRoute(`/r2rx/event/${id}`, undefined, '/r2r')).toBeNull()
        // basepath '/' (Standard des Routers) ändert nichts
        expect(sectionForRoute(`/event/${id}/info`, undefined, '/')?.section).toBe('betrieb')
    })

    test('der Tab einer Unterseite gilt nicht als Bereich (Wettkampfseite hat eigene Reiter)', () => {
        expect(sectionForRoute(`/event/${id}/competition/abc`, '?tab=invoices')?.section).toBe(
            'competitions',
        )
    })

    test('Zusammenspiel: Verein auf der Meldestrecke landet in seinem Bereich „Meldungen"', () => {
        // Bis 13.11.2026 sah der Verein den Bereich nicht und die Seitenleiste markierte die
        // Übersicht; seit die Liste OWN liefert, ist „Meldungen" auch seiner.
        const route = sectionForRoute(`/event/${id}/register`)
        expect(route?.section).toBe('registrations')
        expect(resolveEventTab(route?.section, visibleEventSections(clubRepresentative))).toBe(
            'registrations',
        )
        expect(resolveEventTab(route?.section, visibleEventSections(anonymous))).toBe('general')
        expect(resolveEventTab(route?.section, visibleEventSections(admin))).toBe('registrations')
    })
})

describe('validateEventSearch', () => {
    test('behält bekannte Schlüssel, verwirft alles andere', () => {
        expect(validateEventSearch({tab: 'betrieb'})).toEqual({tab: 'betrieb'})
        expect(validateEventSearch({tab: 'results'})).toEqual({tab: 'results'})
        expect(validateEventSearch({tab: 'xyz'})).toEqual({tab: undefined})
        expect(validateEventSearch({})).toEqual({tab: undefined})
        expect(validateEventSearch({tab: ['betrieb']})).toEqual({tab: undefined})
    })
})
