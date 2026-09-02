import {describe, expect, it} from 'vitest'
import {
    BAND_STACKED_MAX,
    BOARD_SINGLE_COLUMN_MAX,
    BOARD_STACKED_MAX,
    SCHEDULE_SINGLE_COLUMN_MAX,
    bandRowMode,
    boardLayout,
    boatStatus,
    formForPlacement,
    scheduleColumns,
    splitColumns,
} from './streamLayout'

describe('formForPlacement', () => {
    it('macht aus dem Vollbild-Platz eine Tafel, aus den unteren Plätzen ein Band', () => {
        expect(formForPlacement('FULL_CENTER')).toBe('board')
        expect(formForPlacement('BOTTOM_CENTER')).toBe('band')
        expect(formForPlacement('BOTTOM_LEFT')).toBe('band')
        expect(formForPlacement('BOTTOM_RIGHT')).toBe('band')
    })

    it('behandelt Seiten- und Kopfplätze als Leiste bzw. Platte', () => {
        expect(formForPlacement('SIDE_LEFT')).toBe('side')
        expect(formForPlacement('SIDE_RIGHT')).toBe('side')
        expect(formForPlacement('TOP_LEFT')).toBe('plate')
        expect(formForPlacement('TOP_RIGHT')).toBe('plate')
    })
})

describe('bandRowMode', () => {
    it('lässt kleinen Feldern die zweizeilige Bootszeile und schaltet darüber auf eine Zeile um', () => {
        expect(bandRowMode(1)).toBe('stacked')
        expect(bandRowMode(BAND_STACKED_MAX)).toBe('stacked')
        expect(bandRowMode(BAND_STACKED_MAX + 1)).toBe('line')
        expect(bandRowMode(12)).toBe('line')
    })
})

describe('boardLayout', () => {
    it('bleibt bis zur Grenze einspaltig und zweizeilig', () => {
        expect(boardLayout(1)).toEqual({columns: 1, mode: 'stacked'})
        expect(boardLayout(BOARD_SINGLE_COLUMN_MAX)).toEqual({columns: 1, mode: 'stacked'})
    })

    it('öffnet über der Grenze eine zweite Spalte und behält die Zweizeiligkeit bis 16 Boote', () => {
        expect(boardLayout(BOARD_SINGLE_COLUMN_MAX + 1)).toEqual({columns: 2, mode: 'stacked'})
        expect(boardLayout(BOARD_STACKED_MAX)).toEqual({columns: 2, mode: 'stacked'})
    })

    it('wird erst jenseits von 16 Booten einzeilig, statt die Tafel zu schrumpfen', () => {
        expect(boardLayout(BOARD_STACKED_MAX + 1)).toEqual({columns: 2, mode: 'line'})
        expect(boardLayout(20)).toEqual({columns: 2, mode: 'line'})
    })
})

describe('scheduleColumns', () => {
    it('zeigt ein kurzes Programm einspaltig und ein langes zweispaltig', () => {
        expect(scheduleColumns(SCHEDULE_SINGLE_COLUMN_MAX)).toBe(1)
        expect(scheduleColumns(SCHEDULE_SINGLE_COLUMN_MAX + 1)).toBe(2)
    })
})

describe('splitColumns', () => {
    it('füllt spaltenweise, die erste Spalte bekommt den Überhang', () => {
        expect(splitColumns([1, 2, 3, 4, 5], 2)).toEqual([
            [1, 2, 3],
            [4, 5],
        ])
    })

    it('liefert bei einer Spalte die Liste unverändert', () => {
        expect(splitColumns(['a', 'b'], 1)).toEqual([['a', 'b']])
    })

    it('lässt eine leere Liste leer, auch bei mehreren Spalten', () => {
        expect(splitColumns([], 2)).toEqual([[], []])
    })
})

describe('boatStatus', () => {
    const labels = {failed: 'Ausgeschieden', deregistered: 'Abgemeldet'}

    it('zeigt die Zeit eines gewerteten Boots in normaler Tönung', () => {
        expect(
            boatStatus({failed: false, deregistered: false, timeString: '6:12.3'}, labels),
        ).toEqual({text: '6:12.3', tone: 'normal'})
    })

    it('liest das Kürzel aus dem Ausscheidungsgrund und tönt es als Warnung', () => {
        expect(
            boatStatus({failed: true, failedReason: 'DNF', deregistered: false, timeString: null}, labels),
        ).toEqual({text: 'DNF', tone: 'warning'})
        expect(
            boatStatus({failed: true, failedReason: null, deregistered: false, timeString: null}, labels),
        ).toEqual({text: 'Ausgeschieden', tone: 'warning'})
    })

    it('stellt eine Abmeldung gedämpft und vor jedes Ergebnis', () => {
        expect(
            boatStatus(
                {failed: true, failedReason: 'DNS', deregistered: true, timeString: '1:00.0'},
                labels,
            ),
        ).toEqual({text: 'Abgemeldet', tone: 'muted'})
    })

    it('liefert nichts, solange weder Zeit noch Status vorliegen (Aufstellung)', () => {
        expect(boatStatus({failed: false, deregistered: false, timeString: null}, labels)).toBeNull()
    })
})
