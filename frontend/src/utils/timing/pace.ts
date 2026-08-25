import {MatchTeamLapDto, PaceReferenceMode} from '@api/types.gen.ts'
import {paceReferenceLabel} from '@components/paceReference/paceReferenceLabel.ts'

/**
 * Tempo je Abschnitt und Rangfolge an der Zwischenzeit — beides reine Anzeige und deshalb hier
 * und nicht im Backend: Das Tempo hängt an der Bezugsgröße des Wettkampfs („Zeit pro 500 m",
 * „km/h"), und das ist eine Darstellungsentscheidung. Der Server liefert die beiden Zahlen, aus
 * denen sich alles ableiten lässt: die Distanz des Postens und die gefahrene Zeit in
 * Millisekunden.
 *
 * Alles hier ist pur und ohne React — dieselbe Bauart wie sequenceDisplay.ts nebenan.
 */

/** Sekunden als „m:ss", über einer Stunde mit Stundenstelle. Keine Nachkommastelle: Ein Tempo
 * ist eine Hochrechnung, keine gemessene Zeit — Zehntel täuschten eine Genauigkeit vor, die die
 * Rechnung nicht hat. */
const formatSeconds = (seconds: number): string => {
    const rounded = Math.round(seconds)
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    const rest = rounded % 60
    const pad = (value: number) => `${value}`.padStart(2, '0')
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}

/**
 * Das Tempo jedes Abschnitts, in der Reihenfolge von [laps] — je Zwischenzeit ein Eintrag.
 *
 * Ein Abschnitt reicht von der vorigen Zwischenzeit bis zu dieser; die erste rechnet gegen den
 * Start, und der liegt bei 0 m und 0 ms. `null` heißt „hier lässt sich nichts sagen" und ist
 * ausdrücklich kein Fehler: Die Rundenzeiten aus dem Fremdsystem tragen keine Distanz (ihre
 * Spaltennamen gehören keinem Posten), und zwei Posten auf demselben Meter ergäben eine
 * Division durch null. In beiden Fällen bleibt die Stelle leer, statt eine Zahl zu erfinden.
 *
 * [decimalPoint] kommt aus der Sprache der Oberfläche (`decimal.point`); die Voreinstellung ist
 * das deutsche Komma.
 */
export const segmentPace = (
    laps: MatchTeamLapDto[],
    mode: PaceReferenceMode,
    referenceMeters: number,
    decimalPoint: string = ',',
): (string | null)[] => {
    // Bezugspunkt des nächsten Abschnitts: zuletzt bekannte Stelle auf der Strecke. Startwert
    // ist der Start selbst.
    let anchorMeters = 0
    let anchorMillis = 0

    return laps.map(lap => {
        const meters = lap.distanceMeters
        const millis = lap.lapMillis
        if (meters == null || millis == null) return null

        const deltaMeters = meters - anchorMeters
        const deltaMillis = millis - anchorMillis
        // Diese Zwischenzeit ist ab jetzt der Bezugspunkt — auch wenn ihr eigener Abschnitt
        // nicht zu rechnen war (zwei Marken auf demselben Meter).
        anchorMeters = meters
        anchorMillis = millis

        if (deltaMeters <= 0 || deltaMillis <= 0 || referenceMeters <= 0) return null

        if (mode === 'TIME_PER_DISTANCE') {
            return formatSeconds((deltaMillis * (referenceMeters / deltaMeters)) / 1000)
        }
        // Strecke je Stunde, gemessen in Bezugsstrecken: 1000 m Bezug ergibt km/h.
        const perHour = (deltaMeters / deltaMillis) * 3_600_000
        return (perHour / referenceMeters).toFixed(1).replace('.', decimalPoint)
    })
}

/**
 * Tempo und Einheit als ein Textstück. Die Einheit steht an jedem Wert und nicht einmal am Ende
 * der Zeile: Auf einer Anzeigetafel steht das Tempo direkt neben der gefahrenen Zeit, und eine
 * nackte „1:40" wäre von ihr nicht zu unterscheiden.
 *
 * Die Beschriftung der Zeit-pro-Strecke-Form beginnt selbst mit einem Schrägstrich („/500 m")
 * und wird deshalb ohne Leerzeichen angehängt.
 */
export const paceWithUnit = (
    pace: string,
    mode: PaceReferenceMode,
    referenceMeters: number,
): string => {
    const label = paceReferenceLabel(mode, referenceMeters)
    return mode === 'TIME_PER_DISTANCE' ? `${pace}${label}` : `${pace} ${label}`
}

/** Was die Rangfolge von einem Boot braucht: seine Kennung im Lauf und seine Zwischenzeiten. */
export type RankableTeam = {
    teamId: string
    laps?: MatchTeamLapDto[] | null
}

/**
 * Die Stellen der Strecke, an denen überhaupt gemessen wurde: die vorkommenden Distanzen aller
 * Boote, aufsteigend und ohne Doppelte. Eine leere Liste heißt „keine Marke trägt eine Distanz" —
 * das ist der Fall der Rundenzeiten aus dem Fremdsystem.
 */
const courseDistances = (teams: RankableTeam[]): number[] => {
    const meters = new Set<number>()
    teams.forEach(team =>
        (team.laps ?? []).forEach(lap => {
            if (lap.distanceMeters != null) meters.add(lap.distanceMeters)
        }),
    )
    return [...meters].sort((a, b) => a - b)
}

