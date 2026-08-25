package de.lambda9.ready2race.backend.app.timing.boundary

import java.util.UUID

/**
 * Reine Logik der Frage „welche Zwischenzeiten ergeben diese Marken?" — bewusst ohne Datenbank-
 * und Ktor-Bezug, nach dem Muster von `TimingProfileResolveLogic`.
 *
 * Bis hierher versickerte, was ein Streckenposten erfasste: Marken auf SPLIT-Posten sind
 * ausdrücklich nicht Teil der offiziellen Zeit (`TimingOfficialTimeService.resolveMarkTimes`), und
 * einen anderen Abnehmer hatten sie nicht. Diese Logik ist der Abnehmer — die Regeln sind
 * dieselben wie bei der offiziellen Zeit, damit ein Boot nicht nach zwei Uhren fährt:
 *
 * - Die SPÄTESTE Startmarke zählt. Ein neu gestartetes Team trägt mehrere; die letzte ist der
 *   Start, den es wirklich genommen hat.
 * - Am selben Posten zählt die FRÜHESTE Marke. Ein Doppeltipp ist kein zweiter Durchgang —
 *   dieselbe Regel, mit der die offizielle Zielzeit die doppelt genommene Ziellinie behandelt.
 * - Ohne Startmarke gibt es keine Zwischenzeit, denn sie wäre keine Fahrzeit, sondern eine
 *   Tageszeit. Und was VOR dem Start liegt, ist ein Zuordnungsfehler und keine negative Zeit.
 *
 * Die Reihenfolge auf der Strecke macht die Distanz, nicht die Leitstand-Sortierung: Ein Posten
 * ohne zugeordnete Distanz (er steht nicht in `competition_timing_station` dieses Wettkampfs)
 * liegt auf keinem bekannten Meter und zählt darum nicht mit.
 */
object TimingSplitLogic {

    /** Eine zugeordnete, aktive Marke, reduziert auf das, was die Zwischenzeit braucht. */
    data class Mark(
        val team: UUID,
        val station: UUID,
        val timestampMillis: Long,
        val isStart: Boolean,
    )

    /** Ein Posten dieses Wettkampfs auf seinem Meter — die Beschriftung kommt vom Posten. */
    data class StationAtDistance(
        val station: UUID,
        val name: String,
        val distanceMeters: Int,
    )

    /** Eine Zwischenzeit: Fahrzeit seit dem gemessenen Start, an ihrem Platz auf der Strecke. */
    data class Split(
        val team: UUID,
        val position: Int,
        val name: String,
        val lapMillis: Long,
        val distanceMeters: Int,
    )

    /**
     * Die Zwischenzeiten, die [marks] an den [stations] ergeben — je Team getrennt gerechnet.
     *
     * [stations] kommt bereits nach Distanz sortiert aus `CompetitionTimingStationRepo`; die
     * Sortierung hier wiederholt das nur, damit die Logik für sich genommen stimmt. Sie ist
     * stabil, sodass bei gleichem Meter die eingehende Reihenfolge (und damit
     * `timing_station.sorting`) entscheidet.
     *
     * `position` wird fortlaufend ab 1 vergeben, über die Posten, die für dieses Team wirklich
     * eine Zeit ergeben — lückenlos, weil sie der Schlüssel der Zeile ist (Boot, Position) und die
     * Anzeigen danach ordnen.
     */
    fun compute(
        marks: Collection<Mark>,
        stations: Collection<StationAtDistance>,
    ): List<Split> {
        val ordered = stations.sortedBy { it.distanceMeters }

        return marks.groupBy { it.team }.flatMap { (team, teamMarks) ->
            val startMillis = teamMarks.filter { it.isStart }.maxOfOrNull { it.timestampMillis }
                ?: return@flatMap emptyList()

            var position = 0
            ordered.mapNotNull { station ->
                val passedMillis = teamMarks
                    .filter { !it.isStart && it.station == station.station }
                    .minOfOrNull { it.timestampMillis }
                    ?: return@mapNotNull null

                val lapMillis = passedMillis - startMillis
                if (lapMillis < 0) return@mapNotNull null

                position += 1
                Split(
                    team = team,
                    position = position,
                    name = station.name,
                    lapMillis = lapMillis,
                    distanceMeters = station.distanceMeters,
                )
            }
        }
    }
}
