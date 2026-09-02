import {StreamGraphicType, StreamGraphicViewDto} from '@api/types.gen'
import {hasGraphicContent} from '../graphics/retainGraphicContent.ts'

export type StreamFeedStatus = 'onAir' | 'ready' | 'off' | 'noFeed'

/**
 * Warum eine Grafik gerade nichts zu zeigen hat — je Typ die eine Frage, die die Regie sich
 * stellt („Warum kommt kein Ergebnis?"). `unresolved`: die Regie hat einen Lauf erzwungen, den
 * es an dieser Grafik nicht gibt (siehe `StreamSceneResolver.overrideContentUnresolved`).
 */
export type StreamNoFeedReason =
    | 'noPreparing'
    | 'noRunning'
    | 'noSplit'
    | 'noResult'
    | 'noFinish'
    | 'noSchedule'
    | 'noImage'
    | 'unresolved'

export type StreamGraphicFeed = {status: 'onAir' | 'ready' | 'off'} | {status: 'noFeed'; reason: StreamNoFeedReason}

const EMPTY_REASON: Record<StreamGraphicType, StreamNoFeedReason> = {
    STARTLIST: 'noPreparing',
    NEXT_UP: 'noPreparing',
    CLOCK: 'noRunning',
    LAPS: 'noRunning',
    RESULT: 'noResult',
    FINISH_TICKER: 'noFinish',
    SCHEDULE: 'noSchedule',
    COURSE_IMAGE: 'noImage',
}

/**
 * Der Zustand einer Grafik für die Regie-Karte, rein aus dem gepushten Stand:
 *
 * - `off`: FORCED_OFF — die einzige bewusste Entscheidung, ein Bild abzuschalten; sie gilt auch
 *   ohne Inhalt, die Regie soll ihre eigene Schaltung wiedererkennen.
 * - `noFeed`: kein Inhalt im Stand (`hasGraphicContent`), mit dem Grund je Typ — „An" wäre
 *   hier wirkungslos, die Karte sagt stattdessen, was fehlt. Geht `visible` VOR: Der Server
 *   schaltet ein Streckenbild ohne hinterlegtes Bild oder ein Tagesprogramm ohne Läufe
 *   durchaus „sichtbar", die Bühne zeigt dann aber nichts — für die Regie ist das kein „on
 *   air", sondern genau der Fall, den sie erfahren will. Das Rundenband zählt zusätzlich einen
 *   laufenden Lauf OHNE Marke als „keine Zwischenzeit".
 * - `onAir`: `visible` mit Inhalt — der Server hat Regie, Platzkonflikt und Automatik verrechnet.
 * - `ready`: Inhalt da, Automatik blendet gerade nicht ein (oder verliert den Platzkonflikt).
 */
export const graphicFeed = (graphic: StreamGraphicViewDto): StreamGraphicFeed => {
    if (graphic.overrideState === 'FORCED_OFF') return {status: 'off'}
    if (!hasGraphicContent(graphic)) {
        return {
            status: 'noFeed',
            reason: graphic.overrideState === 'FORCED_ON' ? 'unresolved' : EMPTY_REASON[graphic.type],
        }
    }
    if (graphic.type === 'LAPS' && !graphic.match?.teams.some(team => (team.laps?.length ?? 0) > 0)) {
        return {status: 'noFeed', reason: 'noSplit'}
    }
    if (graphic.visible) return {status: 'onAir'}
    return {status: 'ready'}
}
