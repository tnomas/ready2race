import {describe, expect, it} from 'vitest'
import {PrivilegeCheck, scanRightsOf, worldPath, worldsOf} from './appAccess'

/** Eine Person, die genau die genannten Ressourcen (GLOBAL) darf. */
const may =
    (...resources: string[]): PrivilegeCheck =>
    privilege =>
        resources.includes(privilege.resource)

describe('scanRightsOf', () => {
    it('liefert nichts ohne App-Rechte', () => {
        expect(scanRightsOf(may())).toEqual([])
        expect(scanRightsOf(may('EVENT', 'APP_TIMING'))).toEqual([])
    })

    it('liefert die Scan-Rechte in fester Reihenfolge, unabhängig von der Vergabe', () => {
        expect(scanRightsOf(may('APP_CATERER', 'APP_QR_MANAGEMENT'))).toEqual([
            'APP_QR_MANAGEMENT',
            'APP_CATERER',
        ])
        expect(
            scanRightsOf(
                may(
                    'APP_EVENT_REQUIREMENT',
                    'APP_COMPETITION_CHECK',
                    'APP_CATERER',
                    'APP_QR_MANAGEMENT',
                ),
            ),
        ).toEqual([
            'APP_QR_MANAGEMENT',
            'APP_COMPETITION_CHECK',
            'APP_EVENT_REQUIREMENT',
            'APP_CATERER',
        ])
    })
})

describe('worldsOf', () => {
    it('kennt keine Welt ohne Rechte', () => {
        expect(worldsOf(may())).toEqual([])
    })

    it('fasst alle Scan-Rechte zu einer Welt zusammen', () => {
        expect(worldsOf(may('APP_QR_MANAGEMENT', 'APP_CATERER'))).toEqual(['SCAN'])
    })

    it('ordnet Zeitnahme und Dashboard nach dem Scannen ein', () => {
        expect(worldsOf(may('LIVE_DASHBOARD', 'APP_TIMING', 'APP_CATERER'))).toEqual([
            'SCAN',
            'TIMING',
            'DASHBOARD',
        ])
        expect(worldsOf(may('APP_TIMING'))).toEqual(['TIMING'])
    })

    it('kennt zu jeder Welt eine Adresse', () => {
        expect(worldPath.SCAN).toBe('/app/scan')
        expect(worldPath.TIMING).toBe('/app/timing')
        expect(worldPath.DASHBOARD).toBe('/app/dashboard')
    })
})
