import {describe, expect, it} from 'vitest'
import {Action, Privilege, Resource, Scope} from '@api/types.gen.ts'
import {EventSectionAccess} from '../../pages/event/eventSections.ts'
import {eventSidebarModel} from './eventSidebar.ts'

const accessOf = (...granted: Privilege[]): EventSectionAccess => ({
    checkPrivilege: privilege =>
        granted.some(
            p =>
                p.action === privilege.action &&
                p.resource === privilege.resource &&
                (p.scope === 'GLOBAL' || privilege.scope === 'OWN'),
        ),
    getPrivilegeScope: (action: Action, resource: Resource): Scope | undefined => {
        const scopes = granted
            .filter(p => p.action === action && p.resource === resource)
            .map(p => p.scope)
        return scopes.includes('GLOBAL') ? 'GLOBAL' : scopes[0]
    },
})

const g = (action: Action, resource: Resource): Privilege => ({action, resource, scope: 'GLOBAL'})

const admin = accessOf(
    g('READ', 'EVENT'),
    g('UPDATE', 'EVENT'),
    g('READ', 'USER'),
    g('READ', 'REGISTRATION'),
    g('READ', 'INVOICE'),
)
const anonymous = accessOf()

const EVENT = '5eed0001-0000-0000-0000-000000000001'

describe('eventSidebarModel', () => {
    it('ist außerhalb einer Veranstaltung leer', () => {
        expect(eventSidebarModel('/event', {}, '/', admin)).toBeNull()
        expect(eventSidebarModel('/dashboard', {}, '/', admin)).toBeNull()
        expect(eventSidebarModel(`/results/event/${EVENT}`, {}, '/', admin)).toBeNull()
    })

    it('hebt den Bereich aus ?tab= hervor', () => {
        const model = eventSidebarModel(`/event/${EVENT}`, {tab: 'schedule'}, '/', admin)
        expect(model?.eventId).toBe(EVENT)
        expect(model?.activeSection).toBe('schedule')
    })

    it('liest auch den rohen Query-String', () => {
        expect(
            eventSidebarModel(`/event/${EVENT}`, '?tab=betrieb&day=all', '/', admin)?.activeSection,
        ).toBe('betrieb')
    })

    it('hebt auf Unterseiten den Elternbereich hervor', () => {
        const at = (sub: string) =>
            eventSidebarModel(`/event/${EVENT}/${sub}`, {}, '/', admin)?.activeSection
        expect(at('competition/abc')).toBe('competitions')
        expect(at('eventDay/abc')).toBe('competitions')
        expect(at('info')).toBe('betrieb')
        expect(at('streamScenes')).toBe('betrieb')
        expect(at('registration/abc')).toBe('registrations')
    })

    it('fällt bei unbekanntem oder nicht erlaubtem Bereich auf die Übersicht', () => {
        expect(eventSidebarModel(`/event/${EVENT}`, {tab: 'xyz'}, '/', admin)?.activeSection).toBe(
            'general',
        )
        expect(
            eventSidebarModel(`/event/${EVENT}`, {tab: 'settings'}, '/', anonymous)?.activeSection,
        ).toBe('general')
    })

    it('zeigt Gruppenüberschriften erst bei vielen Bereichen', () => {
        const full = eventSidebarModel(`/event/${EVENT}`, {}, '/', admin)
        expect(full?.showGroupHeadings).toBe(true)
        expect(full?.blocks.map(b => b.group)).toEqual([
            null,
            'preparation',
            'registration',
            'raceDay',
            'followUp',
        ])

        const minimal = eventSidebarModel(`/event/${EVENT}`, {}, '/', anonymous)
        expect(minimal?.showGroupHeadings).toBe(false)
        expect(minimal?.blocks.flatMap(b => b.sections.map(s => s.key))).toEqual([
            'general',
            'competitions',
            'results',
        ])
    })

    it('berücksichtigt den basepath', () => {
        expect(
            eventSidebarModel(`/r2r/event/${EVENT}`, {tab: 'schedule'}, '/r2r', admin)
                ?.activeSection,
        ).toBe('schedule')
        expect(eventSidebarModel(`/event/${EVENT}`, {}, '/r2r', admin)).toBeNull()
    })
})
