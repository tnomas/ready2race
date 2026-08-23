package de.lambda9.ready2race.backend.app.timing.boundary

import java.time.LocalDateTime
import java.util.UUID

/**
 * Reine Sortierlogik der Posten-Startliste: der Startposten arbeitet die Partien von oben nach
 * unten ab, also muss die Reihenfolge deterministisch und ohne Datenbank belegbar sein.
 *
 * Regel: Läufe mit geplanter Startzeit zuerst, chronologisch. Läufe ohne Zeit dahinter in
 * Setup-Reihenfolge - Rennnummer (numerisch, nicht alphabetisch: Rennen 2 vor Rennen 10), dann
 * die Rundenkette des Wettkampfs, dann die executionOrder innerhalb der Runde.
 */
object TimingStartOrderLogic {

    /** Eine Setup-Runde, reduziert auf ihre Kettenverknüpfung (`next_round`). */
    data class RoundRef(
        val id: UUID,
        val nextRound: UUID?,
    )

    /** Der Sortierschlüssel einer Partie - alles, was die Reihenfolge bestimmt. */
    data class MatchSortKey(
        val startTime: LocalDateTime?,
        val competitionIdentifier: String?,
        val roundIndex: Int,
        val executionOrder: Int,
        val matchId: UUID,
    )

    /**
     * Position jeder Runde in ihrer Kette, 0-basiert. Die Runden eines Setups bilden über
     * `next_round` eine verkettete Liste; Wurzeln sind die Runden, auf die niemand zeigt.
     *
     * Ein Zyklus wäre ein Datenfehler, darf die Startliste aber nicht verschlucken: das
     * `visited`-Set bricht die Wanderung ab, und Runden, die (im Zyklus gefangen) nie von einer
     * Wurzel erreicht werden, bekommen am Ende einen Index hinter allen regulären.
     */
    fun roundOrder(rounds: List<RoundRef>): Map<UUID, Int> {
        val referenced = rounds.mapNotNull { it.nextRound }.toSet()
        val byId = rounds.associateBy { it.id }
        val order = mutableMapOf<UUID, Int>()

        rounds.filter { it.id !in referenced }.forEach { root ->
            var current: RoundRef? = root
            var index = 0
            val visited = mutableSetOf<UUID>()
            while (current != null && visited.add(current.id)) {
                order[current.id] = index
                index += 1
                current = current.nextRound?.let { byId[it] }
            }
        }
        rounds.filter { it.id !in order }.forEachIndexed { offset, orphan ->
            order[orphan.id] = rounds.size + offset
        }
        return order
    }

    /**
     * Rennnummern sortieren numerisch, soweit sie mit einer Zahl beginnen; alles ohne führende
     * Zahl kommt dahinter und sortiert alphabetisch. `String.compareTo` allein würde Rennen 10
     * vor Rennen 2 stellen.
     */
    private fun leadingNumber(identifier: String?): Long =
        identifier?.takeWhile { it.isDigit() }?.takeIf { it.isNotEmpty() }?.toLongOrNull() ?: Long.MAX_VALUE

    /**
     * Läufe ohne Startzeit hinter alle mit Startzeit (`nullsLast`), Gleichstände lösen sich über
     * die Setup-Reihenfolge. Der letzte Vergleich über die Text-Fassung der Partie-UUID macht die
     * Ordnung total - Textfassung statt `UUID.compareTo` aus demselben Grund wie in
     * `RequirementScopeLogic.eventDayOf` (Java vergleicht UUIDs als vorzeichenbehaftete longs).
     */
    val comparator: Comparator<MatchSortKey> = compareBy(
        { it.startTime ?: LocalDateTime.MAX },
        { leadingNumber(it.competitionIdentifier) },
        { it.competitionIdentifier ?: "" },
        { it.roundIndex },
        { it.executionOrder },
        { it.matchId.toString() },
    )
}
