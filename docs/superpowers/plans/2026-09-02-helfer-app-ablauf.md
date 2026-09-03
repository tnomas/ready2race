# Helfer-App mit Scan-zuerst-Ablauf — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Helfer-App unter `/app` beginnt mit dem Scanner, leitet aus Band und Rechten ab, was zu tun ist, merkt sich Veranstaltung und Modus, und kommt mit so wenigen Ansichten wie möglich aus.

**Architecture:** Der Scan-Ablauf bekommt echte Adressen (`/app`, `/app/scan`, `/app/scan/$qrCodeId`, `/app/einstellungen`); die Band-ID reist in der Adresse, nicht im Context. Drei reine Funktionen tragen die Entscheidungen — Einstiegsweiche, Scan-Entscheidung, Gedächtnis — und werden ohne Browser getestet. Der bestehende Context schrumpft auf das Gedächtnis (Veranstaltung, Modus, Veranstaltungsliste). Die Ergebnis-Bausteine (Check-in, Bedingungen, Verpflegung, Zuweisung) werden zuerst als eigenständige, per Eigenschaften gesteuerte Komponenten gebaut, dann wird der Kern umgestellt und die alten Seiten entfallen.

**Tech Stack:** React 18, TypeScript, Vite 6, MUI 6, TanStack Router 1.91, react-i18next, vitest (Node-Umgebung, kein DOM).

**Spec:** `docs/superpowers/specs/2026-09-02-helfer-app-ablauf-design.md`

## Global Constraints

- Alle Kommandos laufen im Verzeichnis `frontend/`.
- Tests: `npm test` (= `vitest run`), Einzeldatei `npx vitest run <pfad>`. Die Konfiguration sammelt `src/**/*.test.ts` — Tests enden auf `.test.ts`, nicht `.test.tsx`.
- **Die vitest-Umgebung ist `node`: kein `localStorage`, kein DOM.** Module, die Speicher anfassen, bekommen ihn als `WebStorageLike` injiziert (Typ aus `src/contexts/user/sessionToken.ts`). Keine Komponententests, nur reine Logik.
- Pfad-Aliasse: `@api/…`, `@components/…`, `@contexts/…`, `@authorization/…`, `@utils/…`, `@pwa/…`, `@routes`, `@i18n/…`.
- Deutsche Texte mit echten Umlauten (ä, ö, ü, ß). Jeder neue i18n-Schlüssel wird in **allen drei** Dateien gepflegt: `src/i18n/de/translations.json`, `src/i18n/en/translations.json`, `src/i18n/da/translations.json`. `t()` nimmt nur bekannte Schlüssel entgegen; ein Schlüssel, der in `de` fehlt, bricht `tsc`.
- Nichts außerhalb von `/app` ändert sein Verhalten. Die kanonischen Zeitnahme-Adressen `/event/$eventId/timing/...` und die Boards selbst bleiben unangetastet.
- Keine neuen Abhängigkeiten.
- Commit-Nachrichten auf Deutsch, ohne Hinweis auf KI-Beteiligung, kein `Co-Authored-By`.
- Nach jeder Aufgabe müssen `npm test`, `npm run build` (`tsc -b && vite build`) und `npm run lint` sauber durchlaufen.
- Kommentare im Code erklären das Warum, nicht das Was; in der Sprache der jeweiligen Datei (die App-Dateien sind überwiegend deutsch kommentiert).
- Keine Herkunftsangaben oder Inspirationsquellen in Code, Kommentaren oder Commits.

---

### Task 1: Rechte und Welten (`appAccess.ts`)

**Files:**
- Create: `frontend/src/components/qrApp/appAccess.ts`
- Test: `frontend/src/components/qrApp/appAccess.test.ts`

**Interfaces:**
- Consumes: `Privilege` aus `@api/types.gen.ts` (`{action, resource, scope}`), die Konstanten `updateAppQrManagementGlobal`, `updateAppCompetitionCheckGlobal`, `updateAppEventRequirementGlobal`, `updateAppCatererGlobal`, `updateAppTimingGlobal`, `readLiveDashboardGlobal` aus `@authorization/privileges.ts`.
- Produces:
  - `type ScanMode = 'APP_QR_MANAGEMENT' | 'APP_COMPETITION_CHECK' | 'APP_EVENT_REQUIREMENT' | 'APP_CATERER'`
  - `const SCAN_MODES: readonly ScanMode[]` (feste Reihenfolge: Bänder, Boote, Bedingungen, Verpflegung)
  - `type AppWorld = 'SCAN' | 'TIMING' | 'DASHBOARD'`
  - `type PrivilegeCheck = (privilege: Privilege) => boolean`
  - `scanRightsOf(check: PrivilegeCheck): ScanMode[]`
  - `worldsOf(check: PrivilegeCheck): AppWorld[]` (Reihenfolge SCAN, TIMING, DASHBOARD)
  - `type WorldPath = '/app/scan' | '/app/timing' | '/app/dashboard'`
  - `const worldPath: Record<AppWorld, WorldPath>`

- [ ] **Step 1: Test schreiben**

`frontend/src/components/qrApp/appAccess.test.ts`:

```ts
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
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/components/qrApp/appAccess.test.ts`
Expected: FAIL, Modul `./appAccess` nicht gefunden.

- [ ] **Step 3: Implementierung**

`frontend/src/components/qrApp/appAccess.ts`:

```ts
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
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run src/components/qrApp/appAccess.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/qrApp/appAccess.ts frontend/src/components/qrApp/appAccess.test.ts
git commit -m "Helfer-App: Scan-Rechte und Welten als reine Funktionen"
```

---

### Task 2: Gedächtnis für Veranstaltung und Modus (`appMemory.ts`)

**Files:**
- Create: `frontend/src/components/qrApp/appMemory.ts`
- Test: `frontend/src/components/qrApp/appMemory.test.ts`

**Interfaces:**
- Consumes: `WebStorageLike` aus `@contexts/user/sessionToken.ts`; `ScanMode` aus Task 1.
- Produces:
  - `const EVENT_KEY = 'eventId'` (bestehender Schlüssel, bleibt für die installierte App gleich)
  - `const SCAN_MODE_KEY = 'app.scanMode'`
  - `readRememberedEvent(store: WebStorageLike): string | null`
  - `writeRememberedEvent(eventId: string, store: WebStorageLike): void`
  - `readScanMode(userId: string, eventId: string, rights: readonly ScanMode[], store: WebStorageLike): ScanMode | null`
  - `writeScanMode(userId: string, eventId: string, mode: ScanMode, store: WebStorageLike): void`
  - `forgetLegacyAppFunction(store: WebStorageLike): void` (entfernt den alten Schlüssel `appFunction`)

- [ ] **Step 1: Test schreiben**

`frontend/src/components/qrApp/appMemory.test.ts`:

```ts
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
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/components/qrApp/appMemory.test.ts`
Expected: FAIL, Modul `./appMemory` nicht gefunden.

- [ ] **Step 3: Implementierung**

`frontend/src/components/qrApp/appMemory.ts`:

```ts
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
const LEGACY_APP_FUNCTION_KEY = 'appFunction'

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
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run src/components/qrApp/appMemory.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/qrApp/appMemory.ts frontend/src/components/qrApp/appMemory.test.ts
git commit -m "Helfer-App: Gedächtnis für Veranstaltung und Modus"
```

---

### Task 3: Einstiegsweiche (`appEntry.ts`)

**Files:**
- Create: `frontend/src/components/qrApp/appEntry.ts`
- Test: `frontend/src/components/qrApp/appEntry.test.ts`

**Interfaces:**
- Consumes: `AppWorld`, `worldPath`, `WorldPath` aus Task 1; `EventOperationWindow`, `splitEventsByOperation` aus `./eventOperations.ts`.
- Produces:
  - `type EntryEvent = EventOperationWindow & {id: string}`
  - `type EntryTarget = '/app/start' | WorldPath`
  - `type EntryDecision = {kind: 'WAIT'} | {kind: 'FORBIDDEN'} | {kind: 'CHOOSE_EVENT'} | {kind: 'ADOPT_EVENT'; eventId: string} | {kind: 'GO'; to: EntryTarget}`
  - `resolveEntry(input: {worlds: AppWorld[]; eventId: string | null; events: EntryEvent[] | undefined; now: Date}): EntryDecision`

- [ ] **Step 1: Test schreiben**

`frontend/src/components/qrApp/appEntry.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {EntryEvent, resolveEntry} from './appEntry'

const now = new Date('2026-08-15T10:00:00')

/** Eine Regatta im Betrieb (heute mittendrin) und eine vom Vorjahr. */
const running: EntryEvent = {
    id: 'e-2026',
    operationsStartsAt: '2026-08-14T07:00:00',
    lastEventDay: '2026-08-16',
}
const lastYear: EntryEvent = {
    id: 'e-2025',
    operationsStartsAt: '2025-08-15T07:00:00',
    lastEventDay: '2025-08-17',
}
const alsoRunning: EntryEvent = {
    id: 'e-cup',
    operationsStartsAt: '2026-08-15T06:00:00',
    lastEventDay: '2026-08-15',
}

describe('resolveEntry', () => {
    it('weist ohne Welt ab, bevor es um die Veranstaltung geht', () => {
        expect(
            resolveEntry({worlds: [], eventId: 'e-2026', events: [running], now}),
        ).toEqual({kind: 'FORBIDDEN'})
    })

    it('wartet, solange nichts gemerkt ist und die Liste noch lädt', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: null, events: undefined, now})).toEqual({
            kind: 'WAIT',
        })
    })

    it('vertraut der gemerkten Veranstaltung, solange die Liste noch lädt (Offline-Start)', () => {
        expect(
            resolveEntry({worlds: ['SCAN'], eventId: 'e-2026', events: undefined, now}),
        ).toEqual({kind: 'GO', to: '/app/scan'})
    })

    it('übernimmt die einzige laufende Veranstaltung ohne Nachfrage', () => {
        expect(
            resolveEntry({worlds: ['SCAN'], eventId: null, events: [lastYear, running], now}),
        ).toEqual({kind: 'ADOPT_EVENT', eventId: 'e-2026'})
    })

    it('fragt, wenn keine oder mehrere Veranstaltungen laufen', () => {
        expect(resolveEntry({worlds: ['SCAN'], eventId: null, events: [lastYear], now})).toEqual({
            kind: 'CHOOSE_EVENT',
        })
        expect(
            resolveEntry({
                worlds: ['SCAN'],
                eventId: null,
                events: [running, alsoRunning],
                now,
            }),
        ).toEqual({kind: 'CHOOSE_EVENT'})
    })

    it('verwirft eine gemerkte Veranstaltung, die es nicht mehr gibt', () => {
        expect(
            resolveEntry({worlds: ['SCAN'], eventId: 'e-weg', events: [lastYear], now}),
        ).toEqual({kind: 'CHOOSE_EVENT'})
        expect(
            resolveEntry({worlds: ['SCAN'], eventId: 'e-weg', events: [running], now}),
        ).toEqual({kind: 'ADOPT_EVENT', eventId: 'e-2026'})
    })

    it('geht mit einer Welt direkt dorthin', () => {
        const events = [running]
        expect(resolveEntry({worlds: ['TIMING'], eventId: 'e-2026', events, now})).toEqual({
            kind: 'GO',
            to: '/app/timing',
        })
        expect(resolveEntry({worlds: ['DASHBOARD'], eventId: 'e-2026', events, now})).toEqual({
            kind: 'GO',
            to: '/app/dashboard',
        })
    })

    it('zeigt bei mehreren Welten die Kacheln', () => {
        expect(
            resolveEntry({worlds: ['SCAN', 'TIMING'], eventId: 'e-2026', events: [running], now}),
        ).toEqual({kind: 'GO', to: '/app/start'})
    })
})
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/components/qrApp/appEntry.test.ts`
Expected: FAIL, Modul `./appEntry` nicht gefunden.

