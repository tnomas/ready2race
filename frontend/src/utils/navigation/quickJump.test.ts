import {describe, expect, it} from 'vitest'
import {
    buildQuickJumpOptions,
    isEditableTarget,
    isQuickJumpShortcut,
    normalizeQuickJumpText,
    quickJumpContext,
    quickJumpGroup,
    quickJumpMatchRank,
    quickJumpTarget,
    QuickJumpKeyInput,
    rankQuickJumpCompetitions,
    rankQuickJumpEvents,
    rankQuickJumpSections,
    shouldSearchQuickJumpEvents,
} from './quickJump.ts'
import {EVENT_SECTIONS} from '../../pages/event/eventSections.ts'

const key = (overrides: Partial<QuickJumpKeyInput> = {}): QuickJumpKeyInput => ({
    key: '/',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    ...overrides,
})

const element = (tagName: string, role: string | null = null, isContentEditable = false) => ({
    tagName,
    isContentEditable,
    getAttribute: (name: string) => (name === 'role' ? role : null),
})

const competition = (id: string, identifier: string, name: string, shortName?: string) => ({
    id,
    properties: {identifier, name, shortName},
})

describe('normalizeQuickJumpText', () => {
    it('ignoriert Groß-/Kleinschreibung, Akzente und doppelten Leerraum', () => {
        expect(normalizeQuickJumpText('  Über   Wasser ')).toBe('uber wasser')
        expect(normalizeQuickJumpText('Ærø')).toBe('ærø')
    })
})

describe('quickJumpMatchRank', () => {
    it('reiht genau vor Anfang vor Wortanfang vor enthalten', () => {
        expect(quickJumpMatchRank('jm4x', ['JM4x'])).toBe(0)
        expect(quickJumpMatchRank('jm', ['JM4x'])).toBe(1)
        expect(quickJumpMatchRank('vier', ['Junioren Vierer'])).toBe(2)
        expect(quickJumpMatchRank('m4', ['JM4x'])).toBe(3)
    })

    it('findet mehrere Suchwörter über Felder hinweg', () => {
        expect(quickJumpMatchRank('12 vierer', ['12', 'Junioren Vierer'])).toBe(4)
    })

    it('liefert null ohne Treffer und 0 für leeren Suchbegriff', () => {
        expect(quickJumpMatchRank('xyz', ['JM4x'])).toBeNull()
        expect(quickJumpMatchRank('  ', ['JM4x'])).toBe(0)
        expect(quickJumpMatchRank('a', [undefined, null, ''])).toBeNull()
    })
})

describe('rankQuickJumpSections', () => {
    const sections = [
        {key: 'general' as const, label: 'Übersicht'},
        {key: 'competitions' as const, label: 'Wettkämpfe & Tage'},
        {key: 'schedule' as const, label: 'Zeitplan'},
        {key: 'betrieb' as const, label: 'Betrieb'},
    ]

    it('zeigt ohne Suchbegriff alle Bereiche in Seitenleisten-Reihenfolge', () => {
        expect(rankQuickJumpSections('', 'e1', sections).map(s => s.section)).toEqual([
            'general',
            'competitions',
            'schedule',
            'betrieb',
        ])
    })

    it('kappt Bereiche nicht (bis zu zehn sichtbar)', () => {
        const all = EVENT_SECTIONS.map(s => ({key: s.key, label: s.key}))
        expect(rankQuickJumpSections('', 'e1', all)).toHaveLength(EVENT_SECTIONS.length)
    })

    it('filtert und reiht nach Treffergüte', () => {
        const result = rankQuickJumpSections('zeit', 'e1', sections)
        expect(result).toEqual([
            {
                kind: 'section',
                id: 'section:schedule',
                eventId: 'e1',
                section: 'schedule',
                label: 'Zeitplan',
            },
        ])
        expect(rankQuickJumpSections('uber', 'e1', sections)[0].section).toBe('general')
    })
})

