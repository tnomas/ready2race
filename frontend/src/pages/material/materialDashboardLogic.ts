/**
 * Reine Regeln der Material-Seiten: welche Reiter das Anbieter-Dashboard hat, wie die Adresse
 * (`?tab=`, `?provider=`) gelesen wird, welcher Anbieter gilt und wann der Seitenleisten-Eintrag
 * „Material" aktiv ist. Die Seiten rechnen nichts davon selbst (ADR-0103).
 */

/** Reiter in Anzeigereihenfolge; der erste ist der Rückfall. */
export const MATERIAL_TABS = ['requests', 'assignment', 'damages', 'settings'] as const
export type MaterialTab = (typeof MATERIAL_TABS)[number]

export const isMaterialTab = (value: unknown): value is MaterialTab =>
    typeof value === 'string' && (MATERIAL_TABS as readonly string[]).includes(value)

export type MaterialEventSearch = {
    tab?: MaterialTab
    /**
     * Nur für Konten ohne eigene Anbieter-Zuordnung mit READ MATERIAL GLOBAL relevant; der eigene
     * Anbieter (`materialProviderId` am Konto) hat immer Vorrang (`effectiveProviderId`).
     */
    provider?: string
}

export type MaterialProviderSearch = {
    provider?: string
}

const asProvider = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value : undefined

/** `validateSearch` der Dashboard-Route: unbekannte Reiter fallen weg, leere Anbieter auch. */
export const validateMaterialEventSearch = (
    search: Record<string, unknown>,
): MaterialEventSearch => ({
    tab: isMaterialTab(search.tab) ? search.tab : undefined,
    provider: asProvider(search.provider),
})

/** `validateSearch` von Veranstaltungswahl und Flotte. */
export const validateMaterialProviderSearch = (
    search: Record<string, unknown>,
): MaterialProviderSearch => ({
    provider: asProvider(search.provider),
})

/**
 * Der Reiter, der gezeigt wird: der angefragte, wenn er bekannt ist, sonst der erste. Alle Reiter
 * sind für jede Person sichtbar, die das Dashboard überhaupt betreten darf (READ MATERIAL); die
 * Schreibrechte prüft das Backend je Aktion.
 */
export const resolveMaterialTab = (requested: unknown): MaterialTab =>
    isMaterialTab(requested) ? requested : MATERIAL_TABS[0]

/**
 * Der Anbieter, dessen Daten die Seite zeigt: die eigene Zuordnung, sonst – nur mit READ MATERIAL
 * GLOBAL – der über `?provider=` gewählte, sonst keiner.
 */
export const effectiveProviderId = (opts: {
    ownProviderId: string | undefined
    mayReadGlobal: boolean
    searchProvider: string | undefined
}): string | undefined =>
    opts.ownProviderId ?? (opts.mayReadGlobal ? opts.searchProvider : undefined)

/**
 * Ob der Seitenleisten-Eintrag „Material" (Arbeitsplatz des Anbieters) aktiv ist: auf
 * `/material`, im Dashboard und in der Flotte, nicht aber in der Stammdatenverwaltung
 * `/material/admin`, die ihren eigenen Eintrag im Verwaltungsblock hat.
 */
export const isMaterialWorkplacePath = (pathname: string, basepath = '/'): boolean => {
    const base = basepath.replace(/\/+$/, '')
    const path = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname
    const normalized = `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}`
    if (normalized === '/material') return true
    if (!normalized.startsWith('/material/')) return false
    return !(normalized === '/material/admin' || normalized.startsWith('/material/admin/'))
}
