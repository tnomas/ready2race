import {AthleteBoardMatch} from '@api/types.gen'

/**
 * Defensive Obergrenze der SCHEDULE-Füllgrafik, unabhängig vom Server: `listLength` ist eine
 * Regie-Einstellung (`StreamGraphicSettings.listLength`, Default 8) und der Server schneidet
 * `schedule` bereits danach zu (`StreamSceneLogic.buildInput`, `upcoming.take(scheduleLength)`).
 * Diese Karte verlässt sich trotzdem nicht blind auf die Serverseite — eine Fehlkonfiguration
 * oder ein veralteter Zwischenstand soll die FULL_CENTER-Karte nie sprengen.
 */
export const MAX_SCHEDULE_ROWS = 20

/**
 * Die tatsächlich gerenderten Zeilen der SCHEDULE-Karte: `schedule` normiert auf ein Array
 * (der Push kann `null`/`undefined` tragen, siehe `StreamGraphicViewDto`) und auf
 * `MAX_SCHEDULE_ROWS` gedeckelt. Reine Funktion, damit die Deckelung ohne Rendern prüfbar ist.
 */
export const scheduleRows = (
    schedule: AthleteBoardMatch[] | null | undefined,
): AthleteBoardMatch[] => (schedule ?? []).slice(0, MAX_SCHEDULE_ROWS)
