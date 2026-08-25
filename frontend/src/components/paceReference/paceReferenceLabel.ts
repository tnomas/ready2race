import {PaceReferenceMode} from '@api/types.gen.ts'

/**
 * Die Beschriftung einer Bezugsgröße — abgeleitet, nicht gespeichert: Ein eigenes Feld dafür wäre
 * eine zweite Wahrheit, die beim Ändern der Bezugsstrecke still falsch würde.
 *
 * Volle Kilometer werden als solche geschrieben, weil „/1000 m" niemand so liest.
 */
export const paceReferenceLabel = (mode: PaceReferenceMode, referenceMeters: number): string => {
    const strecke = referenceMeters % 1000 === 0 ? `${referenceMeters / 1000} km` : `${referenceMeters} m`
    const kurz = strecke === '1 km' ? 'km' : strecke
    return mode === 'TIME_PER_DISTANCE' ? `/${kurz}` : `${kurz}/h`
}