describe('rankQuickJumpCompetitions', () => {
    const list = [
        competition('c10', '10', 'Junioren Vierer', 'JM4x'),
        competition('c2', '2', 'Männer Einer', 'M1x'),
        competition('c1', '1', 'Frauen Einer', 'W1x'),
        competition('c12', '12', 'Mixed Vierer'),
    ]

    it('liefert ohne Suchbegriff nichts (keine hundert Einträge)', () => {
        expect(rankQuickJumpCompetitions('', 'e1', list)).toEqual([])
    })

    it('findet über Kennung, Kurzname und Name; Kennung genau steht vorn', () => {
        expect(rankQuickJumpCompetitions('1', 'e1', list).map(c => c.competitionId)).toEqual([
            'c1', // genau
            'c10', // beginnt mit 1
            'c12',
            'c2', // „M1x" enthält 1
        ])
        expect(rankQuickJumpCompetitions('jm4', 'e1', list).map(c => c.competitionId)).toEqual([
            'c10',
        ])
        expect(rankQuickJumpCompetitions('einer', 'e1', list).map(c => c.competitionId)).toEqual([
            'c1',
            'c2',
        ])
    })

    it('baut eine lesbare Beschriftung ohne leere Teile', () => {
        const [mixed] = rankQuickJumpCompetitions('mixed', 'e1', list)
        expect(mixed.label).toBe('12 · Mixed Vierer')
        expect(mixed.eventId).toBe('e1')
    })
})

describe('rankQuickJumpEvents', () => {
    const events = [
        {id: 'a', name: 'Herbstregatta', firstEventDay: '2026-10-01'},
        {id: 'b', name: 'Regatta Kiel'},
        {id: 'c', name: 'Sommerfest'}, // vom Server über die Beschreibung gefunden
    ]

    it('sucht erst ab zwei Zeichen', () => {
        expect(shouldSearchQuickJumpEvents('r')).toBe(false)
        expect(shouldSearchQuickJumpEvents(' re ')).toBe(true)
        expect(rankQuickJumpEvents('r', events)).toEqual([])
    })

    it('reiht Namenstreffer vor reine Servertreffer', () => {
        expect(rankQuickJumpEvents('regatta', events).map(e => e.eventId)).toEqual(['b', 'a', 'c'])
    })
})

describe('buildQuickJumpOptions / quickJumpGroup', () => {
    it('ordnet Bereiche, Wettkämpfe, Veranstaltungen', () => {
        const options = buildQuickJumpOptions({
            events: rankQuickJumpEvents('regatta', [{id: 'x', name: 'Regatta'}]),
            sections: rankQuickJumpSections('', 'e1', [{key: 'general', label: 'Übersicht'}]),
            competitions: rankQuickJumpCompetitions('1', 'e1', [competition('c1', '1', 'Einer')]),
        })
        expect(options.map(quickJumpGroup)).toEqual(['sections', 'competitions', 'events'])
    })
})

describe('quickJumpContext', () => {
    it('kennt außerhalb einer Veranstaltung keinen Kontext', () => {
        expect(quickJumpContext('/dashboard', {})).toBeNull()
        expect(quickJumpContext('/event', {})).toBeNull()
    })

    it('liest die Veranstaltung auf der Seite und allen Unterseiten', () => {
        expect(quickJumpContext('/event/e1', {tab: 'schedule'})).toEqual({eventId: 'e1'})
        expect(quickJumpContext('/event/e1/info', {})).toEqual({eventId: 'e1'})
    })

    it('liest auf der Wettkampfseite den Reiter (Standard: Allgemein)', () => {
        expect(quickJumpContext('/event/e1/competition/c1', {tab: 'execution'})).toEqual({
            eventId: 'e1',
            competitionTab: 'execution',
        })
        expect(quickJumpContext('/event/e1/competition/c1/', {tab: 'quatsch'})).toEqual({
            eventId: 'e1',
            competitionTab: 'general',
        })
    })

    it('beachtet den basepath', () => {
        expect(quickJumpContext('/r2r/event/e1/competition/c1', {}, '/r2r')).toEqual({
            eventId: 'e1',
            competitionTab: 'general',
        })
    })
})