- [ ] **Step 3: Implementierung**

`frontend/src/components/qrApp/appEntry.ts`:

```ts
/**
 * Die Weiche hinter `/app`: Wohin geht es nach der Anmeldung?
 *
 * Reihenfolge der Fragen: Darf die Person überhaupt etwas? Ist eine Veranstaltung klar? Gibt es
 * mehr als eine Welt? Jede Antwort, die sich aus Rechten und Bestand ergibt, wird ohne Nachfrage
 * getroffen — die Seite dahinter führt nur aus.
 *
 * Eine gemerkte Veranstaltung gilt, solange die Liste noch nicht geladen ist: Beim Kaltstart im
 * Funkloch wäre sonst die erste Ansicht eine Auswahl, die das Netz braucht.
 */
import {AppWorld, worldPath, WorldPath} from './appAccess.ts'
import {EventOperationWindow, splitEventsByOperation} from './eventOperations.ts'

export type EntryEvent = EventOperationWindow & {id: string}

export type EntryTarget = '/app/start' | WorldPath

export type EntryDecision =
    | {kind: 'WAIT'}
    | {kind: 'FORBIDDEN'}
    | {kind: 'CHOOSE_EVENT'}
    | {kind: 'ADOPT_EVENT'; eventId: string}
    | {kind: 'GO'; to: EntryTarget}

const goToWorlds = (worlds: AppWorld[]): EntryDecision =>
    worlds.length === 1 ? {kind: 'GO', to: worldPath[worlds[0]]} : {kind: 'GO', to: '/app/start'}

export const resolveEntry = (input: {
    worlds: AppWorld[]
    eventId: string | null
    events: EntryEvent[] | undefined
    now: Date
}): EntryDecision => {
    const {worlds, eventId, events, now} = input

    if (worlds.length === 0) return {kind: 'FORBIDDEN'}

    if (eventId !== null) {
        if (events === undefined) return goToWorlds(worlds)
        if (events.some(event => event.id === eventId)) return goToWorlds(worlds)
    }

    if (events === undefined) return {kind: 'WAIT'}

    const {operating} = splitEventsByOperation(events, now)
    if (operating.length === 1) return {kind: 'ADOPT_EVENT', eventId: operating[0].id}
    return {kind: 'CHOOSE_EVENT'}
}
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run src/components/qrApp/appEntry.test.ts`
Expected: PASS (8 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/qrApp/appEntry.ts frontend/src/components/qrApp/appEntry.test.ts
git commit -m "Helfer-App: Einstiegsweiche als reine Funktion"
```

---

### Task 4: Scan-Entscheidung (`scanDecision.ts`)

**Files:**
- Create: `frontend/src/components/qrApp/scanDecision.ts`
- Test: `frontend/src/components/qrApp/scanDecision.test.ts`

**Interfaces:**
- Consumes: `ScanMode` aus Task 1; `QrCodeAppuserResponse`, `QrCodeParticipantResponse` aus `@api/types.gen.ts`.
- Produces:
  - `type StaffQrCodeResponse = QrCodeParticipantResponse | QrCodeAppuserResponse` (zieht aus dem Context hierher um)
  - `type BandType = 'UNKNOWN' | 'PARTICIPANT' | 'USER'`
  - `bandTypeOf(response: StaffQrCodeResponse | null): BandType`
  - `type ScanDecision = {kind: 'ASSIGN'} | {kind: 'UNKNOWN_NOT_ALLOWED'} | {kind: 'CHOOSE'; options: ScanMode[]} | {kind: 'ACT'; mode: ScanMode; canRemove: boolean}`
  - `decideScan(input: {band: BandType; rights: ScanMode[]; mode: ScanMode | null}): ScanDecision`

- [ ] **Step 1: Test schreiben**

`frontend/src/components/qrApp/scanDecision.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {bandTypeOf, decideScan} from './scanDecision'

describe('bandTypeOf', () => {
    it('nennt eine leere Antwort unbekannt', () => {
        expect(bandTypeOf(null)).toBe('UNKNOWN')
    })

    it('unterscheidet Helfer- und Teilnehmerband am Typ', () => {
        const base = {firstname: 'A', lastname: 'B', qrCodeId: 'q', eventId: 'e'}
        expect(bandTypeOf({...base, type: 'User'})).toBe('USER')
        expect(bandTypeOf({...base, type: 'Participant'})).toBe('PARTICIPANT')
        // Ohne Typ ist es eine Teilnehmerantwort: nur die trägt Wettkämpfe.
        expect(bandTypeOf({...base, competitions: []})).toBe('PARTICIPANT')
    })
})

describe('decideScan – unbekanntes Band', () => {
    it('führt zur Zuweisung, wenn die Person Bänder verwalten darf, egal in welchem Modus', () => {
        expect(
            decideScan({band: 'UNKNOWN', rights: ['APP_QR_MANAGEMENT'], mode: null}),
        ).toEqual({kind: 'ASSIGN'})
        expect(
            decideScan({
                band: 'UNKNOWN',
                rights: ['APP_QR_MANAGEMENT', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_EVENT_REQUIREMENT',
            }),
        ).toEqual({kind: 'ASSIGN'})
    })

    it('ist sonst ein Fehler', () => {
        expect(
            decideScan({band: 'UNKNOWN', rights: ['APP_EVENT_REQUIREMENT'], mode: null}),
        ).toEqual({kind: 'UNKNOWN_NOT_ALLOWED'})
    })
})

describe('decideScan – bekanntes Band', () => {
    it('handelt mit genau einem Recht sofort', () => {
        expect(
            decideScan({band: 'PARTICIPANT', rights: ['APP_COMPETITION_CHECK'], mode: null}),
        ).toEqual({kind: 'ACT', mode: 'APP_COMPETITION_CHECK', canRemove: false})
        expect(decideScan({band: 'USER', rights: ['APP_QR_MANAGEMENT'], mode: null})).toEqual({
            kind: 'ACT',
            mode: 'APP_QR_MANAGEMENT',
            canRemove: true,
        })
    })

    it('fragt bei mehreren Rechten ohne Modus', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT'],
                mode: null,
            }),
        ).toEqual({kind: 'CHOOSE', options: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT']})
    })

    it('folgt dem gemerkten Modus und bietet das Entfernen als Nebenweg an', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_QR_MANAGEMENT', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_EVENT_REQUIREMENT',
            }),
        ).toEqual({kind: 'ACT', mode: 'APP_EVENT_REQUIREMENT', canRemove: true})
    })

    it('ignoriert einen Modus, den die Rechte nicht mehr decken', () => {
        expect(
            decideScan({
                band: 'PARTICIPANT',
                rights: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT'],
                mode: 'APP_CATERER',
            }),
        ).toEqual({kind: 'CHOOSE', options: ['APP_COMPETITION_CHECK', 'APP_EVENT_REQUIREMENT']})
        expect(
            decideScan({band: 'USER', rights: ['APP_CATERER'], mode: 'APP_QR_MANAGEMENT'}),
        ).toEqual({kind: 'ACT', mode: 'APP_CATERER', canRemove: false})
    })

    it('ist ohne Recht unbekannt-nicht-erlaubt gleichwertig: keine Rechte, keine Handlung', () => {
        expect(decideScan({band: 'PARTICIPANT', rights: [], mode: null})).toEqual({
            kind: 'CHOOSE',
            options: [],
        })
    })
})
```

- [ ] **Step 2: Test laufen lassen, er muss scheitern**

Run: `npx vitest run src/components/qrApp/scanDecision.test.ts`
Expected: FAIL, Modul `./scanDecision` nicht gefunden.

- [ ] **Step 3: Implementierung**

`frontend/src/components/qrApp/scanDecision.ts`:

```ts
/**
 * Was nach einem Scan passiert — aus Band, Rechten und gemerktem Modus.
 *
 * Ein unbekanntes Band hat nur eine sinnvolle Handlung (zuweisen), deshalb zählt dafür der
 * Modus nicht: Wer Bänder verwalten darf, weist zu, auch wenn er gerade an der Waage steht. Bei
 * bekannten Bändern entscheidet der Modus; fehlt er und gibt es mehr als ein Recht, wird
 * gefragt.
 */
import {QrCodeAppuserResponse, QrCodeParticipantResponse} from '@api/types.gen.ts'
import {ScanMode} from './appAccess.ts'

/**
 * Der Scanner der Helfer-App läuft immer angemeldet; die anonyme Antwortform des Endpunkts
 * kommt hier nicht vor.
 */
export type StaffQrCodeResponse = QrCodeParticipantResponse | QrCodeAppuserResponse

export type BandType = 'UNKNOWN' | 'PARTICIPANT' | 'USER'

export const bandTypeOf = (response: StaffQrCodeResponse | null): BandType => {
    if (response === null) return 'UNKNOWN'
    return response.type === 'User' ? 'USER' : 'PARTICIPANT'
}

export type ScanDecision =
    | {kind: 'ASSIGN'}
    | {kind: 'UNKNOWN_NOT_ALLOWED'}
    | {kind: 'CHOOSE'; options: ScanMode[]}
    | {kind: 'ACT'; mode: ScanMode; canRemove: boolean}

export const decideScan = (input: {
    band: BandType
    rights: ScanMode[]
    mode: ScanMode | null
}): ScanDecision => {
    const {band, rights, mode} = input
    const canRemove = rights.includes('APP_QR_MANAGEMENT')

    if (band === 'UNKNOWN') {
        return canRemove ? {kind: 'ASSIGN'} : {kind: 'UNKNOWN_NOT_ALLOWED'}
    }

    const effective =
        mode !== null && rights.includes(mode) ? mode : rights.length === 1 ? rights[0] : null

    if (effective === null) return {kind: 'CHOOSE', options: rights}
    return {kind: 'ACT', mode: effective, canRemove}
}
```

- [ ] **Step 4: Test laufen lassen, er muss bestehen**

Run: `npx vitest run src/components/qrApp/scanDecision.test.ts`
Expected: PASS (9 Tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/qrApp/scanDecision.ts frontend/src/components/qrApp/scanDecision.test.ts
git commit -m "Helfer-App: Scan-Entscheidung als reine Funktion"
```

---

### Task 5: Ergebnis-Bausteine ohne Context

Die drei heutigen Ergebnisseiten (`QrParticipantPage`, `QrAppuserPage`, `QrAssignPage`) werden zu Bausteinen, die alles über Eigenschaften bekommen. Die alten Seiten bleiben in dieser Aufgabe bestehen und werden nur an die neue Signatur von `TeamCheckInOut` angepasst, damit der Build grün bleibt. Sie fallen in Task 6.

**Files:**
- Create: `frontend/src/components/qrApp/result/BandInfo.tsx` (aus `QrAssignmentInfo.tsx`)
- Create: `frontend/src/components/qrApp/result/RemoveBandButton.tsx`
- Create: `frontend/src/components/qrApp/result/ParticipantRequirements.tsx` (Bedingungs-Logik aus `QrParticipantPage.tsx`, Zeilen 34-200)
- Create: `frontend/src/components/qrApp/result/ParticipantActions.tsx`
- Create: `frontend/src/components/qrApp/result/UserActions.tsx`
- Create: `frontend/src/components/qrApp/result/AssignBand.tsx` (aus `QrAssignPage.tsx`)
- Create: `frontend/src/components/qrApp/result/ChooseMode.tsx`
- Create: `frontend/src/components/qrApp/result/ScanErrorCard.tsx`
- Modify: `frontend/src/components/qrApp/TeamCheckInOut.tsx` (Eigenschaften statt Context)
- Modify: `frontend/src/components/qrApp/QrNimiqScanner.tsx` (Entprellung lokal, Zeilen 11, 32, 89-91, 137)
- Modify: `frontend/src/pages/app/QrParticipantPage.tsx` (nur der Aufruf von `TeamCheckInOut`, Zeile 262)
- Modify: `frontend/src/i18n/de/translations.json`, `en`, `da` (neue Schlüssel unter `app.result`, `app.mode`)

