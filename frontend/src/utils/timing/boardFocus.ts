import {TimingMatchDto, TimingMatchTeamDto, TimingModeDto} from '@api/types.gen.ts'

/**
 * Reine Fokus-Logik des Zielpostens: welche Partie die Tasten treffen, wohin der Fokus nach
 * Fertigstellung vorrückt und wie Tab durch die laufenden Partien wandert. Herausgezogen wie
 * `matchBoard.ts`, damit sie ohne DOM testbar bleibt.
 */

export type FinishKeyTarget = {
    teamId: string
    /** An diesem Lauf bereits im Ziel — die Taste verpufft dann (kein Doppelstempel). */
    finished: boolean
}

/**
 * Die Tastenbelegung des Zielpostens: welche Taste welches Boot trifft, in Positionsreihenfolge.
 * Zwei Reihen, weil man je nach Tastatur greift, was näher liegt; `secondary === null` heißt „es
 * gibt keine zweite Reihe".
 */
export type BoatKeyLayout = {
    primary: string
    secondary: string | null
}

/**
 * Der Ausschnitt des Zeitnahmetyps, aus dem die Belegung besteht. Bewusst nur diese zwei Felder
 * statt des ganzen [TimingModeDto]: Was diese Datei nicht liest, soll sie auch nicht verlangen.
 */
export type TimingModeKeys = Pick<TimingModeDto, 'boatKeysPrimary' | 'boatKeysSecondary'>

/**
 * Was vor dem 26.08.2026 fest verdrahtet war — jetzt der Rückfall für Läufe ohne Zeitnahmetyp.
 * Ein Lauf ohne Typ ist am Zielposten kein Sonderfall: Er wird erfasst wie jeder andere, nur eben
 * mit der Belegung, die auch die Datenbank als Vorgabe führt.
 */
export const DEFAULT_BOAT_KEYS: BoatKeyLayout = {primary: '123456', secondary: 'ABCDEF'}

/** Die Belegung eines Laufs: die seines Zeitnahmetyps, sonst [DEFAULT_BOAT_KEYS]. */
export function boatKeyLayout(mode: TimingModeKeys | null | undefined): BoatKeyLayout {
    if (mode == null) return DEFAULT_BOAT_KEYS
    return {primary: mode.boatKeysPrimary, secondary: mode.boatKeysSecondary ?? null}
}

/**
 * Der sichtbare Tasten-Hinweis eines Boots: mit der Vorgabebelegung „1/A" an Position 0, „6/F" an
 * Position 5. Wo in einer der beiden Reihen keine Taste liegt, fehlt sie auch im Hinweis; liegt in
 * keiner eine, gibt es gar keinen. Ein Hinweis, der eine Taste verspricht, die nichts tut, schickt
 * den Bediener unter Zeitdruck ins Leere — das ist schlimmer als kein Hinweis.
 */
export function boatKeyHint(keys: BoatKeyLayout, position: number): string | undefined {
    const row = (value: string | null) => (value == null ? undefined : [...value][position])
    const labels = [row(keys.primary), row(keys.secondary)].filter(
        (key): key is string => key !== undefined,
    )
    return labels.length === 0 ? undefined : labels.join('/')
}

/**
 * Die Reihen für den Fließtext des Hilfesatzes: „1 2 3 4 5 6 / A B C D E F", ohne zweite Reihe nur
 * die erste. Auch dieser Satz nannte bis zum 26.08.2026 fest verdrahtete Bereiche und würde sonst
 * Tasten versprechen, die dieser Lauf gar nicht kennt.
 *
 * Die Zeichen stehen mit Abstand: „Taste 123456" liest sich als EINE sechsstellige Taste, „Taste
 * 1 2 3 4 5 6" als die Liste, die es ist.
 */
export function boatKeyRows(keys: BoatKeyLayout): string {
    const row = (value: string) => [...value].join(' ')
    return keys.secondary == null
        ? row(keys.primary)
        : `${row(keys.primary)} / ${row(keys.secondary)}`
}

/**
 * Die Boote einer Partie in Positionsreihenfolge — nach Startnummer. Die EINE Zählung des
 * Zielpostens: An ihr hängen die Tasten ([finishKeyTarget]), die Hinweise an den Booten
 * ([boatKeyHint]) und die Tonleiter je Boot ([boatPosition]). Eine zweite Zählung daneben würde
 * über kurz oder lang von der ersten abweichen, und dann trifft die Taste ein anderes Boot als
 * der Ton meldet.
 */
function boatsByPosition(match: TimingMatchDto): TimingMatchTeamDto[] {
    return [...match.teams].sort((a, b) => a.startNumber - b.startNumber)
}