describe('quickJumpTarget', () => {
    const [section] = rankQuickJumpSections('', 'e1', [{key: 'schedule', label: 'Zeitplan'}])
    const [overview] = rankQuickJumpSections('', 'e1', [{key: 'general', label: 'Übersicht'}])
    const [comp] = rankQuickJumpCompetitions('1', 'e1', [competition('c1', '1', 'Einer')])
    const [event] = rankQuickJumpEvents('regatta', [{id: 'e2', name: 'Regatta'}])

    it('springt in Bereiche per ?tab=, die Übersicht ohne', () => {
        expect(quickJumpTarget(section, null)).toEqual({
            to: '/event/$eventId',
            params: {eventId: 'e1'},
            search: {tab: 'schedule'},
        })
        expect(quickJumpTarget(overview, null).search).toEqual({tab: undefined})
    })

    it('behält auf einer Wettkampfseite den Reiter', () => {
        expect(quickJumpTarget(comp, {eventId: 'e1', competitionTab: 'execution'})).toEqual({
            to: '/event/$eventId/competition/$competitionId',
            params: {eventId: 'e1', competitionId: 'c1'},
            search: {tab: 'execution'},
        })
        expect(quickJumpTarget(comp, {eventId: 'e1', competitionTab: 'general'}).search).toEqual({
            tab: undefined,
        })
        expect(quickJumpTarget(comp, {eventId: 'e1'}).search).toEqual({})
    })

    it('springt zur Übersicht einer Veranstaltung', () => {
        expect(quickJumpTarget(event, {eventId: 'e1'})).toEqual({
            to: '/event/$eventId',
            params: {eventId: 'e2'},
            search: {},
        })
    })
})

describe('isQuickJumpShortcut', () => {
    it('greift für „/" außerhalb von Eingabefeldern', () => {
        expect(isQuickJumpShortcut(key(), element('BODY'), false)).toBe(true)
        expect(isQuickJumpShortcut(key(), element('BUTTON'), false)).toBe(true)
        expect(isQuickJumpShortcut(key(), null, false)).toBe(true)
    })

    it('greift nicht in Feldern, mit Zusatztasten, bei Komposition oder offenem Dialog', () => {
        expect(isQuickJumpShortcut(key(), element('INPUT'), false)).toBe(false)
        expect(isQuickJumpShortcut(key(), element('textarea'), false)).toBe(false)
        expect(isQuickJumpShortcut(key(), element('DIV', null, true), false)).toBe(false)
        expect(isQuickJumpShortcut(key(), element('DIV', 'combobox'), false)).toBe(false)
        expect(isQuickJumpShortcut(key({ctrlKey: true}), element('BODY'), false)).toBe(false)
        expect(isQuickJumpShortcut(key({metaKey: true}), element('BODY'), false)).toBe(false)
        expect(isQuickJumpShortcut(key({altKey: true}), element('BODY'), false)).toBe(false)
        expect(isQuickJumpShortcut(key({isComposing: true}), element('BODY'), false)).toBe(false)
        expect(isQuickJumpShortcut(key({defaultPrevented: true}), element('BODY'), false)).toBe(
            false,
        )
        expect(isQuickJumpShortcut(key(), element('BODY'), true)).toBe(false)
        expect(isQuickJumpShortcut(key({key: 'k'}), element('BODY'), false)).toBe(false)
    })

    it('erkennt bearbeitbare Elemente', () => {
        expect(isEditableTarget(element('SELECT'))).toBe(true)
        expect(isEditableTarget(element('DIV', 'searchbox'))).toBe(true)
        expect(isEditableTarget(element('A'))).toBe(false)
        expect(isEditableTarget(null)).toBe(false)
    })
})
