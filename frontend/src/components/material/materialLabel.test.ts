import {describe, expect, test} from 'vitest'
import {MaterialForTeamDto} from '@api/types.gen.ts'
import {materialLabel} from './materialLabel.ts'

const boat = (overrides: Partial<MaterialForTeamDto> = {}): MaterialForTeamDto => ({
    number: 7,
    label: 'Boot 7',
    category: 'BOAT',
    deviatesFromStartNumber: false,
    ...overrides,
})

describe('materialLabel', () => {
    test('ohne Material zeigt der Modus deviationsOnly nichts', () => {
        expect(materialLabel(null, 'deviationsOnly')).toBeNull()
        expect(materialLabel(undefined, 'deviationsOnly')).toBeNull()
    })

    test('ohne Material zeigt der Modus always das eigene Boot', () => {
        expect(materialLabel(null, 'always')).toBe('own')
        expect(materialLabel(undefined, 'always')).toBe('own')
    })

    test('Kategorie OTHER erscheint in keinem Modus', () => {
        const other = boat({category: 'OTHER', deviatesFromStartNumber: true})
        expect(materialLabel(other, 'deviationsOnly')).toBeNull()
        expect(materialLabel(other, 'always')).toBeNull()
    })

    test('gleiche Nummer zeigt der Modus deviationsOnly nichts', () => {
        expect(materialLabel(boat({deviatesFromStartNumber: false}), 'deviationsOnly')).toBeNull()
    })

    test('gleiche Nummer zeigt der Modus always trotzdem das Boot', () => {
        expect(materialLabel(boat({deviatesFromStartNumber: false}), 'always')).toEqual({
            text: 'Boot 7',
            deviates: false,
        })
    })

    test('eine Abweichung erscheint in beiden Modi', () => {
        const deviating = boat({deviatesFromStartNumber: true})
        expect(materialLabel(deviating, 'deviationsOnly')).toEqual({
            text: 'Boot 7',
            deviates: true,
        })
        expect(materialLabel(deviating, 'always')).toEqual({text: 'Boot 7', deviates: true})
    })

    test('die Bootsnummer steht nur in label, nicht als eigenes Feld', () => {
        // "Boot 7" ist bereits die vollständige Beschriftung - materialLabel hängt die
        // Nummer nicht noch einmal an; die Zusammensetzung mit der Startposition ist
        // Sache des Aufrufers (MyEventMatchList).
        const result = materialLabel(
            boat({number: 7, label: 'Boot 7', deviatesFromStartNumber: true}),
            'always',
        )
        expect(result).toEqual({text: 'Boot 7', deviates: true})
    })
})
