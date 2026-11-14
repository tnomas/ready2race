import {describe, expect, it} from 'vitest'
import {shuffle} from './helpers'

describe('shuffle', () => {
    it('liefert ein Array mit allen Elementen und verändert die Eingabe nicht', () => {
        const input = [1, 2, 3, 4, 5, 6, 7, 8]
        const copy = [...input]
        const result = shuffle(input)
        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(input.length)
        expect([...result].sort()).toEqual(copy)
        expect(input).toEqual(copy)
        expect(result).not.toBe(input)
    })

    it('verarbeitet eine leere Liste', () => {
        expect(shuffle([])).toEqual([])
    })
})
