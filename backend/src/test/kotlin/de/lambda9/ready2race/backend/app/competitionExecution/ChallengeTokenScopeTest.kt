package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionChallengeService
import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionChallengeResultRequest
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationError
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedCompetitionRegistration
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesChallengeConfigRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_CHALLENGE_CONFIG
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import kotlin.test.Test

/**
 * Ein Challenge-Zugangstoken gehört einer Person in einer Veranstaltung. Ein Ergebnis einreichen
 * darf sie nur für eine Meldung, in der sie selbst steht - nicht für jede Mannschaft ihres Vereins.
 */
class ChallengeTokenScopeTest {

    @Test
    fun aTokenOnlySubmitsForTheOwnTeam() = testComprehension {
        val now = LocalDateTime.now()
        val eventId = seedEvent()
        !Jooq.query {
            update(EVENT).set(EVENT.CHALLENGE_EVENT, true).set(EVENT.SELF_SUBMISSION, true)
                .where(EVENT.ID.eq(eventId)).execute()
        }
        val np = seedNamedParticipant()
        val competitionId = seedSingleCompetition(eventId, np)
        val properties = !Jooq.query {
            selectFrom(COMPETITION_PROPERTIES).where(COMPETITION_PROPERTIES.COMPETITION.eq(competitionId)).fetchSingle()
        }
        !COMPETITION_SETUP.insert(CompetitionSetupRecord(competitionProperties = properties.id, createdAt = now, updatedAt = now))
        !COMPETITION_PROPERTIES_CHALLENGE_CONFIG.insert(
            CompetitionPropertiesChallengeConfigRecord(
                competitionProperties = properties.id,
                resultConfirmationImageRequired = false,
                startAt = now.minusDays(1),
                endAt = now.plusDays(1),
            )
        )
        !CompetitionExecutionChallengeService.createChallengeSetup(properties, SYSTEM_USER)

        val club = seedClubWithUser(eventId, "A")
        val teammate = seedCompetitionRegistration(competitionId, club, np)
        val me = seedParticipant(club.clubId, "Ich")
        val mine = seedCompetitionRegistration(competitionId, club, np, me)
        val token = RandomUtilities.token()
        !EVENT_PARTICIPANT.insert(EventParticipantRecord(event = eventId, participant = me, accessToken = token))

        assertKIOFails(CompetitionRegistrationError.NotFound) {
            CompetitionExecutionChallengeService.saveChallengeResult(
                token, competitionId, teammate, CompetitionChallengeResultRequest(result = 1000), null
            )
        }

        !CompetitionExecutionChallengeService.saveChallengeResult(
            token, competitionId, mine, CompetitionChallengeResultRequest(result = 1000), null
        )
    }
}
