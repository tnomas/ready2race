package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingStartOrderLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingStartOrderLogic.MatchSortKey
import de.lambda9.ready2race.backend.app.timing.boundary.TimingStartOrderLogic.RoundRef
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Sortierung der Startliste: geplante Startzeit zuerst, Läufe ohne Zeit dahinter in
 * Zeitplan-/Setup-Reihenfolge (Rennnummer, Rundenkette, executionOrder). Reine Logik, damit die
 * Reihenfolge ohne Datenbank belegt ist - der Startposten arbeitet diese Liste einfach von oben
 * nach unten ab.
 */
class TimingStartOrderLogicTest {

    private fun key(
        startTime: LocalDateTime? = null,
        identifier: String? = null,
        roundIndex: Int = 0,
        executionOrder: Int = 0,
        id: UUID = UUID.randomUUID(),
    ) = MatchSortKey(startTime, identifier, roundIndex, executionOrder, id)

    @Test
    fun plannedTimesComeFirstInChronologicalOrder() {
        val nine = key(startTime = LocalDateTime.of(2026, 8, 23, 9, 0))
        val ten = key(startTime = LocalDateTime.of(2026, 8, 23, 10, 0))
        val untimed = key(identifier = "1")

        val sorted = listOf(untimed, ten, nine).sortedWith(TimingStartOrderLogic.comparator)

        assertEquals(listOf(nine, ten, untimed), sorted)
    }

    @Test
    fun untimedMatchesFallBackToIdentifierRoundChainAndExecutionOrder() {
        val race2Round1 = key(identifier = "2", roundIndex = 0)
        val race2Round2 = key(identifier = "2", roundIndex = 1)
        val race10 = key(identifier = "10", roundIndex = 0)
        val race2SecondMatch = key(identifier = "2", roundIndex = 0, executionOrder = 2)

        val sorted = listOf(race10, race2Round2, race2SecondMatch, race2Round1)
            .sortedWith(TimingStartOrderLogic.comparator)

        // Rennnummern sortieren numerisch (2 vor 10), innerhalb des Rennens die Rundenkette,
        // innerhalb der Runde die executionOrder.
        assertEquals(listOf(race2Round1, race2SecondMatch, race2Round2, race10), sorted)
    }

    @Test
    fun identifiersWithoutLeadingNumberSortBehindNumberedOnesAlphabetically() {
        val numbered = key(identifier = "3")
        val lettered = key(identifier = "B")
        val letteredEarly = key(identifier = "A")

        val sorted = listOf(lettered, numbered, letteredEarly).sortedWith(TimingStartOrderLogic.comparator)

        assertEquals(listOf(numbered, letteredEarly, lettered), sorted)
    }

    @Test
    fun equalKeysFallBackToTheMatchIdForADeterministicOrder() {
        val a = key(identifier = "1")
        val b = key(identifier = "1")

        val once = listOf(a, b).sortedWith(TimingStartOrderLogic.comparator)
        val again = listOf(b, a).sortedWith(TimingStartOrderLogic.comparator)

        assertEquals(once, again)
    }

    @Test
    fun roundOrderFollowsTheNextRoundChain() {
        val final = UUID.randomUUID()
        val semi = UUID.randomUUID()
        val heat = UUID.randomUUID()
        val rounds = listOf(
            RoundRef(final, nextRound = null),
            RoundRef(heat, nextRound = semi),
            RoundRef(semi, nextRound = final),
        )

        val order = TimingStartOrderLogic.roundOrder(rounds)

        assertEquals(0, order[heat])
        assertEquals(1, order[semi])
        assertEquals(2, order[final])
    }

    @Test
    fun roundOrderHandlesSeveralIndependentChains() {
        val aFirst = UUID.randomUUID()
        val aSecond = UUID.randomUUID()
        val bOnly = UUID.randomUUID()
        val rounds = listOf(
            RoundRef(aFirst, nextRound = aSecond),
            RoundRef(aSecond, nextRound = null),
            RoundRef(bOnly, nextRound = null),
        )

        val order = TimingStartOrderLogic.roundOrder(rounds)

        assertEquals(0, order[aFirst])
        assertEquals(1, order[aSecond])
        assertEquals(0, order[bOnly])
    }

    @Test
    fun roundOrderSurvivesACycleWithoutHanging() {
        // Ein Zyklus wäre ein Datenfehler - die Funktion darf daran trotzdem nicht hängen bleiben
        // und muss jeder Runde irgendeinen Index geben, damit die Startliste weiter erscheint.
        val a = UUID.randomUUID()
        val b = UUID.randomUUID()
        val rounds = listOf(
            RoundRef(a, nextRound = b),
            RoundRef(b, nextRound = a),
        )

        val order = TimingStartOrderLogic.roundOrder(rounds)

        assertEquals(setOf(a, b), order.keys)
    }
}
