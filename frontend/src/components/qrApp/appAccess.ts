/**
 * Was eine Person in der Helfer-App darf — reduziert auf die zwei Fragen, die den Ablauf
 * bestimmen: Welche Scan-Rechte hat sie (daraus wird der Modus), und welche Welten kann sie
 * betreten (Scannen, Zeitnahme, Dashboard)?
 *
 * Bewusst über eine `PrivilegeCheck`-Funktion statt über den `User`-Context, damit die Logik im
 * Node-Testlauf ohne React geprüft werden kann.
 */
import {Privilege} from '@api/types.gen.ts'
import {
    readLiveDashboardGlobal,
    updateAppCatererGlobal,
    updateAppCompetitionCheckGlobal,
    updateAppEventRequirementGlobal,
    updateAppQrManagementGlobal,
    updateAppTimingGlobal,
} from '@authorization/privileges.ts'

export type ScanMode =
    | 'APP_QR_MANAGEMENT'
    | 'APP_COMPETITION_CHECK'
    | 'APP_EVENT_REQUIREMENT'
    | 'APP_CATERER'

/** Feste Reihenfolge für Auswahlknöpfe und Listen: Bänder, Boote, Bedingungen, Verpflegung. */
export const SCAN_MODES: readonly ScanMode[] = [
    'APP_QR_MANAGEMENT',
    'APP_COMPETITION_CHECK',
    'APP_EVENT_REQUIREMENT',
    'APP_CATERER',
]

const scanModePrivilege: Record<ScanMode, Privilege> = {
    APP_QR_MANAGEMENT: updateAppQrManagementGlobal,
    APP_COMPETITION_CHECK: updateAppCompetitionCheckGlobal,
    APP_EVENT_REQUIREMENT: updateAppEventRequirementGlobal,
    APP_CATERER: updateAppCatererGlobal,
}

export type AppWorld = 'SCAN' | 'TIMING' | 'DASHBOARD'

export type WorldPath = '/app/scan' | '/app/timing' | '/app/dashboard'

export const worldPath: Record<AppWorld, WorldPath> = {
    SCAN: '/app/scan',
    TIMING: '/app/timing',
    DASHBOARD: '/app/dashboard',
}

export type PrivilegeCheck = (privilege: Privilege) => boolean

export const scanRightsOf = (check: PrivilegeCheck): ScanMode[] =>
    SCAN_MODES.filter(mode => check(scanModePrivilege[mode]))

export const worldsOf = (check: PrivilegeCheck): AppWorld[] => {
    const worlds: AppWorld[] = []
    if (scanRightsOf(check).length > 0) worlds.push('SCAN')
    if (check(updateAppTimingGlobal)) worlds.push('TIMING')
    if (check(readLiveDashboardGlobal)) worlds.push('DASHBOARD')
    return worlds
}
