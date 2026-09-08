import {StreamRowMode} from './streamLayout.ts'

/**
 * Die Kürzungsleiter der Stream-Grafiken — rein, ohne Messen im DOM, damit sie testbar bleibt
 * und auf Bühne, Panel-Vorschau und Galerie dasselbe Ergebnis liefert. Die Kurzformen (Vereins-
 * Kurzkette, Wettkampfkürzel) sind der Normalfall und kommen bereits vom Server; diese Leiter
 * greift erst, wenn auch die Kurzform zu lang ist:
 *
 * 1. Besatzung: Vornamen zu Initialen („A. Petersen · J. Feddersen"), sobald die Zeile ihr
 *    Zeichenbudget überschreitet — ein Name wird nie abgeschnitten, nur verkürzt.
 * 2. Vereinskette: in den schmalen Formen (Zwischenzeiten-Karte, Einlauf-Leiste) ab drei
 *    Gliedern „A / B +1" — Band und Tafel behalten die volle Kette.
 * 3. Die Ellipse der Zeile bleibt als letztes Netz.
 */

const NAME_SEPARATOR = ' · '
const CHAIN_SEPARATOR = ' / '
const TEAM_NAME_SEPARATOR = ' | '

/**
 * Namenspartikel (klein geschrieben): steht so ein Wort an der Stelle des Vornamens, gibt es
 * keinen Vornamen zu kürzen — der ganze Name ist Nachname („van der Berg").
 */
const NAME_PARTICLES: ReadonlySet<string> = new Set([
    'van', 'von', 'de', 'der', 'den', 'du', 'da', 'di', 'le', 'la', 'zu', 'af', 'av', 'ter', 'ten', 'op', 'het', "'t",
])

/**
 * „Anna Petersen" → „A. Petersen". Wörter mit Punkt am Ende gelten als Präfix (Steuerleute:
 * „St. Kim Lorenzen" → „St. K. Lorenzen") und bleiben stehen. Gekürzt wird NUR das erste Wort
 * dahinter: alles Weitere kann zum Nachnamen gehören — Partikel („Jan van der Berg" →
 * „J. van der Berg") ebenso wie Doppelnamen ohne Bindestrich („Anna Sørensen Lund" →
 * „A. Sørensen Lund"); ein zweiter Vorname bleibt dafür ausgeschrieben, das ist der kleinere
 * Schaden. Ist das erste Wort selbst ein Partikel, bleibt der Name unverändert.
 */
export const abbreviateFirstNames = (names: readonly string[]): string[] =>
    names.map(name => {
        const words = name.trim().split(/\s+/)
        if (words.length < 2) return name
        let firstNameIndex = 0
        while (firstNameIndex < words.length - 1 && words[firstNameIndex].endsWith('.')) firstNameIndex++
        const firstName = words[firstNameIndex]
        if (firstNameIndex >= words.length - 1 || NAME_PARTICLES.has(firstName)) return name
        return [...words.slice(0, firstNameIndex), `${firstName.charAt(0)}.`, ...words.slice(firstNameIndex + 1)].join(' ')
    })

/**
 * Die Namen der Besatzung, so wie sie in ein Zeichenbudget passen: voll, solange die
 * Punkt-Kette nicht länger als das Budget ist, sonst mit Initialen. Als Liste, damit eine
 * umbrechende Form (Einlauf-Leiste) jeden Namen als eigene, unumbrechbare Einheit setzen kann.
 */
export const fitCrewNames = (names: readonly string[], budgetChars: number): string[] => {
    const full = names.join(NAME_SEPARATOR)
    return full.length <= budgetChars ? [...names] : abbreviateFirstNames(names)
}

/** `fitCrewNames` als fertige Punkt-Kette; `null` ohne Besatzung. */
export const fitCrewLine = (names: readonly string[], budgetChars: number): string | null =>
    names.length === 0 ? null : fitCrewNames(names, budgetChars).join(NAME_SEPARATOR)

/** Das Trennzeichen zwischen zwei Namen — für Aufrufer, die die Kette selbst setzen. */
export const CREW_NAME_SEPARATOR = NAME_SEPARATOR

/**
 * Zieht eine Vereinskette „A / B / C / D" auf die ersten `maxLinks` Glieder plus „+n" zusammen.
 * Ein angehängter Teamname („… | Ratzeburg II", siehe `clubLabel`) bleibt am Ende erhalten.
 */
export const collapseClubChain = <T extends string | null | undefined>(chain: T, maxLinks: number): T => {
    if (!chain) return chain
    const [clubs, ...teamName] = chain.split(TEAM_NAME_SEPARATOR)
    const links = clubs.split(CHAIN_SEPARATOR)
    if (links.length <= maxLinks) return chain
    const collapsed = `${links.slice(0, maxLinks).join(CHAIN_SEPARATOR)} +${links.length - maxLinks}`
    return [collapsed, ...teamName].join(TEAM_NAME_SEPARATOR) as T
}

/** Zeichenbudget der zweizeiligen Besatzungszeile (eigene Zeile unter dem Verein), je Spaltenzahl. */
const STACKED_CREW_BUDGET: Record<1 | 2, number> = {1: 110, 2: 56}

/** Zeichenbudget der ganzen einzeiligen Zeile (Verein + Besatzung nebeneinander), je Spaltenzahl,
 *  in Besatzungs-Zeichen gerechnet. */
const LINE_ROW_BUDGET: Record<1 | 2, number> = {1: 140, 2: 62}

/** Der Verein steht fetter und größer als die Besatzung (1,3em zu 1,05em) — ein Vereinszeichen
 *  kostet deshalb rund 1,3 Besatzungszeichen des Zeilenbudgets. */
const CLUB_CHAR_WEIGHT = 1.3

/**
 * Wie viele Zeichen die Besatzung in einer Bootszeile bekommt: zweizeilig ein festes Budget,
 * einzeilig das, was neben dem Verein übrig bleibt. Die Zahlen sind an der Galerie eingestellt
 * (96em-Band / 104em-Tafel, Roboto 1,05em, Vierer mit Steuerleuten neben zwei- und
 * dreigliedrigen Vereinsketten) und leicht knapp — lieber eine Initiale zu früh als ein
 * abgeschnittener Nachname.
 */
export const crewCharBudget = (mode: StreamRowMode, columns: 1 | 2, clubLabel: string): number =>
    mode === 'stacked'
        ? STACKED_CREW_BUDGET[columns]
        : Math.max(0, Math.round(LINE_ROW_BUDGET[columns] - clubLabel.length * CLUB_CHAR_WEIGHT))

/** Ab so vielen Gliedern zieht die Einlauf-Leiste (34em) die Vereinskette zusammen. */
export const TICKER_CHAIN_MAX_LINKS = 2

/** Die Zwischenzeiten-Karte ist die schmalste Form — dort bleibt nur das erste Glied stehen. */
export const LAPS_CHAIN_MAX_LINKS = 1

/** Zeichenbudget der Besatzung in der Einlauf-Leiste: zwei Zeilen à rund 35 Zeichen (Roboto 0,95em),
 *  die Leiste wächst ohnehin je Einlauf und darf die Besatzung auf zwei Zeilen umbrechen. */
export const TICKER_CREW_BUDGET = 70
