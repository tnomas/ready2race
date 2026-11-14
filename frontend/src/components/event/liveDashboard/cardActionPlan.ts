import {LiveDashboardMatchState} from '@api/types.gen.ts'
import {matchControls} from './common.ts'

/** Mindesthöhe der Schalter am Steg: mit dem Daumen, oft mit Handschuh oder nassen Fingern. */
export const TOUCH_TARGET_PX = 48

/** Die Handlungen, die eine Lauf-Karte des Schiedsrichter-Dashboards anbieten kann. */
export type CardActionId =
    | 'activate'
    | 'deactivate'
    | 'markStarted'
    | 'finish'
    | 'clarify'
    | 'resolveClarification'

/**
 * Wie die Karte ihre Knöpfe anordnet: höchstens EINE Primäraktion (groß, gefüllt), daneben bei
 * Bedarf eine gleichwertige Zweitaktion, alles Seltene im flachen ⋮-Menü.
 */
export type CardActionPlan = {
    primary: CardActionId | null
    /** Sichtbar neben der Primäraktion — nur, wo zwei Wege gleich wahrscheinlich sind. */
    secondary: CardActionId[]
    /** Seltene Handlungen in fester Reihenfolge; das Menü erscheint nur, wenn sie nicht leer ist. */
    menu: CardActionId[]
}

type Controls = ReturnType<typeof matchControls>

/**
 * Welche Handlung je Zustand der nächste übliche Schritt ist. Der Zustand selbst kommt fertig
 * abgeleitet aus dem Backend (`LiveDashboardMatchDto.state`), die Verfügbarkeit aus
 * `matchControls` — hier wird nur sortiert, nichts neu entschieden:
 * - anstehend / ohne Startzeit → an den Start rufen („Lauf aktivieren")
 * - in Vorbereitung → „Läuft"
 * - läuft / wartet auf Beenden → „Lauf beenden"
 * - in Klärung → „Lauf beenden" (die Freigabe), sonst „Klärung aufheben"
 * - beendet / abgesagt → keine Primäraktion
 */
const PRIMARY_BY_STATE: Record<LiveDashboardMatchState, CardActionId[]> = {
    UPCOMING: ['activate'],
    UNSCHEDULED: ['activate'],
    PREPARING: ['markStarted', 'finish'],
    RUNNING: ['finish'],
    AWAITING_FINISH: ['finish'],
    CLARIFICATION: ['finish', 'resolveClarification'],
    FINISHED: [],
    SKIPPED: [],
}

/** Reihenfolge im ⋮-Menü: erst die fachliche Ausnahme (Klärung), dann der Notfall-Schalter. */
const MENU_ORDER: CardActionId[] = [
    'markStarted',
    'finish',
    'clarify',
    'resolveClarification',
    'activate',
    'deactivate',
]

export const cardActionPlan = (
    state: LiveDashboardMatchState,
    controls: Controls,
): CardActionPlan => {
    const activated = state === 'RUNNING' || state === 'PREPARING'
    const available = new Set<CardActionId>()
    if (controls.showActivationToggle) available.add(activated ? 'deactivate' : 'activate')
    if (controls.showMarkStarted) available.add('markStarted')
    if (controls.showFinish) available.add('finish')
    if (controls.showClarify) available.add('clarify')
    if (controls.showResolveClarification) available.add('resolveClarification')

    const candidates = PRIMARY_BY_STATE[state].filter(id => available.has(id))
    const primary = candidates[0] ?? null
    // Die zweite Kandidatin des Zustands bleibt sichtbar: in Vorbereitung lässt sich ein Lauf,
    // dessen Ergebnis schon vorliegt, direkt beenden; in Klärung sind Freigabe und Aufheben die
    // beiden gleichwertigen Ausgänge.
    const secondary = candidates.slice(1)
    const shown = new Set<CardActionId>([...candidates])
    const menu = MENU_ORDER.filter(id => available.has(id) && !shown.has(id))
    return {primary, secondary, menu}
}