/**
 * Aus (Boot, Zeit) eine Rangfolge machen: schnellstes zuerst, Gleichstand bekommt denselben Rang,
 * der nächste Rang überspringt die Doppelbelegung ("1, 2, 2, 4") — die Lesart jeder Ergebnisliste.
 */
const rankEntries = (entries: {teamId: string; millis: number}[]) => {
    const sorted = [...entries].sort((a, b) => a.millis - b.millis)

    let rank = 0
    let previousMillis: number | null = null
    return sorted.map((entry, index) => {
        if (previousMillis === null || entry.millis !== previousMillis) {
            rank = index + 1
            previousMillis = entry.millis
        }
        return {teamId: entry.teamId, rank}
    })
}

/**
 * Die Rangfolge an der [position]-ten Stelle der STRECKE (ab 1), schnellstes Boot zuerst.
 *
 * Verglichen wird über die Distanz, nicht über die Stelle in `laps`. Der Unterschied ist der
 * Unterschied zwischen richtig und falsch: Das Backend zählt die Positionen je Boot lückenlos
 * (`TimingSplitLogic.compute` zählt beim Verwerfen einer Marke nicht mit), eine verpasste Marke
 * erzeugt also keine Lücke, sondern eine Verschiebung. Bei dem einen Boot, das der Posten an
 * Boje 1 nicht erwischt hat, steht die 1000-m-Marke dann an Stelle 1 — und ein Vergleich nach der
 * Stelle stellte seine 1000-m-Zeit neben lauter 500-m-Zeiten. Herausgekommen wäre eine
 * Ordnungszahl, die nichts bedeutet, aber wie eine Platzierung aussieht.
 *
 * Nur wenn KEINE Marke eine Distanz trägt, entscheidet die Stelle: Die Spalten des Fremdsystems
 * gehören keinem Posten, sind aber für alle Boote dieselben.
 *
 * Boote ohne Zwischenzeit an dieser Stelle fehlen in der Rückgabe. Sie bekommen keinen Rang, weil
 * sie ihn nicht verdient haben: Sie sind an der Marke (noch) nicht vorbeigekommen.
 */
export const rankAtPosition = (
    teams: RankableTeam[],
    position: number,
): {teamId: string; rank: number}[] => {
    const course = courseDistances(teams)
    const meters = course[position - 1]
    // Eine Strecke ist bekannt, aber so weit reicht sie nicht — dann gibt es dort nichts zu ranken.
    if (course.length > 0 && meters === undefined) return []

    const entries = teams.flatMap(team => {
        const laps = team.laps ?? []
        const lap =
            meters !== undefined
                ? laps.find(entry => entry.distanceMeters === meters)
                : laps[position - 1]
        return lap?.lapMillis != null ? [{teamId: team.teamId, millis: lap.lapMillis}] : []
    })

    return rankEntries(entries)
}

/**
 * Dieselbe Rangfolge, aber so gebündelt, wie die Anzeige sie braucht: je Boot ein Eintrag pro
 * eigener Zwischenzeit, in derselben Reihenfolge wie dessen `laps`. Damit rechnet eine Karte
 * einmal für den ganzen Lauf und reicht jedem Boot nur noch seine Ränge herunter, statt die
 * Rangfolge in der Bootszeile selbst zu bilden.
 *
 * Die Liste ist stellengleich zu `laps` — auch dort, wo kein Rang zustande kommt, steht ein
 * Eintrag (`null`). Ohne das verschöbe eine einzelne rangfreie Zwischenzeit alle folgenden
 * Ränge um eine Stelle, und die Anzeige hängte einen Rang an die falsche Marke.
 */
export const lapRanksByTeam = (teams: RankableTeam[]): Map<string, (number | null)[]> => {
    const course = courseDistances(teams)
    const result = new Map<string, (number | null)[]>(teams.map(team => [team.teamId, []]))

    if (course.length === 0) {
        // Ohne jede Distanz entscheidet die Stelle — siehe [rankAtPosition].
        const positions = Math.max(0, ...teams.map(team => (team.laps ?? []).length))
        for (let position = 1; position <= positions; position++) {
            const byTeam = new Map(
                rankAtPosition(teams, position).map(entry => [entry.teamId, entry.rank]),
            )
            teams.forEach(team => {
                if ((team.laps ?? []).length < position) return
                result.get(team.teamId)?.push(byTeam.get(team.teamId) ?? null)
            })
        }
        return result
    }

    // Je Meter der Strecke einmal ranken, danach bekommt jede Marke den Rang IHRES Meters. So
    // landet der Rang des Bootes, dem die erste Marke fehlt, an dessen tatsächlicher Marke.
    const byMeters = new Map(
        course.map((meters, index) => [
            meters,
            new Map(rankAtPosition(teams, index + 1).map(entry => [entry.teamId, entry.rank])),
        ]),
    )
    teams.forEach(team => {
        result.set(
            team.teamId,
            (team.laps ?? []).map(lap =>
                lap.distanceMeters != null
                    ? (byMeters.get(lap.distanceMeters)?.get(team.teamId) ?? null)
                    : null,
            ),
        )
    })

    return result
}
