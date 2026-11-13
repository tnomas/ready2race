/**
 * Tageswahl im Zeitplan als Teil der Adresse (`/event/$eventId?tab=schedule&day=…`), damit
 * Neuladen, Zurück und geteilte Links den gewählten Tag behalten. Am Regattatag sprang der
 * Zeitplan sonst nach jedem Reload auf die Vorauswahl zurück.
 *
 * Werte: `all` (alle Tage) oder ein Datum `YYYY-MM-DD`. Fehlt der Wert, gilt die Vorauswahl:
 * der heutige Tag, wenn die Veranstaltung heute Läufe hat, sonst alle Tage.
 */

export const SCHEDULE_ALL_DAYS = 'all'

export type ScheduleDay = typeof SCHEDULE_ALL_DAYS | string

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Prüft den Rohwert aus der Adresse; alles andere als `all` oder `YYYY-MM-DD` fällt weg. */
export const parseScheduleDay = (value: unknown): ScheduleDay | undefined => {
    if (value === SCHEDULE_ALL_DAYS) return SCHEDULE_ALL_DAYS
    if (typeof value === 'string' && ISO_DATE.test(value)) return value
    return undefined
}

/**
 * Der Tag, den der Zeitplan tatsächlich zeigt.
 *
 * - `all` bleibt `all`.
 * - Ein Datum, an dem es Läufe gibt, bleibt stehen.
 * - Fehlt die Wahl oder zeigt sie auf einen Tag ohne Läufe (altes Lesezeichen, verschobener
 *   Tag), greift die Vorauswahl: heute, wenn heute Läufe geplant sind, sonst alle Tage.
 *
 * @param availableDays die Tage mit Slots (`YYYY-MM-DD`)
 * @param today heutiges Datum (`YYYY-MM-DD`)
 */
export const resolveScheduleDay = (
    requested: ScheduleDay | undefined,
    availableDays: readonly string[],
    today: string,
): ScheduleDay => {
    if (requested === SCHEDULE_ALL_DAYS) return SCHEDULE_ALL_DAYS
    if (requested !== undefined && availableDays.includes(requested)) return requested
    return availableDays.includes(today) ? today : SCHEDULE_ALL_DAYS
}
