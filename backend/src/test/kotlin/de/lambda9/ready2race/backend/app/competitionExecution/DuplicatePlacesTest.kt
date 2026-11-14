package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionExecutionError
import de.lambda9.ready2race.backend.app.competitionExecution.entity.UpdateCompetitionMatchResultRequest
import de.lambda9.ready2race.backend.app.competitionExecution.entity.UpdateCompetitionMatchTeamResultRequest
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.select
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Gleiche Plätze in der Handeingabe: erlaubt nur als totes Rennen, also wenn alle Boote auf dem
 * Platz dieselbe Zeit haben. Zwei Boote mit verschiedenen Zeiten auf demselben Platz sind ein
 * Tippfehler, den die Erfassung benennen muss, statt ihn still zu speichern oder als Lücke zu
 * melden, die keine ist.
 */
class DuplicatePlacesTest {

    private fun result(registrationId: UUID, place: Int, time: String?) = UpdateCompetitionMatchTeamResultRequest(
        registrationId = registrationId,
        place = place,
        timeString = time,
        failed = false,
        failedReason = null,
        penaltySeconds = null,
        penaltyNote = null,
    )

    @Test
    fun gleicherPlatzMitVerschiedenenZeitenWirdAbgelehnt() = testComprehension {
        val seed = seedTwoRoundCompetition()
        val matchId = seed.firstRoundMatchIds.first()
        val teams = (!COMPETITION_MATCH_TEAM.select { COMPETITION_MATCH.eq(matchId) }).sortedBy { it.startNumber }

        assertKIOFails(CompetitionExecutionError.DuplicatePlaces(place = 1)) {
            CompetitionExecutionService.updateMatchResult(
                eventId = seed.eventId,
                competitionId = seed.competitionId,
                matchId = matchId,
                userId = seed.userId,
                request = UpdateCompetitionMatchResultRequest(
                    listOf(
                        result(teams[0].competitionRegistration!!, place = 1, time = "3:12.4"),
                        result(teams[1].competitionRegistration!!, place = 1, time = "3:12.9"),
                    )
                ),
            )
        }

        val after = !CompetitionMatchTeamRepo.getByMatch(matchId)
        assertEquals(listOf(null, null), after.map { it.place }, "Die abgelehnte Eingabe hat trotzdem geschrieben")
    }

    @Test
    fun totesRennenTeiltSichDenPlatz() = testComprehension {
        val seed = seedTwoRoundCompetition()
        val matchId = seed.firstRoundMatchIds.first()
        val teams = (!COMPETITION_MATCH_TEAM.select { COMPETITION_MATCH.eq(matchId) }).sortedBy { it.startNumber }

        !CompetitionExecutionService.updateMatchResult(
            eventId = seed.eventId,
            competitionId = seed.competitionId,
            matchId = matchId,
            userId = seed.userId,
            request = UpdateCompetitionMatchResultRequest(
                listOf(
                    result(teams[0].competitionRegistration!!, place = 1, time = "3:12.4"),
                    result(teams[1].competitionRegistration!!, place = 1, time = "3:12.4"),
                )
            ),
        )

        val after = !CompetitionMatchTeamRepo.getByMatch(matchId)
        assertEquals(listOf(1, 1), after.map { it.place })
    }

    /** Ein Platz, der nicht auf die Anzahl der davor liegenden Boote folgt, bleibt eine Lücke. */
    @Test
    fun eineLueckeBleibtEineLuecke() = testComprehension {
        val seed = seedTwoRoundCompetition()
        val matchId = seed.firstRoundMatchIds.first()
        val teams = (!COMPETITION_MATCH_TEAM.select { COMPETITION_MATCH.eq(matchId) }).sortedBy { it.startNumber }

        assertKIOFails(CompetitionExecutionError.PlacesNotContinuous(expected = 2, actual = 3)) {
            CompetitionExecutionService.updateMatchResult(
                eventId = seed.eventId,
                competitionId = seed.competitionId,
                matchId = matchId,
                userId = seed.userId,
                request = UpdateCompetitionMatchResultRequest(
                    listOf(
                        result(teams[0].competitionRegistration!!, place = 1, time = null),
                        result(teams[1].competitionRegistration!!, place = 3, time = null),
                    )
                ),
            )
        }
    }
}