**Interfaces:**
- Consumes: `ScanMode`, `SCAN_MODES` (Task 1); `StaffQrCodeResponse` (Task 4); bestehende Bausteine `RequirementsChecklist`, `CatererTransaction`, `QrDeleteDialog`, `ParticipantAssignment`, `UserAssignment`, `SystemUserScanner`, `LoadingButton`, `Throbber`; SDK-Funktionen `deleteQrCode`, `createCateringTransaction`, `checkInOutParticipant`, `getTeamsByParticipantQrCode`, `getParticipantRequirementsForParticipant`, `getParticipantsForEventInApp`, `getParticipantScanScope`, `approveParticipantRequirementForParticipant`, `updateQrCodeAppuser`, `updateQrCodeParticipant`.
- Produces:
  - `BandInfo({response: StaffQrCodeResponse; showCompetitions: boolean})`
  - `RemoveBandButton({qrCodeId: string; bandType: 'participant' | 'appuser'; emphasis: 'primary' | 'secondary'; onRemoved: () => void})`
  - `ParticipantRequirements({eventId: string; participantId: string})`
  - `TeamCheckInOut({eventId: string; qrCodeId: string; participantId: string; onDone: () => void})`
  - `ParticipantActions({eventId: string; qrCodeId: string; response: QrCodeParticipantResponse; mode: ScanMode; canRemove: boolean; onDone: () => void})`
  - `UserActions({eventId: string; qrCodeId: string; response: QrCodeAppuserResponse; mode: ScanMode; canRemove: boolean; onDone: () => void})`
  - `AssignBand({eventId: string; qrCodeId: string; onDone: () => void})`
  - `ChooseMode({options: ScanMode[]; onChoose: (mode: ScanMode) => void})`
  - `ScanErrorCard({title: string; message: string; onRescan: () => void})`
  - i18n-Schlüssel: `app.mode.APP_QR_MANAGEMENT`, `app.mode.APP_COMPETITION_CHECK`, `app.mode.APP_EVENT_REQUIREMENT`, `app.mode.APP_CATERER`, `app.result.rescan`, `app.result.removeBand`, `app.result.helperBandNothingToDo`, `app.result.choose.title`, `app.result.choose.hint`

- [ ] **Step 1: i18n-Schlüssel anlegen (alle drei Sprachen)**

In `de/translations.json` unter `"app"` ergänzen (bestehende Einträge bleiben):

```json
"mode": {
  "APP_QR_MANAGEMENT": "Bänder verwalten",
  "APP_COMPETITION_CHECK": "Boote an- und abmelden",
  "APP_EVENT_REQUIREMENT": "Bedingungen prüfen",
  "APP_CATERER": "Verpflegung"
},
"result": {
  "rescan": "Nochmal scannen",
  "removeBand": "Band entfernen",
  "helperBandNothingToDo": "Helferband – hier gibt es nichts zu tun.",
  "choose": {
    "title": "Was möchtest du mit diesem Band tun?",
    "hint": "Deine Wahl gilt für die nächsten Scans an diesem Gerät. Ändern kannst du sie über das Zahnrad."
  }
}
```

`en`:

```json
"mode": {
  "APP_QR_MANAGEMENT": "Manage wristbands",
  "APP_COMPETITION_CHECK": "Check boats in and out",
  "APP_EVENT_REQUIREMENT": "Check requirements",
  "APP_CATERER": "Catering"
},
"result": {
  "rescan": "Scan again",
  "removeBand": "Remove wristband",
  "helperBandNothingToDo": "Helper wristband – nothing to do here.",
  "choose": {
    "title": "What do you want to do with this wristband?",
    "hint": "Your choice applies to the next scans on this device. Change it via the gear icon."
  }
}
```

`da`:

```json
"mode": {
  "APP_QR_MANAGEMENT": "Administrer armbånd",
  "APP_COMPETITION_CHECK": "Tjek både ind og ud",
  "APP_EVENT_REQUIREMENT": "Tjek krav",
  "APP_CATERER": "Forplejning"
},
"result": {
  "rescan": "Scan igen",
  "removeBand": "Fjern armbånd",
  "helperBandNothingToDo": "Hjælperarmbånd – intet at gøre her.",
  "choose": {
    "title": "Hvad vil du gøre med dette armbånd?",
    "hint": "Dit valg gælder for de næste scanninger på denne enhed. Skift det via tandhjulet."
  }
}
```

- [ ] **Step 2: `BandInfo` aus `QrAssignmentInfo` ableiten**

`frontend/src/components/qrApp/result/BandInfo.tsx` — Inhalt von `QrAssignmentInfo.tsx`, aber ohne `useAppSession`: Statt `appFunction !== updateAppCompetitionCheckGlobal.resource` entscheidet die Eigenschaft `showCompetitions`.

```tsx
import {Paper, Stack, Typography} from '@mui/material'
import {Business, EmojiEvents, Person} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {StaffQrCodeResponse} from '@components/qrApp/scanDecision.ts'

type Props = {
    response: StaffQrCodeResponse
    /** Beim Check-in stehen die Boote ohnehin darunter — dann wäre die Liste hier doppelt. */
    showCompetitions: boolean
}

export const BandInfo = ({response, showCompetitions}: Props) => {
    const {t} = useTranslation()
    const competitions =
        response.type !== 'User' && 'competitions' in response ? (response.competitions ?? []) : []

    return (
        <Paper elevation={2} sx={{p: 2, width: '100%'}}>
            <Stack spacing={1.5}>
                <Typography variant="h6" color="primary">
                    {response.type === 'User'
                        ? t('qrAppuser.assignmentInfo')
                        : t('qrParticipant.assignmentInfo')}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Person color="action" />
                    <Typography sx={{overflowWrap: 'anywhere'}}>
                        <strong>{t('common.name')}:</strong> {response.firstname} {response.lastname}
                    </Typography>
                </Stack>
                {response.clubName && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Business color="action" />
                        <Typography sx={{overflowWrap: 'anywhere'}}>
                            <strong>{t('club.club')}:</strong> {response.clubName}
                        </Typography>
                    </Stack>
                )}
                {showCompetitions && competitions.length > 0 && (
                    <Stack spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <EmojiEvents color="action" />
                            <Typography>
                                <strong>{t('event.competition.competitions')}:</strong>
                            </Typography>
                        </Stack>
                        <Stack sx={{pl: 4}}>
                            {competitions.map((comp, index) => (
                                <Typography key={index} variant="body2">
                                    • {comp}
                                </Typography>
                            ))}
                        </Stack>
                    </Stack>
                )}
            </Stack>
        </Paper>
    )
}
```

- [ ] **Step 3: `RemoveBandButton`**

`frontend/src/components/qrApp/result/RemoveBandButton.tsx` — bündelt Knopf, Bestätigung (`QrDeleteDialog`) und Löschaufruf, die heute in zwei Seiten doppelt stehen:

```tsx
import {Button} from '@mui/material'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {deleteQrCode} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {QrDeleteDialog} from '@components/qrApp/QrDeleteDialog'

type Props = {
    qrCodeId: string
    bandType: 'participant' | 'appuser'
    /** Primär in der Bandverwaltung; als Nebenweg (Textknopf) in jedem anderen Modus. */
    emphasis: 'primary' | 'secondary'
    onRemoved: () => void
}

export const RemoveBandButton = ({qrCodeId, bandType, emphasis, onRemoved}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [open, setOpen] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const handleDelete = async () => {
        setSubmitting(true)
        const {error} = await deleteQrCode({path: {qrCodeId}})
        setSubmitting(false)
        setOpen(false)
        if (error) {
            feedback.error(
                t(bandType === 'participant' ? 'qrParticipant.deleteError' : 'qrAppuser.deleteError'),
            )
            return
        }
        feedback.success(t('qrAssign.deleteSuccess'))
        onRemoved()
    }

    return (
        <>
            <Button
                color="error"
                variant={emphasis === 'primary' ? 'contained' : 'text'}
                size={emphasis === 'primary' ? 'large' : 'medium'}
                fullWidth
                onClick={() => setOpen(true)}>
                {t('app.result.removeBand')}
            </Button>
            <QrDeleteDialog
                open={open}
                onClose={() => setOpen(false)}
                onDelete={() => void handleDelete()}
                loading={submitting}
                type={bandType}
            />
        </>
    )
}
```

- [ ] **Step 4: `TeamCheckInOut` auf Eigenschaften umstellen**

In `frontend/src/components/qrApp/TeamCheckInOut.tsx`:
- Import `useAppSession` entfernen.
- Signatur: `export const TeamCheckInOut = ({eventId, qrCodeId, participantId, onDone}: {eventId: string; qrCodeId: string; participantId: string; onDone: () => void}) => {`
- Die Zeile `const {navigateTo, qr, eventId} = useAppSession()` entfernen.
- Im `useFetch`: `qrCode: qr.qrCodeId!` → `qrCode: qrCodeId`; `preCondition` entfernen; `deps: [eventId, qrCodeId]`.
- `participant.participantId === qr.response?.id` → `participant.participantId === participantId`.
- `navigateTo('APP_Scanner')` am Ende von `handleCheckInOut` → `onDone()`.
- Die untere Leiste bekommt Safe-Area: `bgcolor` bleibt, `sx` um `pb: 'calc(8px + env(safe-area-inset-bottom))'` ergänzen (statt `py: 1`: `pt: 1`).

In `frontend/src/pages/app/QrParticipantPage.tsx` Zeile 262 den Aufruf anpassen:

```tsx
{canCheck && qr.qrCodeId && qr.response?.id && (
    <TeamCheckInOut
        eventId={eventId}
        qrCodeId={qr.qrCodeId}
        participantId={qr.response.id}
        onDone={() => navigateTo('APP_Scanner')}
    />
)}
```

- [ ] **Step 5: `ParticipantRequirements` aus `QrParticipantPage` herauslösen**

`frontend/src/components/qrApp/result/ParticipantRequirements.tsx` — der komplette Bedingungs-Block der Seite (Konstante `COMPETITION_STORAGE_KEY`, die beiden `useFetch`, `handleRequirementChange`, `selectCompetition`, Zustände `checkedRequirements`, `participantRoles`, `participantRequirementsPending`, `submitting`, `competitions`, `todayEventDayId`, `competitionId`) mit `eventId` und `participantId` als Eigenschaften statt `qr.response?.id`. Die `preCondition` der beiden `useFetch` entfällt (die Komponente wird nur gerendert, wenn sie gilt), `deps: [eventId, participantId]`. Gerendert wird nur `<RequirementsChecklist … />` mit denselben Eigenschaften wie heute. Die Kommentare der Seite (Warum der Wettkampf gemerkt wird, warum der additive Endpunkt) wandern mit.

