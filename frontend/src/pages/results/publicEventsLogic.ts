import {format, isValid, parseISO} from 'date-fns'

/**
 * Zeitliche Einordnung von Veranstaltungen für die öffentlichen Seiten (Startseite und Auswahl
 * „Ergebnisse & Live"). Zuschauer suchen fast immer das, was gerade läuft – deshalb gruppieren
 * beide Seiten nach „läuft gerade", „demnächst" und „vergangen" statt alphabetisch.
 *
 * Gerechnet wird auf Kalendertagen im Format `yyyy-MM-dd` (so liefern die DTOs `eventFrom`/
 * `eventTo` bzw. `firstEventDay`/`lastEventDay`); ein lexikalischer Vergleich ist dort ein
 * Datumsvergleich.
 */

export type EventDateWindow = {
    from?: string | null
    to?: string | null
}

export type EventPhase = 'running' | 'upcoming' | 'past' | 'undated'

export type EventsByPhase<T> = Record<EventPhase, T[]>

/** Der heutige Kalendertag in Ortszeit als `yyyy-MM-dd`. */
export const todayIso = (now: Date): string => format(now, 'yyyy-MM-dd')

/**
 * Ohne Ende gilt der Beginn als einziger Tag, ohne Beginn das Ende. Ohne beides lässt sich nichts
 * sagen ('undated').
 */
export const eventPhase = ({from, to}: EventDateWindow, today: string): EventPhase => {
    const start = from || to
    const end = to || from
    if (!start || !end) return 'undated'
    if (end < today) return 'past'
    if (start > today) return 'upcoming'
    return 'running'
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, {sensitivity: 'base'})

/**
 * Teilt [events] nach [eventPhase] auf. Laufende und kommende stehen nach Beginn aufsteigend
 * (das Nächste zuerst), vergangene nach Ende absteigend (das Jüngste zuerst), gleiche Tage nach
 * Name. Ohne Termin bleibt die Reihenfolge nach Name.
 */
export const groupEventsByPhase = <T>(
    events: readonly T[],
    windowOf: (event: T) => EventDateWindow,
    nameOf: (event: T) => string,
    today: string,
): EventsByPhase<T> => {
    const groups: EventsByPhase<T> = {running: [], upcoming: [], past: [], undated: []}
    for (const event of events) {
        groups[eventPhase(windowOf(event), today)].push(event)
    }
    const startOf = (e: T) => windowOf(e).from || windowOf(e).to || ''
    const endOf = (e: T) => windowOf(e).to || windowOf(e).from || ''
    const ascending = (a: T, b: T) =>
        startOf(a) === startOf(b) ? byName(nameOf(a), nameOf(b)) : startOf(a) < startOf(b) ? -1 : 1
    groups.running.sort(ascending)
    groups.upcoming.sort(ascending)
    groups.past.sort((a, b) =>
        endOf(a) === endOf(b) ? byName(nameOf(a), nameOf(b)) : endOf(a) > endOf(b) ? -1 : 1,
    )
    groups.undated.sort((a, b) => byName(nameOf(a), nameOf(b)))
    return groups
}

/**
 * Datumsangabe einer Veranstaltung: ein Tag als ein Datum, mehrere Tage als „von – bis".
 * [formatDate] bekommt das Datumsformat der Sprache (`t('format.date')`) von außen.
 */
export const formatEventDateRange = (
    {from, to}: EventDateWindow,
    formatDate: (date: Date) => string,
): string | null => {
    const parse = (value: string | null | undefined) => {
        if (!value) return null
        const date = parseISO(value)
        return isValid(date) ? date : null
    }
    const start = parse(from) ?? parse(to)
    const end = parse(to) ?? start
    if (!start || !end) return null
    const startText = formatDate(start)
    const endText = formatDate(end)
    return startText === endText ? startText : `${startText} – ${endText}`
}
