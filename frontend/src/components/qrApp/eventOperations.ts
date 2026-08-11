/**
 * Welche Veranstaltungen die Helfer-App gerade zur Wahl stellt.
 *
 * Die App bot bis zum 11.08.2026 jede jemals angelegte Veranstaltung als gleich aussehenden Knopf
 * an, nur mit dem Namen. Prompt wurde bei der Bandvergabe die Regatta von 2025 erwischt, und weil
 * die Wahl danach in der App-Sitzung sitzt, galt sie für jede weitere Zuordnung mit.
 *
 * Bewusst ohne React und ohne Abruf: Das Frontend prüft mit Vitest im Node-Umfeld, ohne DOM und
 * ohne Rendering-Bibliothek — dieselbe Aufteilung wie bei `polling.ts` und `staleWatch.ts`. Die
 * Auswahlseite bleibt reine Darstellung.
 *
 * Warum die Entscheidung überhaupt hier und nicht im Server fällt: Die App legt ihre
 * Veranstaltungsliste für den Offline-Betrieb ab (siehe `AppSessionContext`). Ein serverseitig
 * berechnetes „läuft gerade" wäre aus dem Zwischenspeicher am nächsten Morgen falsch —
 * schlimmstenfalls eine über Nacht gespeicherte leere Liste. Datumsangaben altern nicht.
 */

export type EventOperationWindow = {
    /**
     * Beginn des Vor-Ort-Betriebs über alle Tage hinweg; der Server hat den Rückfall auf den
     * Tagesbeginn schon eingerechnet. Fehlt bei einer Veranstaltung ohne Tage.
     */
    operationsStartsAt?: string
    /** Letzter Veranstaltungstag als `YYYY-MM-DD`. Fehlt bei einer Veranstaltung ohne Tage. */
    lastEventDay?: string
}

/**
 * Ein reines Datum (`YYYY-MM-DD`) als Mitternacht in der Zone des Geräts.
 *
 * Nicht `new Date(isoDate)`: Das liest ein reines Datum als UTC und liegt hierzulande damit auf
 * dem Vortag um 22 Uhr. Der Monat ist bei der Bestandteil-Schreibweise nullbasiert — genau die
 * Stelle, an der beim Bauen dieser Seite schon einmal ein Monat verrutscht ist.
 */
export const parseEventDay = (isoDate: string): Date | null => {
    const [year, month, day] = isoDate.split('-').map(Number)
    if (!year || !month || !day) return null
    const date = new Date(year, month - 1, day)
    return Number.isNaN(date.getTime()) ? null : date
}

/** Das Ende des Fensters: der Ablauf des letzten Veranstaltungstages, also Mitternacht danach. */
const endOfDayExclusive = (isoDate: string): number | null => {
    const start = parseEventDay(isoDate)
    if (start === null) return null
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime()
}

const startOfWindow = (isoDateTime: string): number | null => {
    const time = new Date(isoDateTime).getTime()
    return Number.isNaN(time) ? null : time
}

/**
 * Läuft an dieser Veranstaltung gerade der Vor-Ort-Betrieb?
 *
 * Ein einziges Fenster über die ganze Regatta, kein Fenster je Tag: Wer abends zwischen zwei
 * Renntagen noch Bänder zuordnet, würde sonst ausgesperrt.
 */
export const isOperating = (event: EventOperationWindow, now: Date): boolean => {
    if (!event.operationsStartsAt || !event.lastEventDay) return false

    const start = startOfWindow(event.operationsStartsAt)
    const end = endOfDayExclusive(event.lastEventDay)
    if (start === null || end === null) return false

    const time = now.getTime()
    return time >= start && time < end
}

export type SplitEvents<T> = {
    /** Im Betrieb, nach Beginn aufsteigend — was zuerst angefangen hat, steht oben. */
    operating: T[]
    /**
     * Alles Übrige, jüngster Tag zuerst. Diese Liste ist eine Suchliste: Was zuletzt war oder als
     * Nächstes kommt, ist eher gemeint als eine Regatta von vor drei Jahren. Veranstaltungen ohne
     * Tage tragen kein Datum und landen am Ende.
     */
    others: T[]
}

export const splitEventsByOperation = <T extends EventOperationWindow>(
    events: T[],
    now: Date,
): SplitEvents<T> => {
    const operating: T[] = []
    const others: T[] = []

    for (const event of events) {
        if (isOperating(event, now)) {
            operating.push(event)
        } else {
            others.push(event)
        }
    }

    operating.sort(
        (a, b) =>
            (startOfWindow(a.operationsStartsAt!) ?? 0) -
            (startOfWindow(b.operationsStartsAt!) ?? 0),
    )
    others.sort((a, b) => {
        // Ohne Tag gibt es nichts zu vergleichen; solche Einträge sinken ans Ende, statt die
        // Reihenfolge der übrigen durcheinanderzubringen.
        const dayA = a.lastEventDay ? endOfDayExclusive(a.lastEventDay) : null
        const dayB = b.lastEventDay ? endOfDayExclusive(b.lastEventDay) : null
        if (dayA === null && dayB === null) return 0
        if (dayA === null) return 1
        if (dayB === null) return -1
        return dayB - dayA
    })

    return {operating, others}
}