```tsx
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {
    approveParticipantRequirementForParticipant,
    getParticipantRequirementsForParticipant,
    getParticipantScanScope,
    getParticipantsForEventInApp,
} from '@api/sdk.gen.ts'
import {CheckedParticipantRequirement, ParticipantScanCompetitionDto} from '@api/types.gen.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {RequirementsChecklist} from '@components/qrApp/RequirementsChecklist'
import {competitionLabel, preselectCompetition} from '@components/qrApp/requirementScope.ts'

/**
 * Der zuletzt an dieser Station gewählte Wettkampf. Er überlebt den einzelnen Scan bewusst:
 * an der Waage kommt ein Block derselben Mannschaften nacheinander, und wer für jede Person
 * neu auswählen müsste, wählt irgendwann falsch. Übernommen wird er nur, wenn die neue Person
 * dort auch gemeldet ist - siehe `preselectCompetition`.
 */
const COMPETITION_STORAGE_KEY = 'appRequirementCompetition'

type Props = {
    eventId: string
    participantId: string
}

export const ParticipantRequirements = ({eventId, participantId}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [checkedRequirements, setCheckedRequirements] = useState<CheckedParticipantRequirement[]>([])
    const [participantRoles, setParticipantRoles] = useState<string[]>([])
    const [pending, setPending] = useState(false)
    const [competitions, setCompetitions] = useState<ParticipantScanCompetitionDto[]>([])
    const [todayEventDayId, setTodayEventDayId] = useState<string | null>(null)
    const [competitionId, setCompetitionId] = useState<string | null>(null)

    const selectCompetition = (id: string | null) => {
        setCompetitionId(id)
        if (id !== null) {
            localStorage.setItem(COMPETITION_STORAGE_KEY, id)
        }
    }

    const loadChecked = async () => {
        const {data} = await getParticipantsForEventInApp({path: {eventId}})
        if (!data) {
            feedback.error(t('common.load.error.multiple.short', {entity: t('event.participants')}))
            return
        }
        const participant = data.data.find(p => p.id === participantId)
        setCheckedRequirements(
            Array.isArray(participant?.participantRequirementsChecked)
                ? participant.participantRequirementsChecked
                : [],
        )
        setParticipantRoles(participant?.namedParticipantIds ?? [])
    }

    const {data: requirements} = useFetch(
        signal => {
            setPending(true)
            return getParticipantRequirementsForParticipant({
                signal,
                path: {eventId, participantId},
                query: {onlyForApp: true},
            })
        },
        {
            onResponse: async ({error}) => {
                if (error) {
                    feedback.error(
                        t('common.load.error.multiple.short', {
                            entity: t('participantRequirement.participantRequirements'),
                        }),
                    )
                } else {
                    await loadChecked()
                }
                setPending(false)
            },
            deps: [eventId, participantId],
        },
    )

    // Getrennt vom Bedingungs-Aufruf: dieser hier liefert den Rahmen (heutiger Wettkampftag,
    // Wettkämpfe dieser Person), der nur für wettkampf- und tagesbezogene Bedingungen zählt.
    useFetch(signal => getParticipantScanScope({signal, path: {eventId, participantId}}), {
        onResponse: ({data, error}) => {
            if (error || !data) {
                feedback.error(
                    t('common.load.error.multiple.short', {
                        entity: t('event.competition.competitions'),
                    }),
                )
                setCompetitions([])
                setTodayEventDayId(null)
                setCompetitionId(null)
                return
            }
            setTodayEventDayId(data.todayEventDayId ?? null)
            setCompetitions(data.competitions)
            // Bewusst nicht über selectCompetition: eine Vorbelegung ist keine Wahl und
            // darf den gemerkten Wettkampf der Station nicht überschreiben.
            setCompetitionId(
                preselectCompetition(localStorage.getItem(COMPETITION_STORAGE_KEY), data.competitions),
            )
        },
        deps: [eventId, participantId],
    })

    const handleRequirementChange = async (
        requirementId: string,
        checked: boolean | string,
        namedParticipantId?: string,
    ) => {
        setPending(true)
        // Der Wettkampf gehört nur an eine Bedingung, die je Wettkampf gilt. Bei allen anderen
        // bliebe er sonst als Einschränkung in der Zeile stehen, die niemand gewollt hat.
        const requirement = (requirements ?? []).find(r => r.id === requirementId)
        const {error} = await approveParticipantRequirementForParticipant({
            path: {eventId},
            // Bewusst der additive Einzel-Endpunkt: der Ersetzen-Endpunkt (approve) erwartet den
            // kompletten Zustand und würde alle nicht mitgeschickten Bestätigungen löschen.
            body: {
                requirementId,
                participantId,
                approved: checked !== false,
                note: typeof checked === 'string' ? checked : undefined,
                namedParticipantId,
                competitionId: requirement?.perCompetition ? (competitionId ?? undefined) : undefined,
            },
        })
        if (error) {
            feedback.error(t('qrParticipant.status.error'))
            setPending(false)
            return
        }
        const chosenCompetition = competitions.find(c => c.id === competitionId)
        const scopeSuffix =
            requirement?.perCompetition && chosenCompetition
                ? competitionLabel(chosenCompetition)
                : undefined
        feedback.success(
            checked === false
                ? t('qrParticipant.status.revoked', {name: requirement?.name ?? ''})
                : t('qrParticipant.status.approved', {
                      name: requirement?.name ?? '',
                      scope: scopeSuffix ? ` — ${scopeSuffix}` : '',
                  }),
        )
        await loadChecked()
        setPending(false)
    }

    return (
        <RequirementsChecklist
            requirements={requirements ?? []}
            checkedRequirements={checkedRequirements}
            pending={pending}
            onRequirementChange={handleRequirementChange}
            namedParticipantIds={participantRoles}
            competitions={competitions}
            competitionId={competitionId}
            onCompetitionChange={selectCompetition}
            todayEventDayId={todayEventDayId}
        />
    )
}
```

Prüfe beim Übertragen gegen die heutige Seite, ob `RequirementsChecklist` noch weitere Eigenschaften erwartet (Zeilen 26-42 der Komponente) und übernimm sie eins zu eins.

- [ ] **Step 6: `ParticipantActions` und `UserActions`**

`frontend/src/components/qrApp/result/ParticipantActions.tsx`:

```tsx
import {Alert, Stack} from '@mui/material'
import {Cancel} from '@mui/icons-material'
import {useTranslation} from 'react-i18next'
import {QrCodeParticipantResponse} from '@api/types.gen.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'
import {TeamCheckInOut} from '@components/qrApp/TeamCheckInOut'
import {BandInfo} from './BandInfo'
import {ParticipantRequirements} from './ParticipantRequirements'
import {RemoveBandButton} from './RemoveBandButton'

type Props = {
    eventId: string
    qrCodeId: string
    response: QrCodeParticipantResponse
    mode: ScanMode
    canRemove: boolean
    onDone: () => void
}

/** Die Ansicht eines Teilnehmerbands je Modus — siehe Tabelle in Abschnitt 8.2 der Spezifikation. */
export const ParticipantActions = ({eventId, qrCodeId, response, mode, canRemove, onDone}: Props) => {
    const {t} = useTranslation()
    const participantId = response.id

    if (mode === 'APP_CATERER') {
        return (
            <Stack spacing={2} sx={{width: 1}}>
                <Alert severity="error" icon={<Cancel />} sx={{p: 2}}>
                    {t('club.participant.cateringNotAllowed')}
                </Alert>
                {canRemove && (
                    <RemoveBandButton
                        qrCodeId={qrCodeId}
                        bandType="participant"
                        emphasis="secondary"
                        onRemoved={onDone}
                    />
                )}
            </Stack>
        )
    }

    return (
        <Stack spacing={2} sx={{width: 1, flex: 1}}>
            <BandInfo response={response} showCompetitions={mode !== 'APP_COMPETITION_CHECK'} />
            {mode === 'APP_COMPETITION_CHECK' && participantId && (
                <TeamCheckInOut
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    participantId={participantId}
                    onDone={onDone}
                />
            )}
            {mode === 'APP_EVENT_REQUIREMENT' && participantId && (
                <ParticipantRequirements eventId={eventId} participantId={participantId} />
            )}
            {canRemove && (
                <RemoveBandButton
                    qrCodeId={qrCodeId}
                    bandType="participant"
                    emphasis={mode === 'APP_QR_MANAGEMENT' ? 'primary' : 'secondary'}
                    onRemoved={onDone}
                />
            )}
        </Stack>
    )
}
```

`frontend/src/components/qrApp/result/UserActions.tsx`:

```tsx
import {Alert, Stack} from '@mui/material'
import {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {QrCodeAppuserResponse} from '@api/types.gen.ts'
import {createCateringTransaction} from '@api/sdk.gen.ts'
import {useFeedback} from '@utils/hooks.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'
import {CatererTransaction} from '@components/qrApp/CatererTransaction'
import {BandInfo} from './BandInfo'
import {RemoveBandButton} from './RemoveBandButton'

type Props = {
    eventId: string
    qrCodeId: string
    response: QrCodeAppuserResponse
    mode: ScanMode
    canRemove: boolean
    onDone: () => void
}

/** Die Ansicht eines Helferbands je Modus — siehe Tabelle in Abschnitt 8.2 der Spezifikation. */
export const UserActions = ({eventId, qrCodeId, response, mode, canRemove, onDone}: Props) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const [submitting, setSubmitting] = useState(false)

    const handleCateringTransaction = async (price: string) => {
        if (!response.id) return
        setSubmitting(true)
        const {error} = await createCateringTransaction({
            body: {appUserId: response.id, eventId, price: price === '' ? '0' : price},
        })
        setSubmitting(false)
        if (error) {
            feedback.error(t('caterer.transactionError'))
            return
        }
        feedback.success(t('caterer.transactionSuccess'))
        onDone()
    }

    return (
        <Stack spacing={2} sx={{width: 1}}>
            <BandInfo response={response} showCompetitions={false} />
            {mode === 'APP_CATERER' && (
                <CatererTransaction
                    onConfirm={price => void handleCateringTransaction(price)}
                    submitting={submitting}
                />
            )}
            {(mode === 'APP_COMPETITION_CHECK' || mode === 'APP_EVENT_REQUIREMENT') && (
                <Alert severity="info">{t('app.result.helperBandNothingToDo')}</Alert>
            )}
            {canRemove && (
                <RemoveBandButton
                    qrCodeId={qrCodeId}
                    bandType="appuser"
                    emphasis={mode === 'APP_QR_MANAGEMENT' ? 'primary' : 'secondary'}
                    onRemoved={onDone}
                />
            )}
        </Stack>
    )
}
```

- [ ] **Step 7: `AssignBand` aus `QrAssignPage` ableiten**

`frontend/src/components/qrApp/result/AssignBand.tsx`: Inhalt von `QrAssignPage.tsx` mit diesen Änderungen:
- Eigenschaften `{eventId, qrCodeId, onDone}` statt `useAppSession`.
- Der `useEffect` mit `if (!qr.received) navigateTo('APP_Scanner')` entfällt.
- `qr.qrCodeId!` → `qrCodeId`; jedes `navigateTo('APP_Scanner')` → `onDone()`.
- `canAssign` und der zugehörige Warn-`Alert` entfallen (die Entscheidung trifft `decideScan`).
- Kein `AppTopTitle`, kein Titel, keine `qrCodeId`-Zeile mehr: Der Rahmen (Kopfzeile) kommt von der Seite. Äußerer Container ist ein `Stack spacing={2} sx={{width: 1}}`.
- Der Bestätigungsdialog und `showAssignError` bleiben wie heute.

- [ ] **Step 8: `ChooseMode` und `ScanErrorCard`**

`frontend/src/components/qrApp/result/ChooseMode.tsx`:

