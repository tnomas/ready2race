/**
 * Reine Zustandsmaschine der Ein-/Ausblendung einer Bandgrafik (`GraphicFrame`) — ohne React,
 * damit sie wie `streamStale.ts` einzeln prüfbar bleibt.
 *
 * `visible` ist das, was der Server gerade meldet (nach der Veraltet-Sperre aus
 * `streamStale.allowsNewlyVisible`, die `GraphicFrame` vorschaltet). `mountedAt` ist der
 * Zeitpunkt, seit dem dieser Wert in seiner jetzigen Fassung gilt — wechselt `visible`, merkt
 * sich `GraphicFrame` den Wechselzeitpunkt neu. `now` treibt den Übergang voran, ohne dass eine
 * neue Nachricht nötig wäre.
 *
 * Wird eine Grafik sichtbar, bleibt sie für die Dauer der Slide+Fade-Animation `entering`,
 * danach `shown`. Verschwindet sie, ist sie erst `leaving` (der Inhalt bleibt für die
 * Ausblenddauer gemountet, siehe `GraphicFrame`) und danach `hidden`.
 */
export type GraphicVisibilityPhase = 'entering' | 'shown' | 'leaving' | 'hidden'

/** Dauer der Slide+Fade-Animation — dieselbe Zahl treibt die CSS-Transition in `GraphicFrame`. */
export const GRAPHIC_TRANSITION_MS = 300

export const visibilityPhase = (
    visible: boolean,
    mountedAt: number,
    now: number,
): GraphicVisibilityPhase => {
    const elapsed = now - mountedAt
    if (visible) return elapsed < GRAPHIC_TRANSITION_MS ? 'entering' : 'shown'
    return elapsed < GRAPHIC_TRANSITION_MS ? 'leaving' : 'hidden'
}

/**
 * Ob eine sichtbare Grafik in einer STÖRUNG (`stale`, kein Lebenszeichen des Kanals) von selbst
 * ablaufen muss: Normalerweise pusht der Server das Ausblenden, sobald `visibleUntil` erreicht
 * ist (`StreamSceneResolver.nextEvaluationAt`) — steht der Kanal, kommt dieser Push nicht, und
 * eine „15 s Startliste" bliebe bis zum Reconnect im Bild. Deshalb zählt die Bühne in der Störung
 * selbst mit, aber NUR dann; ohne Störung bleibt der Server die einzige Wahrheit.
 *
 * `clockOffsetMs` ist `clientNow − serverTime` (gemessen am letzten Rahmen, siehe
 * `StreamScenePage`): das Fensterende der Serveruhr wird damit in die Geräteuhr umgerechnet.
 * Grafiken ohne Fenster (Uhr, Ticker) und ein unlesbares Datum laufen nie ab.
 */
export const expiredWhileStale = (
    stale: boolean,
    visibleUntil: string | null | undefined,
    clockOffsetMs: number,
    nowMs: number,
): boolean => {
    if (!stale || visibleUntil == null) return false
    const untilMs = Date.parse(visibleUntil)
    if (Number.isNaN(untilMs)) return false
    return untilMs + clockOffsetMs < nowMs
}
