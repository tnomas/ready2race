import {describe, expect, it} from 'vitest'
import {TimingMatchDto} from '@api/types.gen.ts'
import {groupMatchesByDay} from './matchBoard.ts'

/**
 * Startzeiten bewusst ohne Zonenangabe (`2026-08-15T09:00`) — so liest der Browser sie als
 * Ortszeit, und der Test hängt nicht an der Zeitzone der Maschine, auf der er läuft.
 */
const match = (id: string, startTime: string | null): TimingMatchDto => ({
    competitionSetupMatch: id,
    competition: '00000000-0000-0000-0000-0000000000c1',
    round: '00000000-0000-0000-0000-0000000000d1',
    phase: 'OPEN',
    progress: 'OPEN',
    teams: [],
    startTime,
})

describe('groupMatchesByDay', () => {
    it('fasst einen einzigen Veranstaltungstag zu genau einer Gruppe zusammen', () => {
        const groups = groupMatchesByDay([
            match('m1', '2026-08-15T09:00'),
            match('m2', '2026-08-15T12:30'),
            match('m3', '2026-08-15T18:48'),
        ])

        expect(groups).toHaveLength(1)
        expect(groups[0].dayKey).toBe('2026-08-15')
        expect(groups[0].date?.getDate()).toBe(15)
        expect(groups[0].matches.map(m => m.competitionSetupMatch)).toEqual(['m1', 'm2', 'm3'])
    })

    it('schneidet am Tageswechsel und behält die gelieferte Reihenfolge', () => {
        // Genau der Fall, um den es geht: auf 18:48 folgt 09:00 des Folgetages.
        const groups = groupMatchesByDay([
            match('sa1', '2026-08-15T17:00'),
            match('sa2', '2026-08-15T18:48'),
            match('so1', '2026-08-16T09:00'),
        ])

        expect(groups.map(g => g.dayKey)).toEqual(['2026-08-15', '2026-08-16'])
        expect(groups[0].matches.map(m => m.competitionSetupMatch)).toEqual(['sa1', 'sa2'])
        expect(groups[1].matches.map(m => m.competitionSetupMatch)).toEqual(['so1'])
    })

    it('sammelt Partien ohne Startzeit in einer eigenen Gruppe ganz am Ende', () => {
        const groups = groupMatchesByDay([
            match('ohne1', null),
            match('sa1', '2026-08-15T09:00'),
            match('kaputt', 'kein Datum'),
            match('so1', '2026-08-16T09:00'),
        ])

        expect(groups.map(g => g.dayKey)).toEqual(['2026-08-15', '2026-08-16', 'none'])
        const withoutTime = groups[groups.length - 1]
        expect(withoutTime.date).toBeNull()
        // Auch ein unlesbares Datum gehört hierher — sonst stünde „Invalid Date" in der Spalte.
        expect(withoutTime.matches.map(m => m.competitionSetupMatch)).toEqual(['ohne1', 'kaputt'])
    })

    it('liefert für eine leere Liste keine Gruppen', () => {
        expect(groupMatchesByDay([])).toEqual([])
    })
})
