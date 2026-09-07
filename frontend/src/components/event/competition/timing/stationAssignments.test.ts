import {describe, expect, it} from 'vitest'
import {splitStationAssignments} from './stationAssignments.ts'

describe('splitStationAssignments', () => {
    it('zählt nur Posten, die als Zeile sichtbar sind', () => {
        const split = splitStationAssignments(
            {'station-start': '0', 'station-ziel': '2000'},
            ['station-start', 'station-ziel'],
        )
        expect(split.visible).toEqual([
            ['station-start', '0'],
            ['station-ziel', '2000'],
        ])
        expect(split.orphaned).toEqual([])
    })

    it('legt Zuordnungen zu unsichtbaren Posten als verwaist beiseite', () => {
        // Der Posten wurde gelöscht oder zum Anzeige-Posten gemacht; seine Zuordnung stand bislang
        // unsichtbar in der Liste und ging bei jedem Speichern wieder mit auf den Server.
        const split = splitStationAssignments(
            {'station-start': '0', 'station-weg': '1000', 'station-ziel': '2000'},
            ['station-start', 'station-ziel'],
        )
        expect(split.visible.map(([id]) => id)).toEqual(['station-start', 'station-ziel'])
        expect(split.orphaned).toEqual([['station-weg', '1000']])
    })

    it('hält verwaiste Einträge aus den Meter-Warnungen heraus', () => {
        // Die verwaiste 2000 darf nicht als Doppelung zum sichtbaren Ziel bei 2000 gelten.
        const split = splitStationAssignments(
            {'station-weg': '2000', 'station-ziel': '2000'},
            ['station-ziel'],
        )
        expect(split.visible).toEqual([['station-ziel', '2000']])
    })

    it('kommt mit einer leeren Zuordnung zurecht', () => {
        expect(splitStationAssignments({}, ['station-start'])).toEqual({
            visible: [],
            orphaned: [],
        })
    })
})
