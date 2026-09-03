/**
 * Das Gedächtnis der Helfer-App: die gewählte Veranstaltung und der Stationsmodus.
 *
 * Beides liegt im `localStorage`, weil die installierte App einen Neustart durch das
 * Betriebssystem überstehen muss. Der Schlüssel der Veranstaltung bleibt `eventId`, damit ein
 * Update niemanden nach der Veranstaltung fragt, die er gestern schon gewählt hat.
 *
 * Der Modus gilt nur für dieselbe Person an derselben Veranstaltung: Ein Gerät wandert am
 * Regattatag zwischen Helfern, und ein gemerktes „Verpflegung" darf nicht die nächste Person an
 * der Waage in die falsche Ansicht schicken.
 *
 * Der Speicher wird injiziert, weil die vitest-Umgebung `node` ist.
 */
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {ScanMode} from './appAccess.ts'

export const EVENT_KEY = 'eventId'
export const SCAN_MODE_KEY = 'app.scanMode'
export const LEGACY_APP_FUNCTION_KEY = 'appFunction'
/** Der zuletzt an einer Station gewählte Wettkampf (siehe `ParticipantRequirements`). */
export const REQUIREMENT_COMPETITION_KEY = 'appRequirementCompetition'

export const readRememberedEvent = (store: WebStorageLike): string | null => {
    const value = store.getItem(EVENT_KEY)
    return value !== null && value.length > 0 ? value : null
}

export const writeRememberedEvent = (eventId: string, store: WebStorageLike): void => {
    store.setItem(EVENT_KEY, eventId)
}

type StoredScanMode = {
    userId: string
    eventId: string
    mode: ScanMode
}

export const readScanMode = (
    userId: string,
    eventId: string,
    rights: readonly ScanMode[],
    store: WebStorageLike,
): ScanMode | null => {
    const raw = store.getItem(SCAN_MODE_KEY)
    if (raw === null) return null
    let parsed: Partial<StoredScanMode>
    try {
        parsed = JSON.parse(raw) as Partial<StoredScanMode>
    } catch {
        return null
    }
    if (parsed.userId !== userId || parsed.eventId !== eventId) return null
    if (parsed.mode === undefined || !rights.includes(parsed.mode)) return null
    return parsed.mode
}

export const writeScanMode = (
    userId: string,
    eventId: string,
    mode: ScanMode,
    store: WebStorageLike,
): void => {
    const stored: StoredScanMode = {userId, eventId, mode}
    store.setItem(SCAN_MODE_KEY, JSON.stringify(stored))
}

/** Der Vorgänger merkte sich die vor dem Scan gewählte Aufgabe. Den Eintrag braucht niemand mehr. */
export const forgetLegacyAppFunction = (store: WebStorageLike): void => {
    store.removeItem(LEGACY_APP_FUNCTION_KEY)
}
