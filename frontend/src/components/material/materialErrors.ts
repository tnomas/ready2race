import {ErrorCode} from '@api/types.gen.ts'

/**
 * Fachliche Fehler der Materialdomäne, die die Oberfläche erklären kann (Backend `MaterialError`
 * mit `errorCode`). Alles andere – 404, Schutzprüfungen, die die Oberfläche gar nicht erst
 * anbietet – bleibt beim Text der jeweiligen Aktion bzw. bei „unerwarteter Fehler“.
 */
export type MaterialErrorKey =
    | 'material.error.requestsClosed'
    | 'material.error.typeNotDemanded'
    | 'material.error.providerInUse'
    | 'material.error.typeInUse'
    | 'material.error.itemInUse'
    | 'material.error.offerInUse'
    | 'material.error.notInvited'
    | 'material.error.requestNotConfirmed'
    | 'material.error.matchNotOfRegistration'
    | 'material.error.invalidOutageWindow'
    | 'material.error.removalClosed'
    | 'material.error.offerTypeLocked'
    | 'material.error.itemTypeLocked'
    | 'material.error.itemHasDamages'
    | 'material.error.itemRetired'
    | 'material.error.duplicateAssignment'
    | 'material.provider.hasUsers'
    | 'material.damage.photoTooLarge'
    | 'material.damage.photoInvalidType'

const KEYS: Partial<Record<ErrorCode, MaterialErrorKey>> = {
    MATERIAL_REQUESTS_CLOSED: 'material.error.requestsClosed',
    MATERIAL_TYPE_NOT_DEMANDED: 'material.error.typeNotDemanded',
    MATERIAL_PROVIDER_IN_USE: 'material.error.providerInUse',
    MATERIAL_TYPE_IN_USE: 'material.error.typeInUse',
    MATERIAL_ITEM_IN_USE: 'material.error.itemInUse',
    MATERIAL_OFFER_IN_USE: 'material.error.offerInUse',
    MATERIAL_PROVIDER_NOT_INVITED: 'material.error.notInvited',
    MATERIAL_REQUEST_NOT_CONFIRMED: 'material.error.requestNotConfirmed',
    MATERIAL_MATCH_NOT_OF_REGISTRATION: 'material.error.matchNotOfRegistration',
    MATERIAL_INVALID_OUTAGE_WINDOW: 'material.error.invalidOutageWindow',
    MATERIAL_REMOVAL_REQUESTS_CLOSED: 'material.error.removalClosed',
    MATERIAL_OFFER_TYPE_LOCKED: 'material.error.offerTypeLocked',
    MATERIAL_ITEM_TYPE_LOCKED: 'material.error.itemTypeLocked',
    MATERIAL_ITEM_HAS_DAMAGES: 'material.error.itemHasDamages',
    MATERIAL_ITEM_RETIRED: 'material.error.itemRetired',
    MATERIAL_DUPLICATE_ASSIGNMENT: 'material.error.duplicateAssignment',
    MATERIAL_PROVIDER_HAS_USERS: 'material.provider.hasUsers',
    MATERIAL_PHOTO_TOO_LARGE: 'material.damage.photoTooLarge',
    MATERIAL_PHOTO_INVALID_TYPE: 'material.damage.photoInvalidType',
}

/** Der erklärende Text zu einer Fehlerantwort – `null`, wenn sie keinen bekannten Code trägt. */
export const materialErrorKey = (error: unknown): MaterialErrorKey | null => {
    if (typeof error !== 'object' || error === null || !('errorCode' in error)) return null
    const code = (error as {errorCode?: unknown}).errorCode
    return typeof code === 'string' ? (KEYS[code as ErrorCode] ?? null) : null
}
