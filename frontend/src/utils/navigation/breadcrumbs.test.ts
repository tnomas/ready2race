import {describe, expect, it} from 'vitest'
import {
    buildClubTrail,
    buildEventTrail,
    buildUserTrail,
    crumbLabel,
    finalizeTrail,
    PENDING_LABEL,
} from './breadcrumbs.ts'

const eventId = 'e1'

describe('crumbLabel', () => {
    it('zeigt den Namen getrimmt', () => {
        expect(crumbLabel('  DM Coastal  ')).toBe('DM Coastal')
    })

    it('setzt für fehlende oder leere Namen den Platzhalter', () => {
        expect(crumbLabel(undefined)).toBe(PENDING_LABEL)
        expect(crumbLabel(null)).toBe(PENDING_LABEL)
        expect(crumbLabel('   ')).toBe(PENDING_LABEL)
    })
})

describe('buildEventTrail', () => {
    it('baut Veranstaltungen › Veranstaltung › Bereich › Wettkampf', () => {
        const trail = buildEventTrail({
            eventsLabel: 'Veranstaltungen',
            eventId,
            eventName: 'DM Coastal Rowing 2026',
            section: {tab: 'competitions', label: 'Wettkämpfe & Tage'},
            trail: [{label: '12 JM4x'}],
        })
        expect(trail.map(c => c.label)).toEqual([
            'Veranstaltungen',
            'DM Coastal Rowing 2026',
            'Wettkämpfe & Tage',
            '12 JM4x',
        ])
        expect(trail[0].link).toEqual({to: '/event'})
        expect(trail[1].link).toEqual({to: '/event/$eventId', params: {eventId}})
        // Bereichsglied springt mit ?tab= in denselben Bereich wie die Seitenleiste
        expect(trail[2].link).toEqual({
            to: '/event/$eventId',
            params: {eventId},
            search: {tab: 'competitions'},
        })
        expect(trail[3].link).toBeUndefined()
    })

    it('kommt ohne Bereich und Unterglieder aus', () => {
        const trail = buildEventTrail({eventsLabel: 'Veranstaltungen', eventId, eventName: 'X'})
        expect(trail.map(c => c.label)).toEqual(['Veranstaltungen', 'X'])
    })

    it('zeigt den Platzhalter, solange der Veranstaltungsname lädt', () => {
        const trail = buildEventTrail({
            eventsLabel: 'Veranstaltungen',
            eventId,
            eventName: undefined,
        })
        expect(trail[1].label).toBe(PENDING_LABEL)
    })
})

describe('buildClubTrail / buildUserTrail', () => {
    it('verlinkt Liste und Detailseite', () => {
        const clubs = buildClubTrail({clubsLabel: 'Vereine', clubId: 'c1', clubName: 'Kieler RV'})
        expect(clubs).toEqual([
            {label: 'Vereine', link: {to: '/club'}},
            {label: 'Kieler RV', link: {to: '/club/$clubId', params: {clubId: 'c1'}}},
        ])
        const users = buildUserTrail({usersLabel: 'Benutzer:innen', userId: 'u1', userName: 'Ilka'})
        expect(users[1].link).toEqual({to: '/user/$userId', params: {userId: 'u1'}})
    })
})

describe('finalizeTrail', () => {
    it('markiert das letzte Glied als aktuelle Seite ohne Link', () => {
        const rendered = finalizeTrail(
            buildClubTrail({clubsLabel: 'Vereine', clubId: 'c1', clubName: 'Kieler RV'}),
        )
        expect(rendered[0]).toEqual({label: 'Vereine', link: {to: '/club'}, current: false})
        expect(rendered[1]).toEqual({label: 'Kieler RV', current: true})
    })

    it('lässt leere Glieder weg', () => {
        const rendered = finalizeTrail([
            {label: 'A', link: {to: '/event'}},
            {label: '  '},
            {label: 'B'},
        ])
        expect(rendered.map(c => c.label)).toEqual(['A', 'B'])
    })

    it('legt direkt aufeinanderfolgende Doppel zusammen und behält das genauere Glied', () => {
        const rendered = finalizeTrail([
            {label: 'Betrieb', link: {to: '/event'}},
            {
                label: 'Betrieb',
                link: {to: '/event/$eventId', params: {eventId}, search: {tab: 'betrieb'}},
            },
            {label: 'Regie'},
        ])
        expect(rendered).toHaveLength(2)
        expect(rendered[0].link?.search).toEqual({tab: 'betrieb'})
    })

    it('legt zwei noch ladende Namen nicht zusammen', () => {
        const rendered = finalizeTrail([{label: PENDING_LABEL}, {label: PENDING_LABEL}])
        expect(rendered).toHaveLength(2)
    })

    it('liefert für einen leeren Pfad nichts', () => {
        expect(finalizeTrail([])).toEqual([])
    })
})