```tsx
import {Button, Stack, Typography} from '@mui/material'
import {useTranslation} from 'react-i18next'
import {ScanMode} from '@components/qrApp/appAccess.ts'

type Props = {
    options: ScanMode[]
    onChoose: (mode: ScanMode) => void
}

/** Die Nachfrage beim ersten Scan mit mehreren Rechten; die Antwort wird zum Stationsmodus. */
export const ChooseMode = ({options, onChoose}: Props) => {
    const {t} = useTranslation()
    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Typography variant="h6" textAlign="center">
                {t('app.result.choose.title')}
            </Typography>
            {options.map(mode => (
                <Button
                    key={mode}
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{py: 2}}
                    onClick={() => onChoose(mode)}>
                    {t(`app.mode.${mode}`)}
                </Button>
            ))}
            <Typography variant="body2" color="text.secondary" textAlign="center">
                {t('app.result.choose.hint')}
            </Typography>
        </Stack>
    )
}
```

`frontend/src/components/qrApp/result/ScanErrorCard.tsx`:

```tsx
import {Alert, AlertTitle, Button, Stack} from '@mui/material'
import {useTranslation} from 'react-i18next'

type Props = {
    title: string
    message: string
    onRescan: () => void
}

export const ScanErrorCard = ({title, message, onRescan}: Props) => {
    const {t} = useTranslation()
    return (
        <Stack spacing={2} sx={{width: 1}}>
            <Alert severity="error" sx={{p: 2}}>
                <AlertTitle>{title}</AlertTitle>
                {message}
            </Alert>
            <Button variant="contained" size="large" fullWidth onClick={onRescan}>
                {t('app.result.rescan')}
            </Button>
        </Stack>
    )
}
```

- [ ] **Step 9: `QrNimiqScanner` vom Context lösen**

In `frontend/src/components/qrApp/QrNimiqScanner.tsx`: Import `useAppSession` und die Zeile `const {qrLastScanned} = useAppSession()` entfernen; stattdessen `const qrLastScanned = useRef<number>(0)` (die Entprellung gehört dem Scanner, nicht der Sitzung). `qrLastScanned` aus der Abhängigkeitsliste des Effekts streichen. Die Vorschau bekommt eine Obergrenze, damit auf dem Tablet im Querformat der Knopf darunter sichtbar bleibt: der `div` um das Video `style={{width: '100%', maxWidth: 'min(100%, 70vh)'}}` und darum `alignItems: 'center'` (ist schon gesetzt).

- [ ] **Step 10: Bauen, testen, linten**

Run: `npm test && npm run build && npm run lint`
Expected: alles grün. Die alten Seiten kompilieren weiter (nur `TeamCheckInOut`-Aufruf geändert).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/qrApp frontend/src/pages/app/QrParticipantPage.tsx frontend/src/i18n
git commit -m "Helfer-App: Ergebnis-Bausteine bekommen ihre Eingaben als Eigenschaften"
```

---

### Task 6: Kern-Umstellung — Context, Kopfzeile, Adressen, neue Seiten

Hier fällt der alte Ablauf. Der Context wird zum Gedächtnis, die Seiten werden neu geschrieben, die Adressen umgestellt. Alles in einer Aufgabe, weil erst am Ende wieder ein grüner Build möglich ist.

**Files:**
- Rewrite: `frontend/src/contexts/app/AppSessionContext.tsx`
- Create: `frontend/src/components/qrApp/AppHeader.tsx`
- Create: `frontend/src/components/qrApp/AppColumn.tsx`
- Modify: `frontend/src/layouts/AppLayout.tsx`
- Create: `frontend/src/pages/app/AppEntryPage.tsx`
- Create: `frontend/src/pages/app/EventChoicePage.tsx` (aus `QrEventsPage.tsx`)
- Create: `frontend/src/pages/app/WorldsPage.tsx` (aus `AppFunctionSelectPage.tsx`)
- Create: `frontend/src/pages/app/ScanPage.tsx` (aus `QrScannerPage.tsx`)
- Create: `frontend/src/pages/app/ScanResultPage.tsx`
- Create: `frontend/src/pages/app/SettingsPage.tsx`
- Modify: `frontend/src/pages/app/ForbiddenPage.tsx`
- Modify: `frontend/src/pages/app/AppDashboardPage.tsx`
- Modify: `frontend/src/pages/app/TimingStationSelectPage.tsx`
- Modify: `frontend/src/routes.tsx` (Block `appRoute` … `appDashboardRoute`, Zeilen 601-733, und die Kinderliste Zeilen 909-927)
- Delete: `frontend/src/pages/app/QrEventsPage.tsx`, `AppFunctionSelectPage.tsx`, `QrScannerPage.tsx`, `QrParticipantPage.tsx`, `QrAppuserPage.tsx`, `QrAssignPage.tsx`, `TimingEventsPage.tsx`; `frontend/src/components/qrApp/AppTopTitle.tsx`, `QrAssignmentInfo.tsx`, `common.ts`, `appEntries.test.ts`
- Modify: `frontend/src/i18n/de/translations.json`, `en`, `da`

**Interfaces:**
- Consumes: alles aus Task 1-5.
- Produces:
  - `useAppSession(): {eventId: string | null; event: EventDto | undefined; events: EventDto[] | undefined; setEventId: (id: string) => void; scanRights: ScanMode[]; worlds: AppWorld[]; scanMode: ScanMode | null; setScanMode: (mode: ScanMode) => void}`
  - `AppHeader({title, subtitle?, onBack?, settings?, children?})`
  - `AppColumn({children, maxWidth?})`
  - Routen (exportiert aus `routes.tsx`): `appRoute`, `appIndexRoute`, `appLoginRoute`, `appForbiddenRoute`, `appEventChoiceRoute`, `appStartRoute`, `appScanRoute`, `appScanResultRoute`, `appSettingsRoute`, `appDashboardRoute`, `appTimingRoute`, `appTimingIndexRoute`, `appTimingLeitstandRoute`, `appTimingStationRoute`, `appCatchAllRoute`
  - i18n: `app.header.settings`, `app.world.SCAN`, `app.world.TIMING`, `app.world.DASHBOARD`, `app.start.title`, `app.scan.title`, `app.scan.modeChip`, `app.scan.modeUnset`, `app.result.band.PARTICIPANT`, `app.result.band.USER`, `app.result.band.UNKNOWN`, `app.result.loadError`, `app.result.otherEvent.title`, `app.result.otherEvent.message`, `app.result.unknown.title`, `app.result.unknown.message`, `app.settings.title`, `app.settings.event.title`, `app.settings.event.switch`, `app.settings.mode.title`, `app.settings.mode.hint`, `app.settings.language.title`, `app.settings.account.title`, `app.event.title`, `app.event.noDays` (übernimmt `qrEvents.noDays`)

- [ ] **Step 1: i18n-Schlüssel (alle drei Sprachen)**

`de`, unter `"app"` ergänzen:

```json
"header": {"settings": "Einstellungen"},
"world": {"SCAN": "Scannen", "TIMING": "Zeitnahme", "DASHBOARD": "Schiedsrichter-Dashboard"},
"start": {"title": "Was möchtest du tun?"},
"scan": {
  "title": "Scannen",
  "modeChip": "Modus: {{mode}}",
  "modeUnset": "Modus: wird beim ersten Scan gefragt"
},
"event": {"title": "Veranstaltung wählen"},
"settings": {
  "title": "Einstellungen",
  "event": {"title": "Veranstaltung", "switch": "Veranstaltung wechseln"},
  "mode": {"title": "Modus", "hint": "Gilt für alle Scans an diesem Gerät."},
  "language": {"title": "Sprache"},
  "account": {"title": "Konto"}
}
```

und `"result"` (aus Task 5) erweitern um:

```json
"band": {"PARTICIPANT": "Teilnehmer:in", "USER": "Helfer:in", "UNKNOWN": "Unbekanntes Band"},
"loadError": "Das Band konnte nicht geladen werden.",
"otherEvent": {
  "title": "Falsche Veranstaltung",
  "message": "Dieses Band gehört zu einer anderen Veranstaltung{{name}}."
},
"unknown": {
  "title": "Unbekanntes Band",
  "message": "Dieses Band ist niemandem zugeordnet. Bänder zuweisen darf nur die Bandausgabe."
}
```

`en`:

```json
"header": {"settings": "Settings"},
"world": {"SCAN": "Scan", "TIMING": "Timing", "DASHBOARD": "Referee dashboard"},
"start": {"title": "What do you want to do?"},
"scan": {"title": "Scan", "modeChip": "Mode: {{mode}}", "modeUnset": "Mode: asked on first scan"},
"event": {"title": "Choose event"},
"settings": {
  "title": "Settings",
  "event": {"title": "Event", "switch": "Switch event"},
  "mode": {"title": "Mode", "hint": "Applies to all scans on this device."},
  "language": {"title": "Language"},
  "account": {"title": "Account"}
}
```

`result` in `en`:

```json
"band": {"PARTICIPANT": "Participant", "USER": "Helper", "UNKNOWN": "Unknown wristband"},
"loadError": "The wristband could not be loaded.",
"otherEvent": {"title": "Wrong event", "message": "This wristband belongs to another event{{name}}."},
"unknown": {"title": "Unknown wristband", "message": "This wristband is not assigned to anyone. Only the wristband desk may assign wristbands."}
```

`da`:

```json
"header": {"settings": "Indstillinger"},
"world": {"SCAN": "Scan", "TIMING": "Tidtagning", "DASHBOARD": "Dommer-dashboard"},
"start": {"title": "Hvad vil du gøre?"},
"scan": {"title": "Scan", "modeChip": "Tilstand: {{mode}}", "modeUnset": "Tilstand: spørges ved første scanning"},
"event": {"title": "Vælg stævne"},
"settings": {
  "title": "Indstillinger",
  "event": {"title": "Stævne", "switch": "Skift stævne"},
  "mode": {"title": "Tilstand", "hint": "Gælder for alle scanninger på denne enhed."},
  "language": {"title": "Sprog"},
  "account": {"title": "Konto"}
}
```

`result` in `da`:

```json
"band": {"PARTICIPANT": "Deltager", "USER": "Hjælper", "UNKNOWN": "Ukendt armbånd"},
"loadError": "Armbåndet kunne ikke indlæses.",
"otherEvent": {"title": "Forkert stævne", "message": "Dette armbånd hører til et andet stævne{{name}}."},
"unknown": {"title": "Ukendt armbånd", "message": "Dette armbånd er ikke tildelt nogen. Kun armbåndsudleveringen må tildele armbånd."}
```

Entfernen (alle drei Sprachen): `app.functionSelect` (ganzer Block), `app.forbidden.backButton`, `app.dashboard` (ganzer Block), `qrEvents.switchApp`, `qrEvents.back`, `qrEvents.title`, `qrScanner.title`, `timing.selectEvent`. Vor dem Entfernen mit `grep -rn "<schlüssel>" src` sicherstellen, dass niemand außerhalb der gelöschten Seiten den Schlüssel benutzt.

- [ ] **Step 2: Context neu schreiben**

`frontend/src/contexts/app/AppSessionContext.tsx`:

```tsx
import React, {createContext, PropsWithChildren, useContext, useEffect, useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {EventDto} from '@api/types.gen.ts'
import {getEvents} from '@api/sdk.gen.ts'
import {useUser} from '@contexts/user/UserContext.ts'
import {useFeedback, useFetch} from '@utils/hooks.ts'
import {readCachedRead, writeCachedRead} from '@pwa/readCache.ts'
import {AppWorld, ScanMode, scanRightsOf, worldsOf} from '@components/qrApp/appAccess.ts'
import {
    forgetLegacyAppFunction,
    readRememberedEvent,
    readScanMode,
    writeRememberedEvent,
    writeScanMode,
} from '@components/qrApp/appMemory.ts'

/**
 * Das Gedächtnis der Helfer-App: Veranstaltung, Modus, Veranstaltungsliste und die daraus
 * abgeleiteten Rechte. Kein Navigationszustand mehr — die Adresse trägt, wo man ist, und die
 * Band-ID reist in der Adresse.
 */
export type AppSession = {
    eventId: string | null
    /** Die gemerkte Veranstaltung aus der Liste; fehlt, solange die Liste nicht geladen ist. */
    event: EventDto | undefined
    events: EventDto[] | undefined
    setEventId: (eventId: string) => void
    scanRights: ScanMode[]
    worlds: AppWorld[]
    scanMode: ScanMode | null
    setScanMode: (mode: ScanMode) => void
}

const AppSessionContext = createContext<AppSession | undefined>(undefined)

export const AppSessionProvider: React.FC<PropsWithChildren> = ({children}) => {
    const {t} = useTranslation()
    const feedback = useFeedback()
    const user = useUser()

    const [eventId, setEventIdState] = useState<string | null>(() =>
        readRememberedEvent(localStorage),
    )
    const [events, setEvents] = useState<EventDto[]>()
    // Der Modus liegt im Speicher; dieser Zähler sorgt nur dafür, dass ein Schreiben neu liest.
    const [modeVersion, setModeVersion] = useState(0)

    useEffect(() => {
        forgetLegacyAppFunction(localStorage)
    }, [])

    const userId = user.loggedIn ? user.id : ''
    const scanRights = useMemo(() => scanRightsOf(user.checkPrivilege), [user])
    const worlds = useMemo(() => worldsOf(user.checkPrivilege), [user])

    // Die Veranstaltungsliste kommt beim Start aus dem Bestand, damit die Auswahl ohne Netz nicht
    // leer bleibt. Sie wird überschrieben, sobald ein echter Abruf durchkommt.
    useEffect(() => {
        if (!userId) return
        const cached = readCachedRead<EventDto[]>('events', userId, 'alle')
        if (cached) {
            setEvents(prev => prev ?? cached.payload)
        }
    }, [userId])

    useFetch(signal => getEvents({signal}), {
        onResponse: response => {
            if (response.data) {
                setEvents(response.data.data)
                if (userId) {
                    writeCachedRead('events', userId, 'alle', response.data.data)
                }
            }
            if (response.error) {
                feedback.error(t('common.load.error.multiple.short', {entity: t('event.event')}))
            }
        },
        preCondition: () => user.loggedIn,
        deps: [user.loggedIn],
    })

    const setEventId = (id: string) => {
        writeRememberedEvent(id, localStorage)
        setEventIdState(id)
    }

    const scanMode = useMemo(
        () =>
            userId && eventId ? readScanMode(userId, eventId, scanRights, localStorage) : null,
        // modeVersion ist absichtlich dabei: es ist der einzige Anstoß nach einem Schreiben.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [userId, eventId, scanRights, modeVersion],
    )

    const setScanMode = (mode: ScanMode) => {
        if (!userId || !eventId) return
        writeScanMode(userId, eventId, mode, localStorage)
        setModeVersion(v => v + 1)
    }

    const event = useMemo(() => events?.find(e => e.id === eventId), [events, eventId])

    return (
        <AppSessionContext.Provider
            value={{eventId, event, events, setEventId, scanRights, worlds, scanMode, setScanMode}}>
            {children}
        </AppSessionContext.Provider>
    )
}

export const useAppSession = (): AppSession => {
    const ctx = useContext(AppSessionContext)
    if (!ctx) throw new Error('AppSessionContext not found')
    return ctx
}
```

- [ ] **Step 3: `AppHeader` und `AppColumn`**

`frontend/src/components/qrApp/AppHeader.tsx`:

```tsx
import {Box, IconButton, Stack, Typography} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SettingsIcon from '@mui/icons-material/Settings'
import {ReactNode} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'

type Props = {
    title: string
    /** Meist der Name der Veranstaltung — damit auf jeder Seite steht, wofür man gerade arbeitet. */
    subtitle?: string
    onBack?: () => void
    /** Zeigt das Zahnrad zu den Einstellungen. */
    settings?: boolean
    /** Zusätzliche Zeile unter dem Titel, etwa der Modus-Chip. */
    children?: ReactNode
}

/**
 * Die Kopfzeile jeder App-Seite. Der Zurück-Pfeil ist nötig, weil die installierte App keine
 * Browser-Leiste hat; das Zahnrad ist der einzige Weg zu allem, was nicht in den Ablauf gehört.
 */
const AppHeader = ({title, subtitle, onBack, settings, children}: Props) => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    return (
        <Stack sx={{width: 1, mb: 1}} spacing={1} alignItems="center">
            <Stack direction="row" sx={{width: 1, alignItems: 'center', minHeight: 48}}>
                <Box sx={{width: 48}}>
                    {onBack && (
                        <IconButton onClick={onBack} aria-label={t('common.back')} size="large">
                            <ArrowBackIcon />
                        </IconButton>
                    )}
                </Box>
                <Box sx={{flex: 1, textAlign: 'center', minWidth: 0}}>
                    <Typography variant="h5" noWrap>
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                <Box sx={{width: 48}}>
                    {settings && (
                        <IconButton
                            onClick={() => void navigate({to: '/app/einstellungen'})}
                            aria-label={t('app.header.settings')}
                            size="large">
                            <SettingsIcon />
                        </IconButton>
                    )}
                </Box>
            </Stack>
            {children}
        </Stack>
    )
}

