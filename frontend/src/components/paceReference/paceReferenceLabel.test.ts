import {describe, expect, it} from 'vitest'
import {paceReferenceLabel} from './paceReferenceLabel.ts'

describe('paceReferenceLabel', () => {
    it('zeigt bei Zeit pro Strecke die Strecke in Metern', () => {
        expect(paceReferenceLabel('TIME_PER_DISTANCE', 500)).toBe('/500 m')
    })

    it('rechnet volle Kilometer in Kilometer um', () => {
        expect(paceReferenceLabel('TIME_PER_DISTANCE', 1000)).toBe('/km')
    })

    it('zeigt bei Strecke pro Zeit die Einheit', () => {
        expect(paceReferenceLabel('DISTANCE_PER_TIME', 1000)).toBe('km/h')
    })

    // Eine krumme Bezugsstrecke ist erlaubt und darf nicht als Kilometer durchgehen.
    it('lässt krumme Strecken in Metern stehen', () => {
        expect(paceReferenceLabel('DISTANCE_PER_TIME', 500)).toBe('500 m/h')
    })
})
