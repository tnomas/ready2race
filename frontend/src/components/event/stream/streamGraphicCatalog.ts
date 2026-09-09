import {StreamGraphicSize, StreamGraphicType, StreamPlacement, StreamSceneGraphicDto} from '@api/types.gen'

/**
 * Erlaubte Plätze je Grafiktyp — Spiegel von `allowedPlacements` in
 * `backend/.../stream/entity/StreamEnums.kt`. Quelle der Wahrheit bleibt der Server: Er lehnt
 * `updateStreamSceneGraphics` komplett ab, sobald AUCH NUR EINE Zeile einen nicht erlaubten
 * Platz trägt (siehe `StreamSceneService.updateGraphics`). Diese Konstante verhindert nur, dass
 * die Maske überhaupt einen verbotenen Platz anbietet — sie muss von Hand nachgezogen werden,
 * falls sich die Backend-Zuordnung ändert.
 */
export const ALLOWED_PLACEMENTS: Record<StreamGraphicType, StreamPlacement[]> = {
    STARTLIST: ['BOTTOM_CENTER', 'BOTTOM_LEFT', 'BOTTOM_RIGHT', 'FULL_CENTER'],
    CLOCK: ['TOP_RIGHT', 'TOP_LEFT'],
    LAPS: ['BOTTOM_CENTER', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'],
    RESULT: ['BOTTOM_CENTER', 'FULL_CENTER'],
    FINISH_TICKER: ['SIDE_RIGHT', 'SIDE_LEFT'],
    NEXT_UP: ['BOTTOM_CENTER', 'BOTTOM_LEFT', 'BOTTOM_RIGHT'],
    SCHEDULE: ['FULL_CENTER'],
    COURSE_IMAGE: ['FULL_CENTER'],
}

/** Alle acht Grafiktypen in fester Reihenfolge — dieselbe wie die generierte Union. */
export const STREAM_GRAPHIC_TYPES: StreamGraphicType[] = [
    'STARTLIST',
    'CLOCK',
    'LAPS',
    'RESULT',
    'FINISH_TICKER',
    'NEXT_UP',
    'SCHEDULE',
    'COURSE_IMAGE',
]

/** LAPS/RESULT/STARTLIST: Einblenddauer in Sekunden ist einstellbar. */
export const usesDisplaySeconds = (type: StreamGraphicType): boolean =>
    type === 'LAPS' || type === 'RESULT' || type === 'STARTLIST'

/** SCHEDULE: Anzahl gezeigter Zeilen ist einstellbar. */
export const usesListLength = (type: StreamGraphicType): boolean => type === 'SCHEDULE'

/** COURSE_IMAGE: Bildwahl über ein hinterlegtes Event-Dokument. */
export const usesImageDocument = (type: StreamGraphicType): boolean => type === 'COURSE_IMAGE'

/**
 * STARTLIST/RESULT/FINISH_TICKER: die einzigen drei Typen, die den Material-Schalter zeigen
 * (Materialvermietung, Task 6.5) - CLOCK/NEXT_UP/SCHEDULE/COURSE_IMAGE haben keine Bootszeile,
 * an der ein Materialhinweis stehen könnte, und LAPS reicht `showMaterial` nicht weiter
 * (StreamLapsBand zeigt kein Material) - der Schalter wäre dort ohne Wirkung.
 */
export const usesMaterialToggle = (type: StreamGraphicType): boolean =>
    type === 'STARTLIST' || type === 'RESULT' || type === 'FINISH_TICKER'

/** Vorbelegte Einblenddauer, wenn ein Typ noch nie konfiguriert wurde (Kommentare in StreamSceneGraphicDtos.kt). */
const DEFAULT_DISPLAY_SECONDS: Partial<Record<StreamGraphicType, number>> = {
    STARTLIST: 15,
    LAPS: 8,
    RESULT: 20,
}

const DEFAULT_LIST_LENGTH = 8

const DEFAULT_SIZE: StreamGraphicSize = 'NORMAL'

/** Frische Zeile für einen noch nicht konfigurierten Typ — deaktiviert, mit sinnvollen Vorgaben. */
export const defaultGraphicRow = (type: StreamGraphicType): StreamSceneGraphicDto => ({
    type,
    enabled: false,
    placement: ALLOWED_PLACEMENTS[type][0],
    size: DEFAULT_SIZE,
    settings: {
        displaySeconds: usesDisplaySeconds(type) ? DEFAULT_DISPLAY_SECONDS[type] : null,
        listLength: usesListLength(type) ? DEFAULT_LIST_LENGTH : null,
        imageDocument: null,
        showMaterial: usesMaterialToggle(type) ? false : null,
    },
})

/**
 * Ergänzt eine (ggf. unvollständige) Zeilenliste einer Szene auf alle acht Typen, in fester
 * Reihenfolge — der Konfigurationsdialog zeigt immer alle acht, unabhängig davon, ob der Server
 * für einen Typ bereits eine Zeile angelegt hat (`createStreamScene` legt anfangs GAR KEINE
 * Grafikzeilen an).
 */
export const withAllGraphicTypes = (graphics: StreamSceneGraphicDto[]): StreamSceneGraphicDto[] =>
    STREAM_GRAPHIC_TYPES.map(type => graphics.find(g => g.type === type) ?? defaultGraphicRow(type))
