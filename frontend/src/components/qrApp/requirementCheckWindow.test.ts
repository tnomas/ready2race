import {describe, expect, test} from 'vitest'
import {
    matchScopeLabel,
    preselectedMatch,
    requirementWindow,
} from '@components/qrApp/requirementCheckWindow.ts'
import {ParticipantMatchScopeDto} from '@api/types.gen.ts'

/**
 * Das Beispiel des Auftraggebers: Wer um 14 Uhr startet, wiegt zwischen 12 und 13 Uhr - also
 * frühestens 120 und spätestens 60 Minuten vor dem Start.
 */
const waage = {checkEarliestMinutesBefore: 120, checkLatestMinutesBefore: 60}

const start = new Date('2026-08-15T14:00:00')
const lauf = {startTime: '2026-08-15T14:00:00'}

const minuten = (d: Date, m: number) => new Date(d.getTime() + m * 60_000)

describe('requirementWindow', () => {
    test('vor dem Öffnen ist es zu früh', () => {
        expect(requirementWindow(waage, lauf, minuten(start, -121)).status).toBe('TOO_EARLY')
    })

    test('zwischen den Grenzen ist es im Fenster, die Grenzen selbst zählen dazu', () => {
        expect(requirementWindow(waage, lauf, minuten(start, -120)).status).toBe('IN_WINDOW')
        expect(requirementWindow(waage, lauf, minuten(start, -90)).status).toBe('IN_WINDOW')
        expect(requirementWindow(waage, lauf, minuten(start, -60)).status).toBe('IN_WINDOW')
    })

    test('nach dem Schließen ist es zu spät - auch nach dem Start', () => {
        expect(requirementWindow(waage, lauf, minuten(start, -59)).status).toBe('TOO_LATE')
        expect(requirementWindow(waage, lauf, minuten(start, 5)).status).toBe('TOO_LATE')
    })

    test('die Grenzen kommen als Zeitpunkte mit - sie stehen am Steg auf dem Schirm', () => {
        const fenster = requirementWindow(waage, lauf, start)
        expect(fenster.from).toEqual(new Date('2026-08-15T12:00:00'))
        expect(fenster.until).toEqual(new Date('2026-08-15T13:00:00'))
    })

    test('ohne gepflegte Grenzen gibt es kein Fenster', () => {
        expect(
            requirementWindow(
                {checkEarliestMinutesBefore: null, checkLatestMinutesBefore: null},
                lauf,
                start,
            ).status,
        ).toBe('NO_WINDOW')
    })

    test('ohne Lauf oder ohne Startzeit gibt es ebenfalls keins', () => {
        expect(requirementWindow(waage, null, start).status).toBe('NO_WINDOW')
        expect(requirementWindow(waage, {startTime: undefined}, start).status).toBe('NO_WINDOW')
    })

    test('ein halbes Fenster urteilt nur über die Seite, die es hat', () => {
        const nurSpaet = {checkEarliestMinutesBefore: null, checkLatestMinutesBefore: 60}
        expect(requirementWindow(nurSpaet, lauf, minuten(start, -600)).status).toBe('IN_WINDOW')
        expect(requirementWindow(nurSpaet, lauf, minuten(start, -30)).status).toBe('TOO_LATE')

        const nurFrueh = {checkEarliestMinutesBefore: 120, checkLatestMinutesBefore: null}
        expect(requirementWindow(nurFrueh, lauf, minuten(start, -200)).status).toBe('TOO_EARLY')
        expect(requirementWindow(nurFrueh, lauf, minuten(start, 600)).status).toBe('IN_WINDOW')
    })

    /**
     * Der Grund, warum der Bezugspunkt der gewählte Lauf ist und nicht der nächste Start der
     * Person: Wer um 14 und um 16 Uhr startet, muss für das 16-Uhr-Rennen zwischen 14 und 15 Uhr
     * wiegen - zu einer Zeit, zu der das Fenster des 14-Uhr-Rennens längst zu ist.
     */
    test('zwei Rennen an einem Tag haben zwei verschiedene Fenster', () => {
        const um14 = {startTime: '2026-08-15T14:00:00'}
        const um16 = {startTime: '2026-08-15T16:00:00'}
        const umHalbDrei = new Date('2026-08-15T14:30:00')

        expect(requirementWindow(waage, um14, umHalbDrei).status).toBe('TOO_LATE')
        expect(requirementWindow(waage, um16, umHalbDrei).status).toBe('IN_WINDOW')
    })
})

describe('preselectedMatch', () => {
    const m = (id: string, startTime?: string): ParticipantMatchScopeDto => ({
        competitionId: id,
        competitionName: id,
        startTime,
    })

    const jetzt = new Date('2026-08-15T13:00:00')

    test('der nächste noch bevorstehende Lauf wird vorbelegt', () => {
        const gewaehlt = preselectedMatch(
            [m('spaet', '2026-08-15T16:00:00'), m('naechster', '2026-08-15T14:00:00')],
            jetzt,
        )
        expect(gewaehlt?.competitionId).toBe('naechster')
    })

    test('vergangene Läufe werden übergangen, solange es künftige gibt', () => {
        const gewaehlt = preselectedMatch(
            [m('vorbei', '2026-08-15T09:00:00'), m('kommt', '2026-08-15T14:00:00')],
            jetzt,
        )
        expect(gewaehlt?.competitionId).toBe('kommt')
    })

    test('ist alles vorbei, gewinnt der zuletzt gefahrene - er ist gemeint', () => {
        const gewaehlt = preselectedMatch(
            [m('frueh', '2026-08-15T08:00:00'), m('zuletzt', '2026-08-15T11:00:00')],
            jetzt,
        )
        expect(gewaehlt?.competitionId).toBe('zuletzt')
    })

    test('Läufe ohne Startzeit stehen hinten an, taugen aber als letzte Rettung', () => {
        expect(preselectedMatch([m('offen'), m('kommt', '2026-08-15T14:00:00')], jetzt)?.competitionId).toBe(
            'kommt',
        )
        expect(preselectedMatch([m('offen')], jetzt)?.competitionId).toBe('offen')
    })

    test('ohne Läufe gibt es nichts vorzubelegen', () => {
        expect(preselectedMatch([], jetzt)).toBeNull()
    })
})

describe('matchScopeLabel', () => {
    test('die Rennnummer steht vorn - sie steht am Steg auf dem Zettel', () => {
        expect(
            matchScopeLabel({
                competitionId: 'x',
                competitionName: 'Junioren Mixed Vierer',
                competitionIdentifier: '12',
                competitionShortName: 'JM4x',
            }),
        ).toBe('12 JM4x')
    })

    test('ohne Kürzel steht der volle Name da', () => {
        expect(
            matchScopeLabel({
                competitionId: 'x',
                competitionName: 'Junioren Mixed Vierer',
                competitionIdentifier: '12',
            }),
        ).toBe('12 Junioren Mixed Vierer')
    })

    test('ohne Rennnummer bleibt der Name allein stehen', () => {
        expect(matchScopeLabel({competitionId: 'x', competitionName: 'Freundschaftsrennen'})).toBe(
            'Freundschaftsrennen',
        )
    })
})
