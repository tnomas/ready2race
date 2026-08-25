import {describe, expect, test} from 'vitest'
import {MatchTeamLapDto} from '@api/types.gen.ts'
import {lapRanksByTeam, paceWithUnit, rankAtPosition, segmentPace} from './pace.ts'

/**
 * Eine Zwischenzeit, wie der Server sie liefert: kumulierte Fahrzeit seit dem Start und die
 * Distanz des Postens. `timeString` spielt für die Rechnung keine Rolle — gerechnet wird auf
 * den Millisekunden, angezeigt wird der Text des Servers.
 */
const lap = (name: string, seconds: number, distanceMeters?: number): MatchTeamLapDto => ({
    name,
    timeString: '',
    lapMillis: seconds * 1000,
    distanceMeters,
})

const team = (teamId: string, laps: MatchTeamLapDto[]) => ({teamId, laps})

describe('segmentPace', () => {
    test('Tempo zwischen zwei Posten: 1000 m in 200 s sind bei Bezug 500 m „1:40"', () => {
        const laps = [lap('Boje 1', 90, 500), lap('Boje 2', 290, 1500)]

        expect(segmentPace(laps, 'TIME_PER_DISTANCE', 500)).toEqual(['1:30', '1:40'])
    })

    test('der erste Abschnitt rechnet gegen Start und 0 m', () => {
        // Kein Vorgänger heißt nicht „kein Tempo": Der Start ist der Bezugspunkt jeder
        // Zwischenzeit, und er liegt bei 0 m und 0 ms.
        expect(segmentPace([lap('Boje 1', 200, 1000)], 'TIME_PER_DISTANCE', 500)).toEqual(['1:40'])
    })

    test('DISTANCE_PER_TIME: 1000 m in 200 s sind „18,0 km/h"', () => {
        const laps = [lap('Boje 1', 200, 1000)]

        expect(segmentPace(laps, 'DISTANCE_PER_TIME', 1000)).toEqual(['18,0'])
        expect(paceWithUnit('18,0', 'DISTANCE_PER_TIME', 1000)).toBe('18,0 km/h')
    })

    test('eine Zwischenzeit ohne Distanz ergibt für ihren Abschnitt null', () => {
        // Die RaceClocker-Rundenzeiten tragen keine Distanz. Dort bleibt die Stelle leer,
        // statt eine Zahl zu erfinden.
        const laps = [lap('Boje 1', 100, 500), lap('Runde 2', 300)]

        expect(segmentPace(laps, 'TIME_PER_DISTANCE', 500)).toEqual(['1:40', null])
    })

    test('dieselbe Distanz wie die vorige Zwischenzeit ergibt null statt einer Division durch null', () => {
        const laps = [lap('Boje 1', 100, 500), lap('Boje 2', 160, 500)]

        expect(segmentPace(laps, 'TIME_PER_DISTANCE', 500)).toEqual(['1:40', null])
    })

    test('eine Bezugsstrecke von null Metern ergibt null statt Unendlich', () => {
        // Die Spalte ist per Constraint größer null; die Rechnung verlässt sich nicht darauf.
        expect(segmentPace([lap('Boje 1', 200, 1000)], 'TIME_PER_DISTANCE', 0)).toEqual([null])
        expect(segmentPace([lap('Boje 1', 200, 1000)], 'DISTANCE_PER_TIME', 0)).toEqual([null])
    })

    test('eine Zwischenzeit ohne Zeitgewinn gegenüber der vorigen ergibt null', () => {
        // Zwei Marken mit derselben Fahrzeit: eine davon ist falsch erfasst. Ein Tempo daraus
        // wäre eine erfundene Zahl - hier sogar eine unendliche.
        const laps = [lap('Boje 1', 100, 500), lap('Boje 2', 100, 1000)]

        expect(segmentPace(laps, 'TIME_PER_DISTANCE', 500)).toEqual(['1:40', null])
    })

    test('ein Tempo über einer Stunde bekommt seine Stundenstelle', () => {
        // 100 m in 800 s hochgerechnet auf 500 m sind 4000 s - „66:40" läse niemand richtig.
        expect(segmentPace([lap('Boje 1', 800, 100)], 'TIME_PER_DISTANCE', 500)).toEqual([
            '1:06:40',
        ])
    })

    test('das Dezimaltrennzeichen kommt aus der Oberflächensprache', () => {
        // Der einzige Grund für den Parameter: die englische Oberfläche schreibt den Punkt.
        expect(segmentPace([lap('Boje 1', 200, 1000)], 'DISTANCE_PER_TIME', 1000, '.')).toEqual([
            '18.0',
        ])
    })
})

