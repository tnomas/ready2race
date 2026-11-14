package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.StartNumberAssignment
import kotlin.test.Test
import kotlin.test.assertEquals

class StartNumberAssignmentTest {

    @Test
    fun everyTeamKeepsItsTeamNumber() {
        val numbers = StartNumberAssignment.fromTeamNumbers(listOf("a" to 7, "b" to 2, "c" to 22), 22)
        assertEquals(mapOf("a" to 7, "b" to 2, "c" to 22), numbers)
    }

    @Test
    fun aTeamWithoutNumberGetsOneAboveEveryTeamNumberOfTheCompetition() {
        // Höchste Meldungsnummer im Wettkampf ist 9 (ein Boot eines anderen Laufs): die 8 ist im
        // Lauf frei, gehört aber vielleicht einem anderen Boot - also 10.
        val numbers = StartNumberAssignment.fromTeamNumbers(listOf("a" to 3, "late" to null), 9)
        assertEquals(mapOf("a" to 3, "late" to 10), numbers)
    }

    @Test
    fun aDuplicateTeamNumberStaysWithTheBetterSeededTeamAndIsUniquePerMatch() {
        val numbers = StartNumberAssignment.fromTeamNumbers(
            listOf("first" to 4, "second" to 4, "none" to null, "zero" to 0),
            4,
        )
        assertEquals(4, numbers["first"])
        assertEquals(5, numbers["second"])
        assertEquals(6, numbers["none"])
        assertEquals(7, numbers["zero"])
        assertEquals(numbers.size, numbers.values.toSet().size)
    }

    @Test
    fun withoutCompetitionMaximumItStillAvoidsNumbersOfTheMatch() {
        val numbers = StartNumberAssignment.fromTeamNumbers(listOf("a" to null, "b" to 5), null)
        assertEquals(mapOf("a" to 6, "b" to 5), numbers)
    }
}
