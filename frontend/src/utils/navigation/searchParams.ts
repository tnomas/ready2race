import {EventSectionKey, validateEventSearch} from '../../pages/event/eventSections.ts'
import {parseScheduleDay, ScheduleDay} from './scheduleDay.ts'

/**
 * Search der Veranstaltungsseite `/event/$eventId`:
 * - `tab`: der Bereich (unbekannte Werte fallen weg; ob die Person ihn sehen darf, prüft erst
 *   `resolveEventTab`, weil die Route die Rechte nicht kennt),
 * - `day`: der gewählte Zeitplan-Tag (`all` oder `YYYY-MM-DD`, siehe scheduleDay.ts).
 */
export type EventIndexSearch = {
    tab?: EventSectionKey
    day?: ScheduleDay
}

/** Für `eventIndexRoute.validateSearch`. */
export const validateEventIndexSearch = (search: Record<string, unknown>): EventIndexSearch => ({
    ...validateEventSearch(search),
    day: parseScheduleDay(search.day),
})

/** Reiter der Systemseite (`/administration?tab=…`), in Anzeigereihenfolge. */
export const ADMINISTRATION_TABS = ['smtp', 'theme', 'email-templates'] as const
export type AdministrationTab = (typeof ADMINISTRATION_TABS)[number]
export const DEFAULT_ADMINISTRATION_TAB: AdministrationTab = 'smtp'

export const isAdministrationTab = (value: unknown): value is AdministrationTab =>
    typeof value === 'string' && (ADMINISTRATION_TABS as readonly string[]).includes(value)

export type AdministrationSearch = {
    tab?: AdministrationTab
}

/** Für `administrationIndexRoute.validateSearch`: unbekannte Reiter fallen weg. */
export const validateAdministrationSearch = (
    search: Record<string, unknown>,
): AdministrationSearch => ({
    tab: isAdministrationTab(search.tab) ? search.tab : undefined,
})
