package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeResolveLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeResolveLogic.ModeAssignment
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TonePlanStep
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Zeitnahmetypen gegen echtes Postgres: CRUD, der (event, name)-Unique-Vorbau, die
 * Zuordnungs-Semantik (Upsert über den natürlichen Schlüssel, `unique nulls not distinct`) und
 * die Auflösung über TimingModeResolveLogic mit Zeilen aus der Datenbank.
 */
class TimingModeServiceTest {

    private fun request(
        name: String = "Timetrial 30s",
        grouping: TimingStartGrouping = TimingStartGrouping.EINZEL,
        intervalSeconds: Int? = 30,
    ) = TimingModeRequest(
        name = name,
        withLaps = false,
        startGrouping = grouping,
        intervalSeconds = intervalSeconds,
        leadInSeconds = 10,
        tonePlan = null,
    )

    @Test
    fun addAndListModes() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        val created = !TimingModeService.addMode(request(), userId, eventId)
        val modeId = (created as ApiResponse.Created).id

        val list = (!TimingModeService.getModes(eventId)).data
        assertEquals(1, list.size)
        val mode = list.single()
        assertEquals(modeId, mode.id)
        assertEquals("Timetrial 30s", mode.name)
        assertEquals(TimingStartGrouping.EINZEL, mode.startGrouping)
        assertEquals(30, mode.intervalSeconds)
        assertEquals(10, mode.leadInSeconds)
        assertEquals(false, mode.withLaps)
        // Kein Plan gespeichert = eingebauter Standard: die Spalte bleibt null und kommt als
        // null zurück, damit künftige Standard-Änderungen unkonfigurierte Typen erreichen.
        assertNull(mode.tonePlan)
    }

    @Test
    fun tonePlanSurvivesTheJsonbRoundtrip() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val plan = listOf(
            TonePlanStep(offsetMillis = -10_000, frequencyHz = 600, durationMillis = 100),
            TonePlanStep(offsetMillis = 0, frequencyHz = 880, durationMillis = 400),
        )

        val created = !TimingModeService.addMode(request().copy(tonePlan = plan), userId, eventId)
        val modeId = (created as ApiResponse.Created).id
        assertEquals(plan, (!TimingModeService.getModes(eventId)).data.single().tonePlan)

        // Update auf einen anderen Plan und zurück auf null (= Standard) - beides muss die
        // jsonb-Spalte exakt nachziehen, nicht nur beim Anlegen.
        val updated = listOf(TonePlanStep(offsetMillis = 0, frequencyHz = 1200, durationMillis = 200))
        !TimingModeService.updateMode(request().copy(tonePlan = updated), userId, modeId, eventId)
        assertEquals(updated, (!TimingModeService.getModes(eventId)).data.single().tonePlan)

        !TimingModeService.updateMode(request(), userId, modeId, eventId)
        assertNull((!TimingModeService.getModes(eventId)).data.single().tonePlan)
    }

    @Test
    fun duplicateNameWithinTheEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingModeService.addMode(request(), userId, eventId)

        assertKIOFails(TimingError.ModeNameTaken) {
            TimingModeService.addMode(request(), userId, eventId)
        }
    }

    @Test
    fun sameNameInAnotherEventIsFine() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        !TimingModeService.addMode(request(), userId, eventId)

        assertKIOSucceeds<ApiResponse.Created> {
            TimingModeService.addMode(request(), otherUserId, otherEventId)
        }
    }

    @Test
    fun deleteRefusesWhileAssigned() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val modeId = ((!TimingModeService.addMode(request(), userId, eventId)) as ApiResponse.Created).id
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, modeId),
            userId,
            eventId,
        )

        assertKIOFails(TimingError.ModeInUse) {
            TimingModeService.deleteMode(modeId, eventId)
        }

        // Zuordnung abräumen, dann klappt das Löschen.
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, null),
            userId,
            eventId,
        )
        assertKIOSucceeds<ApiResponse.NoData> { TimingModeService.deleteMode(modeId, eventId) }
    }

    @Test
    fun assignmentUpsertReplacesInsteadOfDuplicating() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val modeA = ((!TimingModeService.addMode(request("A"), userId, eventId)) as ApiResponse.Created).id
        val modeB = ((!TimingModeService.addMode(request("B"), userId, eventId)) as ApiResponse.Created).id

        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, modeA),
            userId,
            eventId,
        )
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, modeB),
            userId,
            eventId,
        )

        val assignments = (!TimingModeService.getModeAssignments(eventId)).data
        assertEquals(1, assignments.size, "Zweiter PUT ersetzt den Eintrag, statt einen zweiten anzulegen")
        assertEquals(modeB, assignments.single().timingMode)
        assertNull(assignments.single().competitionSetupRound)
    }

    @Test
    fun roundAndCompetitionEntriesCoexistAndResolvePerRound() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val modeA = ((!TimingModeService.addMode(request("A"), userId, eventId)) as ApiResponse.Created).id
        val modeB = ((!TimingModeService.addMode(request("B"), userId, eventId)) as ApiResponse.Created).id

        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, null, modeA),
            userId,
            eventId,
        )
        !TimingModeService.upsertModeAssignment(
            TimingModeAssignmentRequest(fixture.competitionId, fixture.roundId, modeB),
            userId,
            eventId,
        )

        val assignments = (!TimingModeService.getModeAssignments(eventId)).data
        assertEquals(2, assignments.size)

        // Aufloesung mit den echten DB-Zeilen: Runde schlaegt Wettkampf.
        val logicRows = assignments.map { ModeAssignment(it.competition, it.competitionSetupRound, it.timingMode) }
        assertEquals(modeB, TimingModeResolveLogic.resolve(logicRows, fixture.competitionId, fixture.roundId))
        assertEquals(modeA, TimingModeResolveLogic.resolve(logicRows, fixture.competitionId, UUID.randomUUID()))
    }

    @Test
    fun assignmentRejectsARoundOfAnotherCompetition() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val foreignFixture = !createTestMatchFixture(eventId)
        val modeId = ((!TimingModeService.addMode(request(), userId, eventId)) as ApiResponse.Created).id

        assertKIOFails(TimingError.RoundNotOfCompetition) {
            TimingModeService.upsertModeAssignment(
                TimingModeAssignmentRequest(fixture.competitionId, foreignFixture.roundId, modeId),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun assignmentRejectsCompetitionAndModeOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        val foreignMode =
            ((!TimingModeService.addMode(request(), otherUserId, otherEventId)) as ApiResponse.Created).id

        // Wettkampf gehört nicht zur adressierten Veranstaltung.
        assertKIOFails(TimingError.EventMismatch) {
            TimingModeService.upsertModeAssignment(
                TimingModeAssignmentRequest(fixture.competitionId, null, foreignMode),
                otherUserId,
                otherEventId,
            )
        }
        // Typ gehört nicht zur adressierten Veranstaltung.
        assertKIOFails(TimingError.EventMismatch) {
            TimingModeService.upsertModeAssignment(
                TimingModeAssignmentRequest(fixture.competitionId, null, foreignMode),
                userId,
                eventId,
            )
        }
    }

    @Test
    fun clearingANeverSetAssignmentIsANoOp() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)

        assertKIOSucceeds<ApiResponse.NoData> {
            TimingModeService.upsertModeAssignment(
                TimingModeAssignmentRequest(fixture.competitionId, null, null),
                userId,
                eventId,
            )
        }
        assertTrue((!TimingModeService.getModeAssignments(eventId)).data.isEmpty())
    }
}
