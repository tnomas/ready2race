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
