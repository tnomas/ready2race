import {describe, expect, it} from 'vitest'
import {
    effectiveProviderId,
    isMaterialWorkplacePath,
    MATERIAL_TABS,
    resolveMaterialTab,
    validateMaterialEventSearch,
    validateMaterialProviderSearch,
} from './materialDashboardLogic.ts'

describe('validateMaterialEventSearch', () => {
    it('behält bekannte Reiter und den Anbieter', () => {
        expect(validateMaterialEventSearch({tab: 'damages', provider: 'p1'})).toEqual({
            tab: 'damages',
            provider: 'p1',
        })
    })

    it('verwirft unbekannte Reiter und leere Anbieter', () => {
        expect(validateMaterialEventSearch({tab: 'xyz', provider: ''})).toEqual({
            tab: undefined,
            provider: undefined,
        })
        expect(validateMaterialEventSearch({tab: 3, provider: 7})).toEqual({
            tab: undefined,
            provider: undefined,
        })
    })
})

describe('validateMaterialProviderSearch', () => {
    it('liest nur den Anbieter', () => {
        expect(validateMaterialProviderSearch({provider: 'p1', tab: 'requests'})).toEqual({
            provider: 'p1',
        })
        expect(validateMaterialProviderSearch({})).toEqual({provider: undefined})
    })
})

describe('resolveMaterialTab', () => {
    it('nimmt den angefragten Reiter, wenn er existiert', () => {
        expect(resolveMaterialTab('assignment')).toBe('assignment')
    })

    it('fällt sonst auf den ersten Reiter zurück', () => {
        expect(resolveMaterialTab(undefined)).toBe(MATERIAL_TABS[0])
        expect(resolveMaterialTab('fleet')).toBe('requests')
    })
})

describe('effectiveProviderId', () => {
    it('zieht die eigene Zuordnung vor', () => {
        expect(
            effectiveProviderId({ownProviderId: 'own', mayReadGlobal: true, searchProvider: 'x'}),
        ).toBe('own')
    })

    it('nimmt den gewählten Anbieter nur mit globalem Leserecht', () => {
        expect(
            effectiveProviderId({
                ownProviderId: undefined,
                mayReadGlobal: true,
                searchProvider: 'x',
            }),
        ).toBe('x')
        expect(
            effectiveProviderId({
                ownProviderId: undefined,
                mayReadGlobal: false,
                searchProvider: 'x',
            }),
        ).toBeUndefined()
    })
})

describe('isMaterialWorkplacePath', () => {
    it('ist auf Wahl, Dashboard und Flotte aktiv', () => {
        expect(isMaterialWorkplacePath('/material')).toBe(true)
        expect(isMaterialWorkplacePath('/material/')).toBe(true)
        expect(isMaterialWorkplacePath('/material/event/abc')).toBe(true)
        expect(isMaterialWorkplacePath('/material/fleet')).toBe(true)
    })

    it('ist in der Stammdatenverwaltung und anderswo nicht aktiv', () => {
        expect(isMaterialWorkplacePath('/material/admin')).toBe(false)
        expect(isMaterialWorkplacePath('/material/admin/')).toBe(false)
        expect(isMaterialWorkplacePath('/materials')).toBe(false)
        expect(isMaterialWorkplacePath('/event/abc')).toBe(false)
    })

    it('berücksichtigt den Basispfad', () => {
        expect(isMaterialWorkplacePath('/r2r/material/fleet', '/r2r')).toBe(true)
        expect(isMaterialWorkplacePath('/r2r/material/admin', '/r2r/')).toBe(false)
    })
})
