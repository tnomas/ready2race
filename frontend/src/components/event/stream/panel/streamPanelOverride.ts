import {StreamGraphicType, StreamOverrideRequest, StreamOverrideState} from '@api/types.gen'

/** Dauer-Wahl der Regie beim Erzwingen — „bis auf Widerruf" trägt keinen Auto-Out. */
export type StreamPanelDurationChoice = 'UNTIL_REVOKED' | 10 | 20 | 30

export const STREAM_PANEL_DURATION_CHOICES: StreamPanelDurationChoice[] = [
    'UNTIL_REVOKED',
    10,
    20,
    30,
]

/**
 * Sekunden für den Server — „bis auf Widerruf" heißt `null` (kein Auto-Out zurück zu AUTO),
 * siehe `StreamOverrideRequest.seconds`.
 */
export const durationChoiceSeconds = (choice: StreamPanelDurationChoice): number | null =>
    choice === 'UNTIL_REVOKED' ? null : choice

/**
 * Nur diese drei Inhaltsgrafiken bekommen im Panel einen Lauf-Wähler. CLOCK/LAPS hängen an der
 * laufenden Zeitnahme selbst (kein sinnvoller "zeig Lauf X"-Bezug), FINISH_TICKER/SCHEDULE/
 * COURSE_IMAGE kennen gar keinen Einzellauf-Bezug.
 */
const GRAPHIC_TYPES_WITH_MATCH_PICKER: ReadonlySet<StreamGraphicType> = new Set<StreamGraphicType>(
    ['STARTLIST', 'RESULT', 'NEXT_UP'],
)

export const graphicUsesMatchPicker = (type: StreamGraphicType): boolean =>
    GRAPHIC_TYPES_WITH_MATCH_PICKER.has(type)

/**
 * Baut exakt den Rumpf, den `setStreamOverride` erwartet. FORCED_OFF trägt bewusst weder Lauf
 * noch Dauer — ein abgeschaltetes Bild kennt keinen Inhalt und keinen Auto-Out.
 */
export const buildOverrideRequest = (
    state: Exclude<StreamOverrideState, 'AUTO'>,
    matchId: string | null,
    duration: StreamPanelDurationChoice,
): StreamOverrideRequest =>
    state === 'FORCED_OFF'
        ? {state: 'FORCED_OFF'}
        : {state: 'FORCED_ON', match: matchId, seconds: durationChoiceSeconds(duration)}