export default AppHeader
```

`frontend/src/components/qrApp/AppColumn.tsx`:

```tsx
import {Box} from '@mui/material'
import {PropsWithChildren} from 'react'

/**
 * Die eine Spalte der App: zentriert und begrenzt, damit sie auf dem Tablet nicht am linken Rand
 * klebt und auf dem Laptop nicht zur Tapete wird. Alle App-Seiten außer den Zeitnahme-Boards
 * (die sich per `position: fixed` aus dem Fluss nehmen) und dem Dashboard liegen darin.
 */
const AppColumn = ({children, maxWidth = 640}: PropsWithChildren<{maxWidth?: number}>) => (
    <Box
        sx={{
            width: 1,
            maxWidth,
            mx: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
        }}>
        {children}
    </Box>
)

export default AppColumn
```

- [ ] **Step 4: `AppLayout` anpassen**

In `frontend/src/layouts/AppLayout.tsx`: Import und Einbau von `LanguageWidget` samt umgebender `Box` entfernen (die Sprache liegt jetzt in den Einstellungen). Container-`sx`:

```tsx
sx={{
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    px: {xs: 2, sm: 3},
    // Safe-Areas: Die installierte App läuft ohne Browser-Leiste bis unter die Kerbe und die
    // Home-Leiste, sonst liegt die Kopfzeile unter der Uhr.
    pt: 'calc(env(safe-area-inset-top) + 12px)',
    pb: 'calc(env(safe-area-inset-bottom) + 16px)',
}}
```

- [ ] **Step 5: Seiten schreiben**

`frontend/src/pages/app/AppEntryPage.tsx`:

```tsx
import {useEffect, useMemo} from 'react'
import {useNavigate} from '@tanstack/react-router'
import Throbber from '@components/Throbber.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {resolveEntry} from '@components/qrApp/appEntry.ts'

/** Die Weiche hinter `/app`: entscheidet und leitet um, zeigt selbst nie etwas außer Warten. */
const AppEntryPage = () => {
    const {worlds, eventId, events, setEventId} = useAppSession()
    const navigate = useNavigate()
    // Einmal beim Öffnen gelesen, damit die Entscheidung nicht unter dem Finger kippt.
    const now = useMemo(() => new Date(), [])

    const decision = useMemo(
        () => resolveEntry({worlds, eventId, events, now}),
        [worlds, eventId, events, now],
    )

    useEffect(() => {
        switch (decision.kind) {
            case 'WAIT':
                return
            case 'FORBIDDEN':
                void navigate({to: '/app/forbidden', replace: true})
                return
            case 'CHOOSE_EVENT':
                void navigate({to: '/app/veranstaltung', replace: true})
                return
            case 'ADOPT_EVENT':
                // Das Setzen ändert eventId, der nächste Durchlauf landet bei GO.
                setEventId(decision.eventId)
                return
            case 'GO':
                void navigate({to: decision.to, replace: true})
                return
        }
    }, [decision, navigate, setEventId])

    return <Throbber />
}

