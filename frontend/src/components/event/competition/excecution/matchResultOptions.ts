import {TimingSystem} from '@api/types.gen.ts'

/**
 * Das Zeitnahme-System, wie die Durchführung es sieht: der Wert der Veranstaltung, oder 'NONE',
 * solange keiner gesetzt ist. 'NONE' ist kein Backend-Wert (dort ist die Spalte schlicht null),
 * sondern der Stellvertreter, mit dem sich hier ein Fall unterscheiden lässt.
 */
export type ExecutionTimingSystem = TimingSystem | 'NONE'

export const MATCH_RESULT_OPTIONS = ['form', 'XLS', 'RACECLOCKER', 'RACECLOCKER_FILE'] as const
export type MatchResultOption = (typeof MATCH_RESULT_OPTIONS)[number]

/**
 * Welche Wege der Ergebniseingabe ein Lauf anbietet.
 *
 * Bisher waren alle drei fest verdrahtet, auch bei Wettkämpfen, die nie einen RaceClocker-Feed haben.
 * Ist Webscorer gewählt, fallen der Live-Abruf UND der RaceClocker-Datei-Import weg. Ohne gesetztes
 * System bleibt alles stehen — sonst verlöre ein bestehender Wettkampf ohne Zutun eine Funktion.
 *
 * `RACECLOCKER_FILE` ist der Notfallweg zum Live-Abruf (eine heruntergeladene Ergebnis-xlsx) und
 * gehört deshalb an dieselbe Bedingung wie `RACECLOCKER`.
 *
 * Erwartet wird das System der Veranstaltung: Es gilt für alle ihre Wettkämpfe, eine
 * Übersteuerung je Wettkampf gibt es nicht mehr.
 */
export const matchResultOptions = (timingSystem: ExecutionTimingSystem): MatchResultOption[] =>
    timingSystem === 'WEBSCORER'
        ? MATCH_RESULT_OPTIONS.filter(o => o !== 'RACECLOCKER' && o !== 'RACECLOCKER_FILE')
        : [...MATCH_RESULT_OPTIONS]
