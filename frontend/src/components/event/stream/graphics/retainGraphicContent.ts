import {StreamGraphicViewDto} from '@api/types.gen'

/**
 * Ob ein Push für diese Grafik überhaupt eine Inhalts-Nutzlast trägt — je Typ ist genau eines
 * der Felder belegt (`match`/`result`/`finishEntries`/`schedule`/`imageUrl`), siehe
 * `StreamGraphicViewDto`. Leere Arrays zählen NICHT als Inhalt, sonst bliebe eine Grafik mit
 * `finishEntries: []` fälschlich "hat Inhalt".
 */
export const hasGraphicContent = (graphic: StreamGraphicViewDto): boolean =>
    graphic.match != null ||
    graphic.result != null ||
    (graphic.finishEntries != null && graphic.finishEntries.length > 0) ||
    (graphic.schedule != null && graphic.schedule.length > 0) ||
    graphic.imageUrl != null

/**
 * Fängt einen Sonderfall des Resolvers ab: `match`/`result` leiten sich aus DEMSELBEN
 * Renn-Zustand ab wie `visible` (`input.preparing`/`input.running`, siehe
 * `StreamSceneResolver.autoFor`) — endet der vorbereitete/laufende Lauf, können `visible` UND
 * die Inhalts-Nutzlast im SELBEN Push wegfallen (z. B. Sequenzstart mitten im
 * 15-s-Startlisten-Fenster, oder ein Laufende mitten im 8-s-Rundenfenster). Ohne diese
 * Rückfall-Übernahme müsste `GraphicFrame` seine Ausblendanimation ohne Inhalt fahren — die
 * Grafik poppt einfach ab, statt zu verschwinden.
 *
 * Reine Funktion: `current` ist der jüngste Push, `previous` der zuletzt gerenderte Stand
 * DIESER Grafik (null beim allerersten Aufruf, oder wenn der vorige Stand selbst schon keinen
 * Inhalt trug). Trägt `current` schon Inhalt, kommt er unverändert zurück — genauso, wenn kein
 * verwertbarer vorheriger Stand da ist oder der zu einem ANDEREN Grafik-Typ gehört (eine
 * Typ-Änderung ist eine Konfigurationsänderung, kein Ausblenden). `visible`, `visibleSince`,
 * `visibleUntil` und `overrideState` kommen IMMER vom aktuellen Push — `GraphicFrame` blendet
 * anhand von `visible` aus, nicht anhand des Inhalts; nur die Inhaltsfelder fallen zurück.
 */
export const retainGraphicContent = (
    current: StreamGraphicViewDto,
    previous: StreamGraphicViewDto | null,
): StreamGraphicViewDto => {
    if (hasGraphicContent(current)) return current
    if (previous === null || previous.type !== current.type || !hasGraphicContent(previous)) {
        return current
    }

    return {
        ...current,
        match: previous.match,
        result: previous.result,
        provisional: previous.provisional,
        finishEntries: previous.finishEntries,
        schedule: previous.schedule,
        imageUrl: previous.imageUrl,
    }
}