/**
 * Die Stelle eines Bootes in seiner Partie, 1-basiert und nach Startnummer — dieselbe Stelle, die
 * auch seine Taste trägt. Gebraucht für die Tonhöhe des Erfassungstons (`boatPitch`).
 *
 * Gesucht wird über ALLE gelieferten Partien und nicht nur in der fokussierten: Ein Boots-Tipp
 * trifft auch die erwarteten Partien unter der fokussierten, und dann zählt die Stelle innerhalb
 * DERER Partie.
 */
export function boatPosition(
    matches: TimingMatchDto[],
    competitionMatchTeam: string,
): number | undefined {
    for (const match of matches) {
        const index = boatsByPosition(match).findIndex(
            team => team.competitionMatchTeam === competitionMatchTeam,
        )
        if (index !== -1) return index + 1
    }
    return undefined
}

/** Die Position, die eine Taste in dieser Belegung trifft — die erste Reihe hat Vorrang. */
function keyPosition(keys: BoatKeyLayout, key: string): number | undefined {
    // Groß und klein sind dieselbe Taste: Das Board liest den Druck ohne Rücksicht auf die
    // Umschalttaste, und der Server verbietet aus demselben Grund `a` und `A` nebeneinander.
    const pressed = key.toUpperCase()
    const find = (row: string | null) =>
        row == null ? -1 : [...row].findIndex(candidate => candidate.toUpperCase() === pressed)
    const primary = find(keys.primary)
    if (primary !== -1) return primary
    const secondary = find(keys.secondary)
    return secondary === -1 ? undefined : secondary
}

/**
 * Die beiden Tastenreihen der Belegung gleichwertig auf die Boote der fokussierten Partie
 * abbilden: Die n-te Taste einer Reihe trifft das Boot an Position n **nach Startnummer** — nicht
 * die Startnummer selbst, denn die wiederholt sich über Wettkämpfe und kann Lücken haben, während
 * die Position in der Partie für den Bediener direkt ablesbar ist (die Knöpfe tragen die
 * Hinweise).
 *
 * Die Belegung kommt als Parameter herein und nicht mehr aus fest verdrahteten Bereichen: Sie
 * gehört seit dem 26.08.2026 dem Zeitnahmetyp. Der Aufrufer holt sie über [boatKeyLayout] aus dem
 * Typ der fokussierten Partie — und zeigt mit [boatKeyHint] genau dieselbe an den Booten an.
 */
export function finishKeyTarget(
    match: TimingMatchDto | undefined,
    key: string,
    keys: BoatKeyLayout,
): FinishKeyTarget | undefined {
    if (match === undefined || key.length !== 1) return undefined

    const position = keyPosition(keys, key)
    if (position === undefined) return undefined

    const team = boatsByPosition(match)[position]
    if (team === undefined) return undefined
    return {teamId: team.competitionMatchTeam, finished: team.finished}
}

/**
 * Fokus-Vorauswahl des Zielpostens — das Gegenstück zu `resolveStartSelection` am Start: die von
 * Hand fokussierte Partie bleibt fokussiert, solange sie nicht fertig ist — auch eine OFFENE
 * Partie (Zielzeiten ohne Start: der Posten erfasst dann Zeiten, bevor die Startmarke existiert;
 * die offizielle Zeit rechnet die Übernahme nach, sobald der Start nachgetragen ist). Ohne
 * haltbare Handwahl fällt der Fokus auf die erste Partie auf dem Wasser (STARTED/STARTING) in
 * gelieferter Reihenfolge — offene Partien kommen bewusst NIE von selbst in den Fokus, nur per
 * Klick. Das „Vorrücken“ bleibt erhalten: läuft die fokussierte Partie ins Ziel (FINISHED), fällt
 * sie aus der Auswahl und der Fokus springt auf die nächste laufende. Ohne laufende Partie
 * treffen die Tasten nichts (undefined).
 */
export function resolveFinishFocus(
    matches: TimingMatchDto[],
    selectedId: string | undefined,
): string | undefined {
    const onWater = (match: TimingMatchDto) =>
        match.progress === 'STARTED' || match.progress === 'STARTING'
    const selected = matches.find(
        match => match.competitionSetupMatch === selectedId && match.progress !== 'FINISHED',
    )
    if (selected !== undefined) return selected.competitionSetupMatch
    return matches.find(onWater)?.competitionSetupMatch
}

/**
 * Tab-Wanderung durch die fokussierbaren Partien: vorwärts/rückwärts mit Umbruch. Ein unbekannter
 * (oder fehlender) Fokus landet am ersten Eintrag statt irgendwo — das ist der Zustand direkt nach
 * einem Partiewechsel, und der erste Eintrag ist die vorderste laufende Partie.
 */
export function cycleFocus(
    ids: string[],
    currentId: string | undefined,
    delta: 1 | -1,
): string | undefined {
    if (ids.length === 0) return undefined
    const index = currentId === undefined ? -1 : ids.indexOf(currentId)
    if (index === -1) return ids[0]
    return ids[(index + delta + ids.length) % ids.length]
}
