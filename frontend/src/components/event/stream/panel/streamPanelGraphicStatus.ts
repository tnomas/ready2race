import {StreamOverrideState} from '@api/types.gen'

export type StreamPanelGraphicStatus = 'onAir' | 'ready' | 'off'

/**
 * Der Zustandspunkt einer Karte im Kontroll-Panel.
 *
 * „on air" ist rein `visible` aus dem gepushten Stand — die einzige Quelle, die zählt, der
 * Server hat Regie, Platzkonflikt (Regel 4 des Resolvers) und Automatik längst verrechnet.
 * „aus" gilt NUR bei FORCED_OFF: Das ist die einzige bewusste Regie-Entscheidung, ein Bild
 * abzuschalten. Ein FORCED_ON, das den Platzkonflikt gerade verliert (z. B. RESULT schlägt LAPS
 * auf demselben Platz), bleibt dagegen „bereit" — es kann im nächsten Push jederzeit gewinnen,
 * „aus" wäre hier irreführend.
 */
export const graphicStatus = (graphic: {
    visible: boolean
    overrideState: StreamOverrideState
}): StreamPanelGraphicStatus => {
    if (graphic.visible) return 'onAir'
    if (graphic.overrideState === 'FORCED_OFF') return 'off'
    return 'ready'
}
