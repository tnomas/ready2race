import {StreamPlacement} from '@api/types.gen'
import {failedLabel} from '@utils/matchResultStatus.ts'

/**
 * Reine Layout-Entscheidungen der Stream-Grafiken — ohne React, damit die Regeln einzeln
 * prüfbar bleiben. Grundgedanke: Eine Grafik richtet ihr Zeilenlayout nach der Feldgröße,
 * statt ein zu volles Feld per Maßstab in eine feste Höhe zu schrumpfen (das ließ volle Felder
 * klein und gequetscht aussehen). `FitToHeight` bleibt nur noch als letztes Netz dahinter.
 */

/** Formfamilie einer Grafik, abgeleitet vom Platz: Band (Lower Third), Tafel (Vollbild), Seitenleiste, Platte. */
export type StreamForm = 'band' | 'board' | 'side' | 'plate'

export const formForPlacement = (placement: StreamPlacement): StreamForm => {
    switch (placement) {
        case 'FULL_CENTER':
            return 'board'
        case 'SIDE_LEFT':
        case 'SIDE_RIGHT':
            return 'side'
        case 'TOP_LEFT':
        case 'TOP_RIGHT':
            return 'plate'
        default:
            return 'band'
    }
}

/** Zweizeilige Bootszeile (Verein + Besatzung untereinander) oder eine Zeile (Besatzung hinter dem Verein). */
export type StreamRowMode = 'stacked' | 'line'

/** Bis zu so vielen Booten bleibt ein Band zweizeilig — darüber würde es höher als ein Drittel der Bühne. */
export const BAND_STACKED_MAX = 4

export const bandRowMode = (boatCount: number): StreamRowMode =>
    boatCount <= BAND_STACKED_MAX ? 'stacked' : 'line'

/** Bis zu so vielen Booten bleibt eine Tafel einspaltig. */
export const BOARD_SINGLE_COLUMN_MAX = 8

/** Bis zu so vielen Booten bleiben die Zeilen der Tafel zweizeilig (zwei Spalten à acht). */
export const BOARD_STACKED_MAX = 16

export interface StreamBoardLayout {
    columns: 1 | 2
    mode: StreamRowMode
}

/**
 * Große Felder auf der Tafel: erst eine zweite Spalte, erst danach einzeilige Zeilen — zwei
 * Spalten mit zweizeiligen Booten tragen 16 Boote in derselben Höhe wie acht einspaltige, zwei
 * einzeilige Spalten dann bis zu 20, ohne dass die Tafel je schrumpfen müsste.
 */
export const boardLayout = (boatCount: number): StreamBoardLayout => ({
    columns: boatCount <= BOARD_SINGLE_COLUMN_MAX ? 1 : 2,
    mode: boatCount <= BOARD_STACKED_MAX ? 'stacked' : 'line',
})

/** Bis zu so vielen Programmzeilen bleibt das Tagesprogramm einspaltig. */
export const SCHEDULE_SINGLE_COLUMN_MAX = 10

export const scheduleColumns = (rowCount: number): 1 | 2 =>
    rowCount <= SCHEDULE_SINGLE_COLUMN_MAX ? 1 : 2

/**
 * Teilt eine Liste spaltenweise auf: Die Leserichtung bleibt „erst links nach unten, dann
 * rechts" — Platz 1–5 links, 6–10 rechts —, und ein Überhang landet in der ersten Spalte.
 * Liefert immer genau `columns` Spalten, damit das Raster stabil bleibt.
 */
export const splitColumns = <T>(items: T[], columns: number): T[][] => {
    const perColumn = Math.ceil(items.length / columns)
    return Array.from({length: columns}, (_, index) =>
        items.slice(index * perColumn, (index + 1) * perColumn),
    )
}

export type StreamStatusTone = 'normal' | 'warning' | 'muted'

export interface StreamBoatStatus {
    text: string
    tone: StreamStatusTone
}

/**
 * Der rechte Wert einer Bootszeile: die Zeit, oder an ihrer Stelle der Status (DNF/DNS/DSQ aus
 * dem Ausscheidungsgrund, sonst der Rückfalltext) bzw. eine Abmeldung. Die Abmeldung steht vor
 * allem anderen — sie sagt, dass dieses Boot nicht fährt, und ist kein Ergebnis. `null` ohne
 * jeden Wert (Aufstellung vor dem Start).
 */
export const boatStatus = (
    team: {
        failed: boolean
        failedReason?: string | null
        deregistered: boolean
        timeString?: string | null
    },
    labels: {failed: string; deregistered: string},
): StreamBoatStatus | null => {
    if (team.deregistered) return {text: labels.deregistered, tone: 'muted'}
    if (team.failed) return {text: failedLabel(team.failedReason, labels.failed), tone: 'warning'}
    if (team.timeString) return {text: team.timeString, tone: 'normal'}
    return null
}
