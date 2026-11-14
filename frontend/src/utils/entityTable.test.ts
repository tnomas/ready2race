import {describe, expect, it} from 'vitest'
import {
    clampPage,
    entityDisplayName,
    firstPage,
    planCardFields,
    rowActionsInline,
} from './entityTable.ts'

describe('firstPage', () => {
    it('setzt eine spätere Seite auf 0', () => {
        expect(firstPage({page: 3, pageSize: 10})).toEqual({page: 0, pageSize: 10})
    })
    it('lässt Seite 0 als dasselbe Objekt stehen (kein Zusatzabruf)', () => {
        const model = {page: 0, pageSize: 25}
        expect(firstPage(model)).toBe(model)
    })
})

describe('clampPage', () => {
    it('zieht eine Seite hinter dem Ende auf die letzte gültige', () => {
        expect(clampPage({page: 4, pageSize: 10}, 31)).toEqual({page: 3, pageSize: 10})
    })
    it('landet bei 0, wenn nichts mehr da ist', () => {
        expect(clampPage({page: 2, pageSize: 10}, 0)).toEqual({page: 0, pageSize: 10})
    })
    it('lässt eine gültige Seite unverändert', () => {
        const model = {page: 3, pageSize: 10}
        expect(clampPage(model, 31)).toBe(model)
        expect(clampPage(model, 40)).toBe(model)
    })
    it('übersteht eine Seitengröße 0', () => {
        const model = {page: 1, pageSize: 0}
        expect(clampPage(model, 5)).toBe(model)
    })
})

describe('rowActionsInline', () => {
    it('zeigt eine oder zwei Aktionen direkt in der Zeile', () => {
        expect(rowActionsInline(1)).toBe(true)
        expect(rowActionsInline(2)).toBe(true)
    })
    it('legt ab drei Aktionen alles ins Menü', () => {
        expect(rowActionsInline(3)).toBe(false)
        expect(rowActionsInline(7)).toBe(false)
    })
    it('kennt keine Aktionen ohne Aktionen', () => {
        expect(rowActionsInline(0)).toBe(false)
    })
    it('erzwingt mit "menu" das frühere Verhalten', () => {
        expect(rowActionsInline(1, 'menu')).toBe(false)
        expect(rowActionsInline(2, 'menu')).toBe(false)
    })
})

describe('entityDisplayName', () => {
    it('nimmt den Namen', () => {
        expect(entityDisplayName({name: ' Kieler Woche ', identifier: '12'})).toBe('Kieler Woche')
    })
    it('nimmt Vor- und Nachname, wenn es keinen Namen gibt', () => {
        expect(entityDisplayName({firstname: 'Ilka', lastname: 'Muster'})).toBe('Ilka Muster')
        expect(entityDisplayName({lastname: 'Muster'})).toBe('Muster')
    })
    it('nimmt die Kennung als letzte Wahl', () => {
        expect(entityDisplayName({identifier: '12 JM4x', name: ''})).toBe('12 JM4x')
    })
    it('liefert nichts für Datensätze ohne lesbaren Namen', () => {
        expect(entityDisplayName({id: 'x', name: 5})).toBeUndefined()
        expect(entityDisplayName(null)).toBeUndefined()
    })
})

describe('planCardFields', () => {
    const col = (field: string, mobile?: 'title' | 'show' | 'hide') => ({field, mobile})

    it('nimmt die erste Spalte als Titel und zeigt höchstens vier weitere', () => {
        const plan = planCardFields([col('a'), col('b'), col('c'), col('d'), col('e'), col('f')])
        expect(plan.title?.field).toBe('a')
        expect(plan.visible.map(c => c.field)).toEqual(['b', 'c', 'd', 'e'])
        expect(plan.more.map(c => c.field)).toEqual(['f'])
    })
    it('lässt die Aktionen-Spalte und versteckte Spalten weg', () => {
        const plan = planCardFields([col('actions'), col('a'), col('b', 'hide'), col('c')])
        expect(plan.title?.field).toBe('a')
        expect(plan.visible.map(c => c.field)).toEqual(['c'])
        expect(plan.more).toEqual([])
    })
    it('folgt einer ausdrücklichen Titelspalte und behält die Reihenfolge', () => {
        const plan = planCardFields([col('a'), col('b', 'title'), col('c')])
        expect(plan.title?.field).toBe('b')
        expect(plan.visible.map(c => c.field)).toEqual(['a', 'c'])
    })
    it('zeigt "show"-Spalten immer, auch über die Grenze hinaus', () => {
        const plan = planCardFields(
            [col('t'), col('a'), col('b'), col('c'), col('d'), col('e', 'show')],
            2,
        )
        expect(plan.visible.map(c => c.field)).toEqual(['a', 'e'])
        expect(plan.more.map(c => c.field)).toEqual(['b', 'c', 'd'])
    })
    it('kommt mit leeren Spalten zurecht', () => {
        expect(planCardFields([])).toEqual({title: undefined, visible: [], more: []})
    })
})
