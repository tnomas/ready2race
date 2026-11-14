package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.competitionExecution.seedTwoRoundCompetition
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardProgramState
import de.lambda9.ready2race.backend.app.eventSchedule.boundary.EventScheduleService
import de.lambda9.ready2race.backend.database.generated.tables.records.EventScheduleSlotRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_SCHEDULE_SLOT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Das öffentliche Tagesprogramm (`buildProgram`) und der interne Zeitplan gegen ein echtes
 * Postgres: beide müssen den Laufzustand aus derselben Ableitung lesen wie Live-Reiter,
 * Durchführung und Schiedsrichter-Dashboard.
 *
 * Anlass ist der Befund vom 13.11.2026: Der Zeitplan-Reiter der Ergebnisseite zeigte einen nur an
 * den Start gerufenen Lauf als „Läuft", der Live-Reiter für denselben Lauf „In Vorbereitung"; ein
 * Lauf in Klärung stand im Programm und im internen Zeitplan ebenfalls auf „Läuft".
 */
class ProgramMatchStateTest {

    private val now = LocalDateTime.now()

    @Test
    fun theProgramShowsPreparingRunningAndClarificationLikeTheDerivation() = testComprehension {
        val seed = seedTwoRoundCompetition()
        val setupMatchId = seed.firstRoundMatchIds.first()
        !publishEvent(seed.eventId)
        !EVENT_SCHEDULE_SLOT.insert(
            EventScheduleSlotRecord(
                id = UUID.randomUUID(),
                event = seed.eventId,
                startTime = now.plusMinutes(10),
                competitionSetupMatch = setupMatchId,
                createdAt = now,
                updatedAt = now,
            )
        )

        fun programState() = (!BoardService.getProgram(seed.eventId)).data.single().state

        // Der Seed ruft die erste Runde schon an den Start; für den Ausgangszustand zurücknehmen.
        !COMPETITION_MATCH.update(
            f = {
                activatedAt = null
                startedAt = null
            },
            condition = { COMPETITION_SETUP_MATCH.eq(setupMatchId) },
        )
        assertEquals(BoardProgramState.UPCOMING, programState())

        !COMPETITION_MATCH.update(f = { activatedAt = now }, condition = { COMPETITION_SETUP_MATCH.eq(setupMatchId) })
        assertEquals(BoardProgramState.PREPARING, programState())

        !COMPETITION_MATCH.update(f = { startedAt = now }, condition = { COMPETITION_SETUP_MATCH.eq(setupMatchId) })
        assertEquals(BoardProgramState.RUNNING, programState())

        val slot = (!EventScheduleService.getSchedule(seed.eventId)).dto.slots.single()
        assertNull(slot.matchClarificationSince)

        !COMPETITION_MATCH.update(
            f = {
                clarificationSince = now
                clarificationReason = "Bahnberührung"
            },
            condition = { COMPETITION_SETUP_MATCH.eq(setupMatchId) },
        )
        assertEquals(BoardProgramState.CLARIFICATION, programState())
        // Der interne Zeitplan bekommt den Zeitpunkt (das Frontend sortiert ihn in dieselbe
        // Zweig-Reihenfolge ein), die Begründung nicht.
        assertNotNull((!EventScheduleService.getSchedule(seed.eventId)).dto.slots.single().matchClarificationSince)
    }
}
