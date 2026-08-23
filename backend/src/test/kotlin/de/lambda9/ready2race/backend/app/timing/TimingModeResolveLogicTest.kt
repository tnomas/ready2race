package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeResolveLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeResolveLogic.ModeAssignment
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Auflösung Wettkampf/Runde -> Zeitnahmetyp: reine Logik ohne Datenbank, nach dem Muster von
 * RequirementScopeLogic. Die Regel: ein Runden-Eintrag schlägt den Wettkampf-Eintrag, und ohne
 * jeden Eintrag gibt es keinen Typ (null) - dann ist der Wettkampf schlicht nicht für die interne
 * Zeitnahme konfiguriert.
 */
class TimingModeResolveLogicTest {

    private val competition = UUID.randomUUID()
    private val otherCompetition = UUID.randomUUID()
    private val round = UUID.randomUUID()
    private val otherRound = UUID.randomUUID()
    private val modeA = UUID.randomUUID()
    private val modeB = UUID.randomUUID()

    @Test
    fun roundEntryBeatsCompetitionEntry() {
        val assignments = listOf(
            ModeAssignment(competition, null, modeA),
            ModeAssignment(competition, round, modeB),
        )
        assertEquals(modeB, TimingModeResolveLogic.resolve(assignments, competition, round))
    }

    @Test
    fun competitionEntryCoversRoundsWithoutOwnEntry() {
        val assignments = listOf(
            ModeAssignment(competition, null, modeA),
            ModeAssignment(competition, round, modeB),
        )
        assertEquals(modeA, TimingModeResolveLogic.resolve(assignments, competition, otherRound))
    }

    @Test
    fun roundOnlyEntryDoesNotLeakToOtherRoundsOrTheCompetition() {
        val assignments = listOf(
            ModeAssignment(competition, round, modeB),
        )
        // Andere Runde: kein Wettkampf-Eintrag vorhanden, der Runden-Eintrag gilt nur für seine Runde.
        assertNull(TimingModeResolveLogic.resolve(assignments, competition, otherRound))
        // Anfrage ohne Runde (Wettkampf-Ebene): der Runden-Eintrag greift auch hier nicht.
        assertNull(TimingModeResolveLogic.resolve(assignments, competition, null))
    }

    @Test
    fun assignmentsOfOtherCompetitionsAreIgnored() {
        val assignments = listOf(
            ModeAssignment(otherCompetition, null, modeA),
            ModeAssignment(otherCompetition, round, modeB),
        )
        assertNull(TimingModeResolveLogic.resolve(assignments, competition, round))
    }

    @Test
    fun noAssignmentsMeansNoMode() {
        assertNull(TimingModeResolveLogic.resolve(emptyList(), competition, round))
    }
}