export default AppEntryPage
```

`frontend/src/pages/app/EventChoicePage.tsx` — aus `QrEventsPage.tsx`, Änderungen:
- Kein `getUserAppRights`, kein `hadEvent`/`skipped`/`useEffect` (Auto-Übernahme liegt in der Weiche), kein `goForward`.
- `const {events, eventId, setEventId} = useAppSession()`; Klick auf eine Veranstaltung: `setEventId(event.id); void navigate({to: '/app', replace: true})`.
- Oben `<AppHeader title={t('app.event.title')} onBack={eventId ? () => void navigate({to: '/app'}) : undefined} />`, außen `<AppColumn>` statt der `Box`.
- Der Abmelden-Knopf bleibt unten (die Einstellungen sind ohne Veranstaltung nicht erreichbar).
- `t('qrEvents.noDays')` → `t('app.event.noDays')` und den Text in allen drei Sprachen von `qrEvents.noDays` nach `app.event.noDays` verschieben.

`frontend/src/pages/app/WorldsPage.tsx` — aus `AppFunctionSelectPage.tsx`, Änderungen:
- Einträge sind `worlds` aus `useAppSession()`, Beschriftung `t(\`app.world.${world}\`)`, Icons: `SCAN` → `QrCodeScannerIcon` (`@mui/icons-material/QrCodeScanner`), `TIMING` → `TimerIcon`, `DASHBOARD` → `SportsScoreIcon`. Klick: `navigate({to: worldPath[world]})`.
- Oben `<AppHeader title={t('app.start.title')} subtitle={event?.name} settings />`, außen `<AppColumn maxWidth={800}>`.
- Raster: `gridTemplateColumns={{xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)'}}`.
- Die Knöpfe „Event wechseln", „Abmelden", „App zurücksetzen" entfallen (Einstellungen). Der `useEffect` mit `navigateTo('APP_Forbidden')` entfällt (Weiche).

`frontend/src/pages/app/ScanPage.tsx`:

```tsx
import {Button, Chip} from '@mui/material'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import QrNimiqScanner from '@components/qrApp/QrNimiqScanner.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {useFeedback} from '@utils/hooks.ts'
import Config from '../../Config.ts'

const uuidRegex = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/

/** Die Startseite der Scan-Welt. Sie ruft nichts ab: das Ergebnis lädt sich selbst. */
const ScanPage = () => {
    const {t} = useTranslation()
    const {event, scanRights, scanMode, worlds} = useAppSession()
    const navigate = useNavigate()
    const feedback = useFeedback()

    const handleScan = (content: string) => {
        const match = content.match(uuidRegex)
        if (!match) {
            feedback.error(t('qrAssign.invalidQrFormat'))
            return
        }
        void navigate({to: '/app/scan/$qrCodeId', params: {qrCodeId: match[1]}})
    }

    return (
        <AppColumn>
            <AppHeader
                title={t('app.scan.title')}
                subtitle={event?.name}
                onBack={worlds.length > 1 ? () => void navigate({to: '/app/start'}) : undefined}
                settings>
                {scanRights.length > 1 && (
                    <Chip
                        clickable
                        onClick={() => void navigate({to: '/app/einstellungen'})}
                        color={scanMode ? 'primary' : 'warning'}
                        label={
                            scanMode
                                ? t('app.scan.modeChip', {mode: t(`app.mode.${scanMode}`)})
                                : t('app.scan.modeUnset')
                        }
                    />
                )}
            </AppHeader>
            <QrNimiqScanner callback={handleScan} />
            {(Config.mode === 'development' || Config.mode === 'test') && (
                <Button
                    onClick={() => handleScan('b294a2e0-039d-4ede-bd84-c61a47dd9c04')}
                    fullWidth
                    size="large"
                    variant="contained">
                    Skip ({Config.mode}-mode)
                </Button>
            )}
        </AppColumn>
    )
}

export default ScanPage
```

`frontend/src/pages/app/ScanResultPage.tsx`:

```tsx
import {useCallback} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import {checkQrCode} from '@api/sdk.gen.ts'
import {useFetch} from '@utils/hooks.ts'
import Throbber from '@components/Throbber.tsx'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {bandTypeOf, decideScan, StaffQrCodeResponse} from '@components/qrApp/scanDecision.ts'
import {AssignBand} from '@components/qrApp/result/AssignBand'
import {ChooseMode} from '@components/qrApp/result/ChooseMode'
import {ParticipantActions} from '@components/qrApp/result/ParticipantActions'
import {ScanErrorCard} from '@components/qrApp/result/ScanErrorCard'
import {UserActions} from '@components/qrApp/result/UserActions'
import {appScanResultRoute} from '@routes'

/**
 * Was das gescannte Band bedeutet. Die Band-ID kommt aus der Adresse, damit Neuladen und die
 * Zurück-Taste ohne Sonderfälle funktionieren; Rechte und Modus kommen aus der Sitzung.
 */
const ScanResultPage = () => {
    const {t} = useTranslation()
    const {qrCodeId} = appScanResultRoute.useParams()
    const {eventId, events, scanRights, scanMode, setScanMode} = useAppSession()
    const navigate = useNavigate()

    // Mit replace, damit Zurück vom Scanner nicht wieder auf einem verbrauchten Ergebnis landet.
    const backToScanner = useCallback(
        () => void navigate({to: '/app/scan', replace: true}),
        [navigate],
    )

    const {data, error, pending} = useFetch(
        signal => checkQrCode({signal, path: {qrCodeId}}),
        {deps: [qrCodeId]},
    )

    if (!eventId) return null
    if (pending || (data === null && error === null)) {
        return (
            <AppColumn>
                <AppHeader title={t('app.scan.title')} onBack={backToScanner} />
                <Throbber />
            </AppColumn>
        )
    }

    // Eine leere Antwort ist ein unbekanntes Band; die anonyme Antwortform (ohne `id`) kann hier
    // nicht vorkommen, weil die App immer angemeldet scannt — sie wird wie ein Ladefehler behandelt.
    const known = data !== null && Object.keys(data).length > 0
    if (error || (known && !('id' in data))) {
        return (
            <AppColumn>
                <AppHeader title={t('app.scan.title')} onBack={backToScanner} />
                <ScanErrorCard
                    title={t('app.scan.title')}
                    message={t('app.result.loadError')}
                    onRescan={backToScanner}
                />
            </AppColumn>
        )
    }

    const response: StaffQrCodeResponse | null = known ? (data as StaffQrCodeResponse) : null
    const band = bandTypeOf(response)

    if (response !== null && response.eventId !== eventId) {
        const other = events?.find(e => e.id === response.eventId)
        return (
            <AppColumn>
                <AppHeader title={t(`app.result.band.${band}`)} onBack={backToScanner} />
                <ScanErrorCard
                    title={t('app.result.otherEvent.title')}
                    message={t('app.result.otherEvent.message', {
                        name: other ? ` („${other.name}“)` : '',
                    })}
                    onRescan={backToScanner}
                />
            </AppColumn>
        )
    }

    const decision = decideScan({band, rights: scanRights, mode: scanMode})

    return (
        <AppColumn>
            <AppHeader title={t(`app.result.band.${band}`)} onBack={backToScanner} />
            {decision.kind === 'UNKNOWN_NOT_ALLOWED' && (
                <ScanErrorCard
                    title={t('app.result.unknown.title')}
                    message={t('app.result.unknown.message')}
                    onRescan={backToScanner}
                />
            )}
            {decision.kind === 'ASSIGN' && (
                <AssignBand eventId={eventId} qrCodeId={qrCodeId} onDone={backToScanner} />
            )}
            {decision.kind === 'CHOOSE' && (
                <ChooseMode options={decision.options} onChoose={setScanMode} />
            )}
            {decision.kind === 'ACT' && response !== null && band === 'PARTICIPANT' && (
                <ParticipantActions
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    response={response}
                    mode={decision.mode}
                    canRemove={decision.canRemove}
                    onDone={backToScanner}
                />
            )}
            {decision.kind === 'ACT' && response !== null && band === 'USER' && (
                <UserActions
                    eventId={eventId}
                    qrCodeId={qrCodeId}
                    response={response}
                    mode={decision.mode}
                    canRemove={decision.canRemove}
                    onDone={backToScanner}
                />
            )}
        </AppColumn>
    )
}

export default ScanResultPage
```

Hinweis für `CHOOSE`: `setScanMode` schreibt in den Speicher und erhöht den Zähler im Context; `scanMode` ändert sich, die Seite rendert neu und `decideScan` liefert `ACT`. Keine Navigation nötig. Prüfe die Rückgabeform von `useFetch` (`data`, `error`, `pending`) in `src/utils/hooks.ts` Zeilen 43-100 und passe die Bedingungen an, falls `data` bei leerer Antwort nicht `{}` sondern `undefined`/`null` ist.

`frontend/src/pages/app/SettingsPage.tsx`:

```tsx
import {
    Button,
    Divider,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import LogoutIcon from '@mui/icons-material/Logout'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import {useNavigate} from '@tanstack/react-router'
import {useTranslation} from 'react-i18next'
import AppHeader from '@components/qrApp/AppHeader.tsx'
import AppColumn from '@components/qrApp/AppColumn.tsx'
import LanguageWidget from '@components/appbar/LanguageWidget.tsx'
import {useAppSession} from '@contexts/app/AppSessionContext.tsx'
import {useUser} from '@contexts/user/UserContext.ts'
import {useConfirmation} from '@contexts/confirmation/ConfirmationContext.ts'
import {resetAppInstallation} from '@pwa/registerAppSW.ts'
import {parseEventDay} from '@components/qrApp/eventOperations.ts'
import {ScanMode} from '@components/qrApp/appAccess.ts'

/** Das Abseits: alles, was selten ist und im Ablauf nur stören würde. */
const SettingsPage = () => {
    const {t} = useTranslation()
    const navigate = useNavigate()
    const user = useUser()
    const {confirmAction} = useConfirmation()
    const {event, scanRights, scanMode, setScanMode} = useAppSession()

    const dateRange = () => {
        const from = event?.firstEventDay ? parseEventDay(event.firstEventDay) : null
        if (!from) return t('app.event.noDays')
        const to = event?.lastEventDay ? parseEventDay(event.lastEventDay) : null
        const full = (d: Date) =>
            d.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit', year: 'numeric'})
        return to && to.getTime() !== from.getTime() ? `${full(from)} – ${full(to)}` : full(from)
    }

    const section = (title: string) => (
        <Typography variant="overline" color="text.secondary">
            {title}
        </Typography>
    )

    return (
        <AppColumn>
            <AppHeader title={t('app.settings.title')} onBack={() => void navigate({to: '/app'})} />
            <Stack spacing={1}>
                {section(t('app.settings.event.title'))}
                <Typography sx={{fontWeight: 700}}>{event?.name ?? '–'}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {dateRange()}
                </Typography>
                <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<SwapHorizIcon />}
                    onClick={() => void navigate({to: '/app/veranstaltung'})}>
                    {t('app.settings.event.switch')}
                </Button>
            </Stack>
            {scanRights.length > 1 && (
                <>
                    <Divider />
                    <Stack spacing={1}>
                        {section(t('app.settings.mode.title'))}
                        <ToggleButtonGroup
                            orientation="vertical"
                            exclusive
                            fullWidth
                            value={scanMode}
                            onChange={(_e, value: ScanMode | null) => {
                                if (value !== null) setScanMode(value)
                            }}>
                            {scanRights.map(mode => (
                                <ToggleButton key={mode} value={mode} sx={{py: 1.5}}>
                                    {t(`app.mode.${mode}`)}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        <Typography variant="body2" color="text.secondary">
                            {t('app.settings.mode.hint')}
                        </Typography>
                    </Stack>
                </>
            )}
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                {section(t('app.settings.language.title'))}
                <LanguageWidget />
            </Stack>
            <Divider />
            <Stack spacing={1}>
                {section(t('app.settings.account.title'))}
                <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    startIcon={<LogoutIcon />}
                    onClick={() => 'logout' in user && user.logout(true)}>
                    {t('user.settings.logout')}
                </Button>
                <Button
                    variant="text"
                    size="small"
                    onClick={() =>
                        confirmAction(() => void resetAppInstallation(), {
                            content: t('app.reset.confirm'),
                            okText: t('app.reset.button'),
                        })
                    }>
                    {t('app.reset.button')}
                </Button>
            </Stack>
        </AppColumn>
    )
}

export default SettingsPage
```

`frontend/src/pages/app/ForbiddenPage.tsx`: `useAppSession` raus, `useUser` rein; der Knopf ruft `'logout' in user && user.logout(true)` und trägt `t('user.settings.logout')`.

`frontend/src/pages/app/AppDashboardPage.tsx`: `eventId` aus `useAppSession()`; `if (!eventId) return null`; `onBack={() => void navigate({to: '/app'})}` mit `useNavigate`. Der `Alert` und `navigateTo` entfallen.

`frontend/src/pages/app/TimingStationSelectPage.tsx`:
- `eventId` aus `useAppSession()` statt `timingEventRoute.useParams()`; `if (!eventId) return null`.
- Der Wächter-`useEffect` (`updateAppTimingGlobal` → forbidden) entfällt, die Route prüft das.
- Außen `<AppColumn>`, oben `<AppHeader title={t('timing.selectStation')} subtitle={event?.name} onBack={worlds.length > 1 ? () => void navigate({to: '/app/start'}) : undefined} settings />` — der bisherige `h4`-Titel entfällt.
- Navigationsziele: Posten `to: '/app/timing/$stationId', params: {stationId: station.id}`; Leitstand `to: '/app/timing/leitstand'`.
- Schiedsrichter-Karte: `setScanMode('APP_COMPETITION_CHECK'); void navigate({to: '/app/scan'})` — `setEventId`/`setAppFunction`/`navigateTo` entfallen. Der Kommentar dazu wird angepasst: Die Karte setzt den Stationsmodus und wechselt in die Scan-Welt.

- [ ] **Step 6: Routen umstellen**

In `frontend/src/routes.tsx` den Block von `export const appRoute` bis einschließlich `appDashboardRoute` ersetzen. Importe der gelöschten Seiten entfernen, neue Seiten importieren (`AppEntryPage`, `EventChoicePage`, `WorldsPage`, `ScanPage`, `ScanResultPage`, `SettingsPage`), außerdem `readRememberedEvent` aus `@components/qrApp/appMemory.ts`, `scanRightsOf` aus `@components/qrApp/appAccess.ts`, `readLiveDashboardGlobal` aus `@authorization/privileges.ts`.

```tsx
// --- Helfer-App -------------------------------------------------------------------------------
//
// Der Ablauf beginnt mit dem Scanner; die Weiche `/app` entscheidet aus Rechten und Bestand, wohin
// es geht. Die Veranstaltung steht nicht in der Adresse, sondern im Gedächtnis der App
// (localStorage), deshalb prüfen die Wächter sie dort. Fehlt eine Voraussetzung, geht es zurück
// zur Weiche — sie ist die einzige Stelle, die Umleitungen kennt.

const requireAppEvent = () => {
    if (readRememberedEvent(localStorage) === null) {
        throw redirect({to: '/app'})
    }
}

const requireAppRight = (context: User, allowed: (user: AuthenticatedUser) => boolean) => {
    checkAuthApp(context)
    if (!context.loggedIn || !allowed(context)) {
        throw redirect({to: '/app'})
    }
}

export const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'app',
    component: () => <AppLayout />,
})

export const appIndexRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '/',
    component: () => <AppEntryPage />,
    beforeLoad: ({context}) => checkAuthApp(context),
})

export const appLoginRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'login',
    component: () => <AppLoginPage />,
})

export const appForbiddenRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'forbidden',
    component: () => <ForbiddenPage />,
})

export const appEventChoiceRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'veranstaltung',
    component: () => <EventChoicePage />,
    beforeLoad: ({context}) => checkAuthApp(context),
})

export const appStartRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'start',
    component: () => <WorldsPage />,
    beforeLoad: ({context}) => {
        checkAuthApp(context)
        requireAppEvent()
    },
})

export const appScanRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'scan',
    component: () => <ScanPage />,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => scanRightsOf(user.checkPrivilege).length > 0)
        requireAppEvent()
    },
})

export const appScanResultRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'scan/$qrCodeId',
    component: () => <ScanResultPage />,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => scanRightsOf(user.checkPrivilege).length > 0)
        requireAppEvent()
    },
})

export const appSettingsRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'einstellungen',
    component: () => <SettingsPage />,
    beforeLoad: ({context}) => {
        checkAuthApp(context)
        requireAppEvent()
    },
})

export const appDashboardRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'dashboard',
    component: () => <AppDashboardPage />,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => user.checkPrivilege(readLiveDashboardGlobal))
        requireAppEvent()
    },
})

export const appTimingRoute = createRoute({
    getParentRoute: () => appRoute,
    path: 'timing',
})

export const appTimingIndexRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: '/',
    component: () => <TimingStationSelectPage />,
    beforeLoad: ({context}) => {
        requireAppRight(context, user => user.checkPrivilege(updateAppTimingGlobal))
        requireAppEvent()
    },
})

// Vor `appTimingStationRoute` deklariert: das statische `leitstand` muss gegen `$stationId`
// gewinnen.
export const appTimingLeitstandRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: 'leitstand',
    component: function AppTimingLeitstand() {
        const navigate = useNavigate()
        const eventId = readRememberedEvent(localStorage)
        if (eventId === null) return null
        return (
            <TimingLeitstandPage
                eventId={eventId}
                onBack={() => void navigate({to: '/app/timing'})}
            />
        )
    },
    beforeLoad: ({context}) => {
        // Der Leitstand schreibt in die Ergebnisse der Veranstaltung — strenger als die Posten.
        requireAppRight(context, user => user.checkPrivilege(updateEventGlobal))
        requireAppEvent()
    },
})

export const appTimingStationRoute = createRoute({
    getParentRoute: () => appTimingRoute,
    path: '$stationId',
    component: function AppTimingStation() {
        const {stationId} = appTimingStationRoute.useParams()
        const eventId = readRememberedEvent(localStorage)
        if (eventId === null) return null
        return <TimingBoardPage eventId={eventId} stationId={stationId} />
    },
    beforeLoad: ({context}) => {
        requireAppRight(context, user => user.checkPrivilege(updateAppTimingGlobal))
        requireAppEvent()
    },
})

// Alte Adressen aus Verläufen installierter Apps (`/app/scanner`, `/app/function`, ...) landen
// auf der Weiche statt auf einer leeren Seite.
export const appCatchAllRoute = createRoute({
    getParentRoute: () => appRoute,
    path: '$',
    beforeLoad: () => {
        throw redirect({to: '/app', replace: true})
    },
})
```

Kinderliste im Routenbaum:

```tsx
appRoute.addChildren([
    appIndexRoute,
    appLoginRoute,
    appForbiddenRoute,
    appEventChoiceRoute,
    appStartRoute,
    appScanRoute,
    appScanResultRoute,
    appSettingsRoute,
    appDashboardRoute,
    appTimingRoute.addChildren([appTimingIndexRoute, appTimingLeitstandRoute, appTimingStationRoute]),
    appCatchAllRoute,
]),
```

Prüfen, ob `AuthenticatedUser` in `routes.tsx` schon importiert ist (`@contexts/user/UserContext.ts`); sonst ergänzen. Die alten Exporte `qrScanRoute`, `qrUserRoute`, `qrParticipantRoute`, `qrAssignRoute`, `qrEventsRoute`, `appFunctionSelectRoute`, `timingRoute`, `timingEventsIndexRoute`, `timingEventRoute`, `timingStationSelectIndexRoute`, `timingLeitstandRoute`, `timingStationRoute` entfallen; mit `grep -rn "<name>" src` sicherstellen, dass niemand sie importiert (Stand heute: nur `TimingStationSelectPage` importiert `timingEventRoute`, und die wird in dieser Aufgabe umgestellt).

- [ ] **Step 7: Alte Dateien löschen**

```bash
git rm frontend/src/pages/app/QrEventsPage.tsx frontend/src/pages/app/AppFunctionSelectPage.tsx \
  frontend/src/pages/app/QrScannerPage.tsx frontend/src/pages/app/QrParticipantPage.tsx \
  frontend/src/pages/app/QrAppuserPage.tsx frontend/src/pages/app/QrAssignPage.tsx \
  frontend/src/pages/app/TimingEventsPage.tsx frontend/src/components/qrApp/AppTopTitle.tsx \
  frontend/src/components/qrApp/QrAssignmentInfo.tsx frontend/src/components/qrApp/common.ts \
  frontend/src/components/qrApp/appEntries.test.ts
```

Danach `grep -rn "common.ts\|AppTopTitle\|QrAssignmentInfo\|navigateTo\|appFunction\|AppView\|qrLastScanned" src` — es darf nichts mehr übrig sein.

- [ ] **Step 8: Bauen, testen, linten**

Run: `npm test && npm run build && npm run lint`
Expected: alles grün. Typische Stolpersteine: `t()` mit Template-Literal (`app.mode.${mode}`) verlangt, dass alle vier Schlüssel in `de` existieren; `useFetch`-Rückgabeform; `AuthenticatedUser`-Import.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src
git commit -m "Helfer-App: Scannen zuerst, Veranstaltung und Modus im Gedächtnis"
```

---

### Task 7: Feinschliff — Reste, Responsiveness, Doku

**Files:**
- Modify: `frontend/src/components/qrApp/TeamCheckInOut.tsx`, `frontend/src/components/qrApp/CatererTransaction.tsx`, `frontend/src/components/qrApp/result/AssignBand.tsx`
- Modify: `frontend/src/i18n/*/translations.json` (verwaiste Schlüssel)
- Modify: `docs/superpowers/specs/2026-09-02-helfer-app-ablauf-design.md` (Abschnitt 9, Konto ohne Name/E-Mail; Abschnitt 10 Dateiliste an den Ist-Stand angleichen)

**Interfaces:** keine neuen.

- [ ] **Step 1: Verwaiste Übersetzungen finden**

Für jeden Schlüssel unter `qrEvents`, `qrScanner`, `qrAssign`, `qrParticipant`, `qrAppuser`, `caterer`, `app` in `de/translations.json` prüfen, ob er in `src` noch vorkommt:

```bash
node -e '
const de = require("./src/i18n/de/translations.json");
const {execSync} = require("child_process");
const walk = (o, p=[]) => Object.entries(o).flatMap(([k,v]) => typeof v === "object" ? walk(v, [...p,k]) : [[...p,k].join(".")]);
for (const ns of ["qrEvents","qrScanner","qrAssign","qrParticipant","qrAppuser","caterer","app"]) {
  for (const key of walk(de[ns], [ns])) {
    const parent = key.split(".").slice(0,-1).join(".");
    try { execSync(`grep -rqF "${key}" src`); } catch {
      try { execSync(`grep -rqF "${parent}.\\$" src`); console.log("dyn?", key); } catch { console.log("unused", key); }
    }
  }
}'
```

Schlüssel, die `unused` sind und nicht dynamisch (`app.mode.*`, `app.world.*`, `app.result.band.*`, `qrParticipant.scope.*`, `qrParticipant.status.*`) zusammengesetzt werden, in allen drei Sprachen entfernen.

- [ ] **Step 2: Fingerziele und Safe-Areas**

- `CatererTransaction.tsx`: Bestätigen-Knopf `size="large"` mit `sx={{py: 1.5}}`; die äußere `Box` verliert `maxWidth: 600` (die Spalte begrenzt schon).
- `AssignBand.tsx`: `ToggleButton`s bekommen `sx={{flex: 1, py: 1.5}}`; der Knopf „Benutzer aus System scannen" bleibt `py: 1.5`.
- `TeamCheckInOut.tsx`: Der Check-in-Knopf wird `size="large"` und `fullWidth`; prüfen, dass `LoadingButton` beide Eigenschaften durchreicht (`src/components/form/LoadingButton.tsx`), sonst `sx={{minHeight: 48, width: 1}}`.

- [ ] **Step 3: Spezifikation angleichen**

In Abschnitt 9 („Einstellungen") den Punkt 4 auf „Konto: Abmelden" kürzen — der angemeldete Nutzer trägt im Frontend weder Name noch E-Mail. Abschnitt 10 gegen `git ls-files frontend/src/pages/app frontend/src/components/qrApp` abgleichen.

- [ ] **Step 4: Bauen, testen, linten**

Run: `npm test && npm run build && npm run lint`
Expected: grün.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src docs/superpowers/specs/2026-09-02-helfer-app-ablauf-design.md
git commit -m "Helfer-App: verwaiste Texte entfernt, Fingerziele vergrößert"
```

---

### Task 8: Handprüfung im Browser (führt die Hauptsitzung selbst aus)

Kein Subagent. Backend und Seed nach `docs/seeds` bzw. dem Gedächtnis (Seed `71ed`, Anmeldung per `localStorage`-Sitzung), Frontend über `preview_start`. Prüfliste, je bei 375 px und 1024 px Breite:

1. Anmeldung → landet ohne Zwischenseite im Scanner (Konto mit genau einem Scan-Recht) bzw. auf den Kacheln (Konto mit Scan + Zeitnahme).
2. Zahnrad → Einstellungen → Veranstaltung wechseln → Liste → Wahl → zurück im Ablauf; die Wahl übersteht ein Neuladen.
3. Konto mit zwei Scan-Rechten: erster Scan eines bekannten Bandes fragt; danach zeigt der Scanner den Modus-Chip; zweiter Scan fragt nicht mehr.
4. Unbekanntes Band ohne Bandrecht → Fehlerkarte; mit Bandrecht → Zuweisung.
5. Band einer anderen Veranstaltung → Fehlerkarte „Falsche Veranstaltung".
6. Zurück-Taste nach abgeschlossenem Check-in öffnet nicht wieder das Ergebnis.
7. Alte Adresse `/app/scanner` landet im Ablauf.
8. Zeitnahme: `/app/timing` zeigt die Posten der gemerkten Veranstaltung; Schiedsrichter-Karte springt in den Scanner mit Modus „Boote an- und abmelden".
