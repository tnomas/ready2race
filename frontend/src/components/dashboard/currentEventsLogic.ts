import {
    EventOperationWindow,
    isOperating,
    parseEventDay,
} from '@components/qrApp/eventOperations.ts'

/**
 * Reine Regeln des Widgets „Aktuelle Veranstaltungen" auf der Übersicht: Status je
 * Veranstaltung, Reihenfolge, Datumsspanne. Ohne React, damit Vitest sie ohne Rendern prüft.
 *
 * „Läuft" ist dasselbe Fenster wie in der Helfer-App (`isOperating`: vom Beginn des
 * Vor-Ort-Betriebs bis zum Ende des letzten Veranstaltungstages) – eine Stelle, eine Regel.
 */

export type CurrentEventStatus = 'running' | 'upcoming' | 'past' | 'undated'

export type CurrentEventInput = EventOperationWindow & {
    name: string
    /** Erster Veranstaltungstag als `YYYY-MM-DD`; fehlt bei einer Veranstaltung ohne Tage. */
    firstEventDay?: string
}

/** Höchstzahl Einträge im Widget; der Rest liegt hinter „Alle Veranstaltungen". */
export const CURRENT_EVENTS_LIMIT = 5

/**
 * Wie viele Veranstaltungen das Widget holt, um daraus die fünf wichtigsten zu wählen. Die Liste
 * lässt sich serverseitig nicht nach Datum sortieren; bei mehr Veranstaltungen fehlen im Widget
 * höchstens alte oder ferne Einträge, die Seite „Veranstaltungen" bleibt vollständig.
 */
export const CURRENT_EVENTS_FETCH_LIMIT = 200

const endOfDay = (isoDate: string): number | null => {
    const day = parseEventDay(isoDate)
    if (day === null) return null
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
}

const dayStart = (isoDate: string | undefined): number | null => {
    if (!isoDate) return null
    return parseEventDay(isoDate)?.getTime() ?? null
}

export function currentEventStatus(event: CurrentEventInput, now: Date): CurrentEventStatus {
    if (isOperating(event, now)) return 'running'
    const last = event.lastEventDay ? endOfDay(event.lastEventDay) : null
    if (last !== null && now.getTime() >= last) return 'past'
    if (last !== null || dayStart(event.firstEventDay) !== null) return 'upcoming'
    return 'undated'
}

const STATUS_ORDER: Record<CurrentEventStatus, number> = {
    running: 0,
    upcoming: 1,
    past: 2,
    undated: 3,
}

/**
 * Laufende zuerst (was zuerst begann, oben), dann kommende nach Datum (die nächste oben), dann
 * vergangene (die jüngste oben), Veranstaltungen ohne Tage zuletzt nach Name.
 */
export function sortCurrentEvents<T extends CurrentEventInput>(
    events: readonly T[],
    now: Date,
): {event: T; status: CurrentEventStatus}[] {
    const firstDay = (e: T) => dayStart(e.firstEventDay) ?? dayStart(e.lastEventDay) ?? 0
    const lastDay = (e: T) => dayStart(e.lastEventDay) ?? dayStart(e.firstEventDay) ?? 0
    return events
        .map(event => ({event, status: currentEventStatus(event, now)}))
        .sort((a, b) => {
            const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
            if (byStatus !== 0) return byStatus
            switch (a.status) {
                case 'running':
                case 'upcoming':
                    return firstDay(a.event) - firstDay(b.event)
                case 'past':
                    return lastDay(b.event) - lastDay(a.event)
                case 'undated':
                    return a.event.name.localeCompare(b.event.name)
            }
        })
}

/**
 * Datum bzw. Datumsspanne aus erstem und letztem Veranstaltungstag, `null` ohne Tage. Gleiches
 * Jahr: „14.08. – 16.08.2026", sonst beide Daten voll.
 */
export function formatEventDateRange(
    firstEventDay: string | undefined,
    lastEventDay: string | undefined,
    locale?: string,
): string | null {
    const from = firstEventDay ? parseEventDay(firstEventDay) : null
    const to = lastEventDay ? parseEventDay(lastEventDay) : null
    const start = from ?? to
    if (start === null) return null
    const full = (d: Date) =>
        d.toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: 'numeric'})
    if (to === null || to.getTime() === start.getTime()) return full(start)
    const startText =
        start.getFullYear() === to.getFullYear()
            ? start.toLocaleDateString(locale, {day: '2-digit', month: '2-digit'})
            : full(start)
    return `${startText} – ${full(to)}`
}