describe('rankAtPosition', () => {
    test('Rangfolge an einer Position nach lapMillis, Gleichstand bekommt denselben Rang', () => {
        const teams = [
            team('a', [lap('Boje 1', 90, 500)]),
            team('b', [lap('Boje 1', 80, 500)]),
            team('c', [lap('Boje 1', 90, 500)]),
        ]

        expect(rankAtPosition(teams, 1)).toEqual([
            {teamId: 'b', rank: 1},
            {teamId: 'a', rank: 2},
            {teamId: 'c', rank: 2},
        ])
    })

    test('ein Team ohne Zwischenzeit an dieser Position taucht in der Rangfolge nicht auf', () => {
        const teams = [
            team('a', [lap('Boje 1', 90, 500), lap('Boje 2', 190, 1000)]),
            team('b', [lap('Boje 1', 80, 500)]),
        ]

        expect(rankAtPosition(teams, 2)).toEqual([{teamId: 'a', rank: 1}])
    })

    /**
     * Der Fall vom Renntag: Der Posten an Boje 1 verpasst ein Boot. Das Backend zählt die
     * Positionen je Boot LÜCKENLOS (TimingSplitLogic.compute überspringt beim Verwerfen nicht) —
     * die fehlende Marke erzeugt also keine Lücke, sondern eine Verschiebung: Boje 2 rutscht bei
     * diesem Boot auf Stelle 1. Wer nach der Stelle rangiert, stellt dann eine 1000-m-Zeit neben
     * lauter 500-m-Zeiten und schreibt eine Ordnungszahl daneben, die nichts bedeutet — und weil
     * sie an Stelle 2 wieder stimmt, fällt es niemandem als Fehler auf.
     */
    test('ein Boot ohne die erste Marke verschiebt die Rangfolge nicht', () => {
        const feld = [
            team('a', [lap('Boje 1', 90, 500), lap('Boje 2', 185, 1000)]),
            team('b', [lap('Boje 1', 95, 500), lap('Boje 2', 191, 1000)]),
            team('c', [lap('Boje 2', 190, 1000)]),
        ]

        // Stelle 1 der STRECKE ist der 500-m-Punkt — dort war „c" nicht.
        expect(rankAtPosition(feld, 1)).toEqual([
            {teamId: 'a', rank: 1},
            {teamId: 'b', rank: 2},
        ])
        // Stelle 2 ist der 1000-m-Punkt: „c" zählt mit, und zwar gegen die richtigen Zeiten.
        expect(rankAtPosition(feld, 2)).toEqual([
            {teamId: 'a', rank: 1},
            {teamId: 'c', rank: 2},
            {teamId: 'b', rank: 3},
        ])
    })

    test('ohne jede Distanz entscheidet die Stelle', () => {
        // Die Spalten des Fremdsystems sind für alle Boote dieselben — dort IST die Stelle der
        // richtige Schlüssel, und nur dort.
        const feld = [
            team('a', [lap('Runde 1', 90), lap('Runde 2', 185)]),
            team('b', [lap('Runde 1', 95)]),
        ]

        expect(rankAtPosition(feld, 1)).toEqual([
            {teamId: 'a', rank: 1},
            {teamId: 'b', rank: 2},
        ])
        expect(rankAtPosition(feld, 2)).toEqual([{teamId: 'a', rank: 1}])
    })
})

describe('lapRanksByTeam', () => {
    test('je Boot ein Eintrag pro eigener Zwischenzeit, stellengleich zu dessen laps', () => {
        const teams = [
            team('a', [lap('Boje 1', 90, 500), lap('Boje 2', 190, 1000)]),
            team('b', [lap('Boje 1', 80, 500)]),
        ]

        const ranks = lapRanksByTeam(teams)

        expect(ranks.get('a')).toEqual([2, 1])
        expect(ranks.get('b')).toEqual([1])
    })

    test('eine Zwischenzeit ohne Zeit behält ihre Stelle und bekommt keinen Rang', () => {
        const ohneZeit: MatchTeamLapDto = {name: 'Boje 1', timeString: '', distanceMeters: 500}
        const teams = [team('a', [ohneZeit, lap('Boje 2', 190, 1000)])]

        expect(lapRanksByTeam(teams).get('a')).toEqual([null, 1])
    })

    test('der Rang des Bootes ohne erste Marke gehört an dessen einzige Marke', () => {
        const feld = [
            team('a', [lap('Boje 1', 90, 500), lap('Boje 2', 185, 1000)]),
            team('b', [lap('Boje 1', 95, 500), lap('Boje 2', 191, 1000)]),
            team('c', [lap('Boje 2', 190, 1000)]),
        ]

        const ranks = lapRanksByTeam(feld)

        expect(ranks.get('a')).toEqual([1, 1])
        expect(ranks.get('b')).toEqual([2, 3])
        expect(ranks.get('c')).toEqual([2])
    })

    test('ohne jede Distanz bleibt es bei der Stelle', () => {
        const feld = [
            team('a', [lap('Runde 1', 90), lap('Runde 2', 185)]),
            team('b', [lap('Runde 1', 95)]),
        ]

        const ranks = lapRanksByTeam(feld)

        expect(ranks.get('a')).toEqual([1, 1])
        expect(ranks.get('b')).toEqual([2])
    })
})
