import {describe, expect, it} from 'vitest'
import {materialErrorKey} from './materialErrors.ts'

describe('materialErrorKey', () => {
    it('erklärt die Fehler des Meldeformulars', () => {
        expect(
            materialErrorKey({status: {value: 409}, errorCode: 'MATERIAL_REQUESTS_CLOSED'}),
        ).toBe('material.error.requestsClosed')
        expect(materialErrorKey({errorCode: 'MATERIAL_TYPE_NOT_DEMANDED'})).toBe(
            'material.error.typeNotDemanded',
        )
    })

    it('erklärt Konflikte des Dashboards und der Verwaltung', () => {
        expect(materialErrorKey({errorCode: 'MATERIAL_REQUEST_NOT_CONFIRMED'})).toBe(
            'material.error.requestNotConfirmed',
        )
        expect(materialErrorKey({errorCode: 'MATERIAL_OFFER_IN_USE'})).toBe(
            'material.error.offerInUse',
        )
        expect(materialErrorKey({errorCode: 'MATERIAL_PROVIDER_HAS_USERS'})).toBe(
            'material.provider.hasUsers',
        )
    })

    it('bleibt bei Netzfehlern, fremden und fehlenden Codes stumm', () => {
        expect(materialErrorKey({kind: 'network', cause: new Error('x')})).toBeNull()
        expect(materialErrorKey({errorCode: 'EVENT_REGISTRATION_CLOSED'})).toBeNull()
        expect(materialErrorKey({status: {value: 404}})).toBeNull()
        expect(materialErrorKey(undefined)).toBeNull()
    })
})
