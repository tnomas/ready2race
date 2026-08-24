import {StartDisplaySettingsDto} from '@api/types.gen.ts'

/**
 * Die Anzeige-Einstellungen des Startbildschirms auf der Frontend-Seite: Vorgaben und Grenzen,
 * genau die Werte, die das Backend in `TimingStartDisplayLimits` hält.
 *
 * Eigene Datei statt eines Anbaus an `tonePlan.ts`: Dort geht es um Klang (Wellenformen,
 * Hüllkurven, Vorschau-Abspielpläne) — was ein Bildschirm zeigt, hat damit nichts zu tun, und die
 * beiden Themen teilen keine einzige Hilfsfunktion. Sie landen nur deshalb im selben Formular,
 * weil beides Einstellungen derselben Veranstaltung sind.
 *
 * Warum die Grenzen hier NOCH einmal stehen, obwohl der Service sie erzwingt: Das Formular soll
 * den Fehler am Feld zeigen, während getippt wird, statt erst beim Speichern einen 422er
 * einzufangen. Die Zahlen müssen deshalb mit dem Backend übereinstimmen — dieselbe bewusste
 * Doppelung wie bei den Tongrenzen.
 */

/** Skalen sind Faktoren auf die eingebaute Größe: 0.5 = halb so groß, 3.0 = dreifach. */
export const START_DISPLAY_SCALE_MIN = 0.5
export const START_DISPLAY_SCALE_MAX = 3.0

/** 0 folgende Boote heißt „nur das aktuelle Boot" und ist ein gültiger Wunsch, kein leeres Feld. */
export const START_DISPLAY_FOLLOWING_MIN = 0
export const START_DISPLAY_FOLLOWING_MAX = 20

/**
 * Die eingebauten Vorgaben — bewusst das, was der Bildschirm ohne jede Einstellung zeigen soll,
 * nicht das, was er bis zum 24.08.2026 zeigte: Startnummer, Bootsname und Verein an, Position und
 * Athletennamen aus, alles in eingebauter Größe, fünf folgende Boote.
 *
 * Dieselben Werte hält das Backend in `TimingStartDisplayLimits.DEFAULT` und liefert sie über
 * GET /timing/settings aufgelöst aus. Hier werden sie zweimal gebraucht: als Anfangsstand des
 * Hooks, bevor der erste Fetch zurück ist (`useTimingSettings`), und als Vergleichswert des
 * Formulars, das eine unangetastete Einstellung wieder als „nicht gesetzt" speichern können soll.
 */
export const DEFAULT_START_DISPLAY: StartDisplaySettingsDto = {
    showPosition: false,
    showStartNumber: true,
    showTeamName: true,
    showClubName: true,
    showAthleteNames: false,
    clockScale: 1,
    countdownScale: 1,
    listScale: 1,
    followingCount: 5,
}

/** Liegt der Block auf den Vorgaben? Dann speichert das Formular `null` statt eines Eigenwerts. */
export function isDefaultStartDisplay(settings: StartDisplaySettingsDto): boolean {
    return (
        settings.showPosition === DEFAULT_START_DISPLAY.showPosition &&
        settings.showStartNumber === DEFAULT_START_DISPLAY.showStartNumber &&
        settings.showTeamName === DEFAULT_START_DISPLAY.showTeamName &&
        settings.showClubName === DEFAULT_START_DISPLAY.showClubName &&
        settings.showAthleteNames === DEFAULT_START_DISPLAY.showAthleteNames &&
        settings.clockScale === DEFAULT_START_DISPLAY.clockScale &&
        settings.countdownScale === DEFAULT_START_DISPLAY.countdownScale &&
        settings.listScale === DEFAULT_START_DISPLAY.listScale &&
        settings.followingCount === DEFAULT_START_DISPLAY.followingCount
    )
}
