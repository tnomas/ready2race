import {describe, expect, it} from 'vitest'
import {WebStorageLike} from '@contexts/user/sessionToken.ts'
import {
    EVENT_KEY,
    forgetLegacyAppFunction,
    readRememberedEvent,
    readScanMode,
    SCAN_MODE_KEY,
    writeRememberedEvent,
    writeScanMode,
} from './appMemory'

/** Ein Speicher, wie ihn der Browser hätte — nur im Arbeitsspeicher, weil vitest unter Node läuft. */
const memoryStore = (): WebStorageLike & {data: Map<string, string>} => {
    const data = new Map<string, string>()
    return {
        data,
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value)
        },
        removeItem: key => {
            data.delete(key)
        },
    }
}

describe('Veranstaltung', () => {
    it('ist ohne Eintrag nicht gemerkt', () => {
        expect(readRememberedEvent(memoryStore())).toBeNull()
    })

    it('liest, was geschrieben wurde, unter dem alten Schlüssel', () => {
        const store = memoryStore()
        writeRememberedEvent('e-1', store)
        expect(store.data.get(EVENT_KEY)).toBe('e-1')
        expect(readRememberedEvent(store)).toBe('e-1')
    })

    it('behandelt einen leeren Eintrag wie keinen', () => {
        const store = memoryStore()
        store.setItem(EVENT_KEY, '')
        expect(readRememberedEvent(store)).toBeNull()
    })
})

describe('Modus', () => {
    const rights = ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT'] as const

    it('ist ohne Eintrag nicht gesetzt', () => {
        expect(readScanMode('u-1', 'e-1', rights, memoryStore())).toBeNull()
    })

    it('gilt für dieselbe Person an derselben Veranstaltung', () => {
        const store = memoryStore()
        writeScanMode('u-1', 'e-1', 'APP_EVENT_REQUIREMENT', store)
        expect(readScanMode('u-1', 'e-1', rights, store)).toBe('APP_EVENT_REQUIREMENT')
    })

    it('verfällt bei anderer Person oder anderer Veranstaltung', () => {
        const store = memoryStore()
        writeScanMode('u-1', 'e-1', 'APP_EVENT_REQUIREMENT', store)
        expect(readScanMode('u-2', 'e-1', rights, store)).toBeNull()
        expect(readScanMode('u-1', 'e-2', rights, store)).toBeNull()
    })

    it('verfällt, wenn das Recht dazu inzwischen fehlt', () => {
        const store = memoryStore()
        writeScanMode('u-1', 'e-1', 'APP_CATERER', store)
        expect(readScanMode('u-1', 'e-1', rights, store)).toBeNull()
    })

    it('übersteht kaputte Einträge', () => {
        const store = memoryStore()
        store.setItem(SCAN_MODE_KEY, '{nicht json')
        expect(readScanMode('u-1', 'e-1', rights, store)).toBeNull()
        store.setItem(SCAN_MODE_KEY, JSON.stringify({userId: 'u-1'}))
        expect(readScanMode('u-1', 'e-1', rights, store)).toBeNull()
    })
})

describe('forgetLegacyAppFunction', () => {
    it('entfernt den alten Schlüssel und lässt alles andere stehen', () => {
        const store = memoryStore()
        store.setItem('appFunction', 'APP_CATERER')
        store.setItem(EVENT_KEY, 'e-1')
        forgetLegacyAppFunction(store)
        expect(store.data.has('appFunction')).toBe(false)
        expect(store.data.get(EVENT_KEY)).toBe('e-1')
    })
})
