import type {Privilege} from '@api/types.gen.ts'
import {
    readRegistrationGlobal,
    readResultGlobal,
    updateEventGlobal,
} from '@authorization/privileges.ts'
import type {CompetitionTab} from '@components/event/competition/common.ts'
import {canEditEvent} from './eventPageLogic.ts'

/**
 * Reine Regeln der Wettkampfseite (`/event/$eventId/competition/$competitionId`): welche Reiter
 * jemand sieht, auf welchen ein `?tab=` aufgelöst wird und wohin Vor/Zurück führen. Getrennt von
 * der Komponente, damit sie ohne Rendern testbar sind.
 */

/**
 * Reiter in Anzeigereihenfolge, nach dem Arbeitsablauf: erst lesen (Allgemein), dann Meldungen
 * und Teams, dann vorbereiten (Rundenstruktur, Zeitnahme), dann durchführen und auswerten.
 */
export const COMPETITION_PAGE_TABS = [
    'general',
    'registrations',
    'teams',
    'setup',
    'timing',
    'execution',
    'places',
] as const satisfies readonly CompetitionTab[]

// Jeder Reiter aus `CompetitionTab` muss hier vorkommen – sonst wäre er nie erreichbar.
type MissingTab = Exclude<CompetitionTab, (typeof COMPETITION_PAGE_TABS)[number]>
const allTabsListed: [MissingTab] extends [never] ? true : never = true
void allTabsListed

export const DEFAULT_COMPETITION_TAB: CompetitionTab = 'general'

/** Übersetzungsschlüssel der Reiterbeschriftungen (eigene Schlüssel der Wettkampfseite). */
export const COMPETITION_TAB_LABEL_KEYS = {
    general: 'event.competition.page.tabs.general',
    registrations: 'event.competition.page.tabs.registrations',
    teams: 'event.competition.page.tabs.teams',
    setup: 'event.competition.page.tabs.setup',
    timing: 'event.competition.page.tabs.timing',
    execution: 'event.competition.page.tabs.execution',
    places: 'event.competition.page.tabs.places',
} as const satisfies Record<CompetitionTab, string>

export const isCompetitionTab = (value: unknown): value is CompetitionTab =>
    typeof value === 'string' && (COMPETITION_PAGE_TABS as readonly string[]).includes(value)

export type CompetitionSearch = {tab?: CompetitionTab}

/**
 * Für `competitionIndexRoute.validateSearch`: unbekannte Reiter fallen weg. Ob die Person den
 * Reiter sehen darf, prüft erst `resolveCompetitionTab`, weil die Route Rechte und Veranstaltung
 * nicht kennt.
 */
export const validateCompetitionSearch = (search: Record<string, unknown>): CompetitionSearch => ({
    tab: isCompetitionTab(search.tab) ? search.tab : undefined,
})

export type CompetitionTabViewer = {
    loggedIn: boolean
    checkPrivilege: (privilege: Privilege) => boolean
}

export type CompetitionTabContext = {
    challengeEvent: boolean
    /** Meldungen der Veranstaltung, wie `EventDto.registrationCount` sie liefert. */
    registrationCount: number
    /** Ergebnis von `getRegistrationState(event, competition.lateRegistrationAllowed)`. */
    registrationState: 'REGULAR' | 'LATE' | 'CLOSED'
}

/**
 * Sichtbare Reiter in Anzeigereihenfolge. Die Bedingungen sind die der Seite bis zum 13.11.2026,
 * wörtlich übernommen – niemand sieht hier etwas, das er vorher nicht sah.
 */
export function visibleCompetitionTabs(
    viewer: CompetitionTabViewer,
    context: CompetitionTabContext,
): CompetitionTab[] {
    const can = viewer.checkPrivilege
    const mayManage = can(updateEventGlobal) && !context.challengeEvent
    const visible: Record<CompetitionTab, boolean> = {
        general: true,
        registrations:
            viewer.loggedIn &&
            (context.registrationCount > 0 ||
                can(readRegistrationGlobal) ||
                context.registrationState !== 'CLOSED'),
        teams: can(readRegistrationGlobal),
        setup: mayManage,
        timing: mayManage,
        execution: mayManage,
        places: can(readResultGlobal) && !context.challengeEvent,
    }
    return COMPETITION_PAGE_TABS.filter(tab => visible[tab])
}

/**
 * Der Reiter, der tatsächlich gezeigt wird: der angefragte, wenn er sichtbar ist, sonst der erste
 * sichtbare. Der Reiter wird beim Sprung zum nächsten Wettkampf mitgetragen und kann dort fehlen –
 * etwa „Meldungen" bei geschlossener Meldung.
 */
export function resolveCompetitionTab(
    requested: unknown,
    visible: readonly CompetitionTab[],
): CompetitionTab {
    if (isCompetitionTab(requested) && visible.includes(requested)) return requested
    return visible[0] ?? DEFAULT_COMPETITION_TAB
}

/** Suchparameter für Links auf einen Wettkampf, die den Reiter behalten (`general` → ohne). */
export const competitionTabSearch = (tab: CompetitionTab): CompetitionSearch => ({
    tab: tab === DEFAULT_COMPETITION_TAB ? undefined : tab,
})

/**
 * Vorheriger und nächster Wettkampf in der Reihenfolge der Liste (nach Kennung sortiert, wie die
 * Wettkampf-Leiste). Am Rand bzw. bei unbekanntem Wettkampf `undefined`.
 */
export function adjacentCompetitions<T extends {id: string}>(
    ordered: readonly T[],
    currentId: string,
): {previous?: T; next?: T} {
    const index = ordered.findIndex(c => c.id === currentId)
    if (index < 0) return {}
    return {
        previous: index > 0 ? ordered[index - 1] : undefined,
        next: index < ordered.length - 1 ? ordered[index + 1] : undefined,
    }
}

/**
 * „Bearbeiten" im Seitenkopf: dasselbe Recht wie „Bearbeiten" in der Wettkampftabelle
 * (`EntityTable` mit `parentResource: 'EVENT'` prüft UPDATE EVENT ab OWN).
 */
export const canEditCompetition = canEditEvent

/** Kurzform für Breadcrumb und Leiste: „12 JM4x", ohne Kurznamen „12 Junioren-Vierer". */
export const competitionCrumbLabel = (properties: {
    identifier: string
    name: string
    shortName?: string | null
}): string => `${properties.identifier} ${properties.shortName || properties.name}`.trim()
