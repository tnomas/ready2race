/**
 * Wacht darüber, wann ein stehengebliebener Stand als veraltet gilt.
 *
 * Warum das nicht einfach beim Rendern ausgerechnet wird: Die Warnung hing genau daran — an
 * `Date.now() - lastUpdated > Schwelle`, ausgewertet im Rendern der Anzeige. Nach dem ersten
 * fehlgeschlagenen Abruf rendert aber nichts mehr. Der Takter meldet bei jedem weiteren
 * Fehlversuch denselben Zustand, React verwirft ein Setzen auf den unveränderten Wert, und in
 * den betroffenen Anzeigen tickt keine Uhr, die von sich aus neu rendert. Die Bedingung wurde
 * also nur ein einziges Mal geprüft — eine Aktualisierung nach dem Fehlversuch, also lange vor
 * der Schwelle — und blieb danach für immer auf „frisch".
 *
 * Deshalb schlägt die Schwelle hier von selbst zu, mit einem eigenen Zeitgeber, und meldet die
 * Umschaltung nach außen.
 *
 * Bewusst ohne React: Das Frontend prüft mit Vitest im Node-Umfeld, ohne DOM und ohne
 * Rendering-Bibliothek — dieselbe Aufteilung wie bei [createPoller] in `polling.ts`. Stünde die
 * Logik im Hook, wäre sie ungeprüft, und der Fehler oben ist genau in dieser Lücke entstanden.
 */

export type StaleWatchOptions = {
    /** Wird nur bei einer echten Umschaltung gerufen, nicht bei jeder Meldung. */
    onStale: (stale: boolean) => void
}

export type StaleWatch = {
    /**
     * Ein Abruf ist geglückt: der Stand ist frisch, eine laufende Warnung fällt weg.
     *
     * Die Schwelle kommt mit dem Stand statt aus der Erzeugung, weil sie am Takt hängt, den der
     * Server vorgibt — und der kann sich von Antwort zu Antwort ändern.
     */
    markFresh: (thresholdMs: number) => void
    /** Ein Abruf ist fehlgeschlagen: ab jetzt läuft die Schwelle gegen den letzten guten Stand. */
    markFailed: () => void
    /** Hält den Zeitgeber an; danach wird nichts mehr gemeldet. */
    stop: () => void
}

export const createStaleWatch = ({onStale}: StaleWatchOptions): StaleWatch => {
    let freshAt: number | null = null
    let thresholdMs = 0
    let stale = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const clearTimer = () => {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    const report = (value: boolean) => {
        if (stale === value) return
        stale = value
        onStale(value)
    }

    return {
        markFresh: (nextThresholdMs: number) => {
            if (stopped) return
            freshAt = Date.now()
            thresholdMs = nextThresholdMs
            clearTimer()
            report(false)
        },
        markFailed: () => {
            if (stopped) return
            // Ohne je einen guten Stand gibt es nichts, was veralten könnte: die Anzeige trägt
            // dann ihre eigene Fehlermeldung ("noch nichts gewusst"), nicht diese Warnung.
            if (freshAt === null || stale) return
            // Die Schwelle zählt ab dem letzten guten Stand, nicht ab diesem Fehlversuch —
            // sonst schöbe jeder weitere Fehlversuch die Warnung vor sich her.
            const remaining = freshAt + thresholdMs - Date.now()
            clearTimer()
            if (remaining <= 0) {
                report(true)
                return
            }
            timer = setTimeout(() => {
                timer = null
                report(true)
            }, remaining)
        },
        stop: () => {
            stopped = true
            clearTimer()
        },
    }
}
