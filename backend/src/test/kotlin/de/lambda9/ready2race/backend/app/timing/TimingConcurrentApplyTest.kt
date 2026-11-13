package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingService
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Zwei Zuordnungen an verschiedenen Booten DESSELBEN Laufs, gleichzeitig in zwei echten
 * Transaktionen: die Platzableitung muss das ganze Feld sehen. Ohne Sperre rechnet jede
 * Transaktion nur mit "ihrem" Boot und beide schreiben Platz 1.
 */
class TimingConcurrentApplyTest {

    private val startMillis = 1755430000000L

    @Test
    fun parallelFinishAssignmentsInOneMatchYieldDistinctPlaces() = testCommittingComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val startStation = !addTestStation(eventId, userId, TimingStationType.START)
        val finishStation = !addTestStation(eventId, userId, TimingStationType.FINISH)
        val teams = !createTestMatchTeams(eventId, 2)
        !addAssignedMark(eventId, userId, startStation, teams[0], startMillis)
        !addAssignedMark(eventId, userId, startStation, teams[1], startMillis)

        // Boot 0 ist schneller als Boot 1 - die Zielmarken liegen schon da, nur noch nicht zugeordnet.
        val finish0 = UUID.randomUUID()
        val finish1 = UUID.randomUUID()
        !TimingService.createTimeMark(CreateTimeMarkRequest(finish0, finishStation, startMillis + 80_000), userId, eventId)
        !TimingService.createTimeMark(CreateTimeMarkRequest(finish1, finishStation, startMillis + 90_000), userId, eventId)

        ConcurrentTx.runHoldingFirst(
            env,
            first = TimingService.assignTimeMark(AssignTimeMarkRequest(teams[0]), userId, finish0, eventId),
            second = TimingService.assignTimeMark(AssignTimeMarkRequest(teams[1]), userId, finish1, eventId),
        )

        val place0 = (!CompetitionMatchTeamRepo.getById(teams[0]))!!.place
        val place1 = (!CompetitionMatchTeamRepo.getById(teams[1]))!!.place
        assertEquals(1, place0)
        assertEquals(2, place1)
    }
}
