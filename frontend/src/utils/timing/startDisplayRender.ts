import {StartDisplaySettingsDto, TimingTeamDto} from '@api/types.gen.ts'
import {START_DISPLAY_SCALE_MAX, START_DISPLAY_SCALE_MIN} from '@utils/timing/startDisplay.ts'
import {teamLabel} from '@utils/timing/teamLabel.ts'

/**
 * Wie der Startbildschirm (Zeitnahme) seine Anzeige-Einstellungen in konkrete Darstellung
 * übersetzt: die Beschriftung eines Bootes aus den Schaltern und die Schriftgrößen aus den
 * Skalen. Alles hier ist pur und damit ohne DOM testbar — dasselbe Muster wie `teamLabel.ts`
 * (Beschriftung) und `sequenceDisplay.ts` (Zustandsableitung).
 *
 * Bewusst NEBEN `teamLabel()` statt darin: `teamLabel` beschriftet auch das Erfassungsboard, den
 * Zuordnungs-Dialog und die Sequenz-Leiste. Dort gibt es keine Anzeige-Einstellungen, und dort
 * wäre eine Zeile ohne Startnummer ein Rückschritt — die Bedienenden suchen genau danach. Die
 * Schalter gehören also nur dem Bildschirm am Steg, nicht der gemeinsamen Beschriftung.
 *
 * Und bewusst NICHT in `startDisplay.ts`: dort stehen Vorgaben und Grenzen der Einstellungen
 * (geteilt mit dem Einstellungs-Formular), hier steht ihre Auswirkung auf die Anzeige.
 */

/** Trennzeichen zwischen den Bestandteilen einer Bootszeile — wie in `teamLabel`. */
const SEPARATOR = ' · '

/**
 * Die Beschriftung eines Bootes auf dem Startbildschirm, zusammengesetzt aus den eingeschalteten
 * Feldern in fester Reihenfolge: laufende Nummer, Startnummer, Bootsname, Verein, Athletennamen.
 *
 * Die Reihenfolge ist fest und nicht einstellbar, weil sie am Wasser vorgelesen wird: erst die
 * Nummer, mit der der Start aufgerufen wird, dann das Boot, dann woher es kommt. Ein Feld, das
 * eingeschaltet ist, für dieses Boot aber leer bleibt (kein Bootsname, kein Verein), fällt still
 * heraus — sonst stünden Trennpunkte ohne Inhalt in der Zeile.
 *
 * `position` ist die 0-basierte Position in der Sequenz; sie erscheint als „3." nur, wenn
 * `showPosition` an ist. Genau hier saß der am Wasser beobachtete Fehler: die Seite stellte die
 * laufende Nummer fest verdrahtet voran, und weil `teamLabel` bereits `#<Startnummer>` voranstellt,
 * las sich eine Einzelstart-Zeile als „1. #1 · Hochschulrudern Flensburg" — zweimal dieselbe Zahl.
 * Beide Bestandteile sind jetzt Schalter, und die Vorgabe für `showPosition` ist „aus": bei einer
 * Liste in Startreihenfolge trägt die Reihenfolge selbst die Information schon.
 */
export function startDisplayLabel(
    settings: StartDisplaySettingsDto,
    team: TimingTeamDto | undefined,
    fallbackId: string,
    position?: number,
): string {
    const prefix =
        settings.showPosition && position !== undefined ? `${position + 1}. ` : ''
    if (team === undefined) return `${prefix}${fallbackId}`

    const bits: string[] = []
    if (settings.showStartNumber && team.startNumber != null) bits.push(`#${team.startNumber}`)
    if (settings.showTeamName && team.teamName) bits.push(team.teamName)
    if (settings.showClubName && team.clubName) bits.push(team.clubName)
    if (settings.showAthleteNames && team.participantNames.length > 0) {
        bits.push(team.participantNames.join(' / '))
    }
    if (bits.length > 0) return `${prefix}${bits.join(SEPARATOR)}`

    // Nichts übrig: entweder sind alle vier Schalter aus, oder die eingeschalteten Felder sind für
    // dieses Boot leer (eine Nennung ohne Bootsnamen und ohne Verein kommt vor). Eine leere Zeile
    // auf einem Bildschirm, an dem Boote aufgerufen werden, wäre schlimmer als eine Zeile, die
    // eine abgeschaltete Angabe zeigt — deshalb hier der Rückfall auf die gemeinsame
    // Standard-Beschriftung, die ihrerseits bis zur Team-Kennung durchfällt.
    return `${prefix}${teamLabel(team, fallbackId)}`
}

/**
 * Eine Schriftgröße mit dem eingestellten Faktor multiplizieren: aus `clamp(4rem, 24vmin, 18rem)`
 * wird `calc(clamp(4rem, 24vmin, 18rem) * 1.4)`.
 *
 * Bewusst eine Multiplikation des vorhandenen Ausdrucks statt einer festen Punktgröße: die Anzeige
 * läuft vom Telefon am Steg bis zum 27-Zoll-Schirm im Zelt, und jede der eingebauten Größen ist
 * deshalb selbst schon bildschirmabhängig (`clamp`, `vmin`, Breakpoint-Stufen). Eine Einstellung,
 * die das durch einen Absolutwert ersetzt, wäre auf jedem zweiten Gerät falsch; ein Faktor
 * verschiebt die ganze Kurve und lässt die Anpassung an die Bildschirmgröße intakt.
 *
 * Bei Faktor 1 kommt der Ausdruck unverändert zurück — unkonfiguriert zeichnet der Bildschirm
 * damit exakt dieselben Größen wie vorher, ohne dass ein `calc()` dazwischenliegt. Werte außerhalb
 * der Grenzen werden gekappt: der Server erzwingt sie zwar, aber ein Faktor 0 aus einem alten oder
 * kaputten Stand würde die Anzeige unsichtbar machen, und das darf kein Datensatz können.
 */
export function scaledFontSize(base: string, scale: number): string {
    if (!Number.isFinite(scale)) return base
    const clamped = Math.min(
        START_DISPLAY_SCALE_MAX,
        Math.max(START_DISPLAY_SCALE_MIN, scale),
    )
    if (clamped === 1) return base
    return `calc(${base} * ${clamped})`
}
