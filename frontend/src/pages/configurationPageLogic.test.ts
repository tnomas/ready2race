import {describe, expect, test} from 'vitest'
import {Privilege} from '@api/types.gen.ts'
import {
    CONFIGURATION_TABS,
    resolveConfigurationTab,
    tabForConfigurationAnchor,
    validateConfigurationSearch,
    visibleConfigurationTabs,
} from './configurationPageLogic.ts'

const webDav = (privilege: Privilege) =>
    privilege.action === 'READ' && privilege.resource === 'WEB_DAV'
const nothing = () => false

describe('visibleConfigurationTabs', () => {
    test('mit WebDAV-Recht alle Reiter in Reihenfolge', () => {
        expect(visibleConfigurationTabs(webDav)).toEqual([
            'competition-templates',
            'competition-elements',
            'lists-timing',
            'event-elements',
            'organisation',
            'global-settings',
            'export-data',
        ])
    })

    test('ohne WebDAV-Recht kein Export / Import', () => {
        expect(visibleConfigurationTabs(nothing)).not.toContain('export-data')
        expect(visibleConfigurationTabs(nothing)).toHaveLength(6)
    })
})

describe('validateConfigurationSearch', () => {
    test('alte und neue Reiterschlüssel bleiben gültig, Unbekanntes fällt weg', () => {
        for (const tab of CONFIGURATION_TABS) {
            expect(validateConfigurationSearch({tab})).toEqual({tab})
        }
        expect(validateConfigurationSearch({tab: 'xyz'})).toEqual({tab: undefined})
        expect(validateConfigurationSearch({tab: ['a']})).toEqual({tab: undefined})
        expect(validateConfigurationSearch({})).toEqual({tab: undefined})
    })
})

describe('tabForConfigurationAnchor', () => {
    test('bekannte Anker mit und ohne #', () => {
        expect(tabForConfigurationAnchor('worktypes')).toBe('organisation')
        expect(tabForConfigurationAnchor('#startlists')).toBe('lists-timing')
    })

    test('unbekannte oder leere Anker', () => {
        expect(tabForConfigurationAnchor('toString')).toBeUndefined()
        expect(tabForConfigurationAnchor('')).toBeUndefined()
        expect(tabForConfigurationAnchor(undefined)).toBeUndefined()
    })
})

describe('resolveConfigurationTab', () => {
    const all = visibleConfigurationTabs(webDav)
    const noExport = visibleConfigurationTabs(nothing)

    test('ohne Angabe: erster Reiter', () => {
        expect(resolveConfigurationTab(undefined, undefined, all)).toBe('competition-templates')
    })

    test('sichtbarer Reiter bleibt', () => {
        expect(resolveConfigurationTab('organisation', '', all)).toBe('organisation')
        expect(resolveConfigurationTab('event-elements', '', all)).toBe('event-elements')
    })

    test('unbekannter oder unsichtbarer Reiter fällt auf den ersten', () => {
        expect(resolveConfigurationTab('xyz', '', all)).toBe('competition-templates')
        expect(resolveConfigurationTab('export-data', '', noExport)).toBe('competition-templates')
    })

    test('Anker gewinnt: alte Links landen beim umgezogenen Block', () => {
        // Shiftplan: /config?tab=event-elements#worktypes
        expect(resolveConfigurationTab('event-elements', 'worktypes', all)).toBe('organisation')
        // EventTimingConfig: /config?tab=competition-elements#startlists
        expect(resolveConfigurationTab('competition-elements', '#startlists', all)).toBe(
            'lists-timing',
        )
        // Unbekannter Anker ändert nichts.
        expect(resolveConfigurationTab('event-elements', 'foo', all)).toBe('event-elements')
    })
})
