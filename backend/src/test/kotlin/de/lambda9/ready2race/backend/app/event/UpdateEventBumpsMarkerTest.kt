package de.lambda9.ready2race.backend.app.event

import de.lambda9.ready2race.backend.app.competition.boundary.CompetitionService
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionError
import de.lambda9.ready2race.backend.app.competitionProperties.entity.CompetitionPropertiesRequest
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.app.event.boundary.EventService
import de.lambda9.ready2race.backend.app.event.entity.UpdateEventRequest
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Das große PUT der Veranstaltung schreibt Name, Veröffentlichung und Ergebnis-Sichtbarkeit - das
 * speist Boards und öffentliche Anzeigen, also muss der Marker steigen.
 */
class UpdateEventBumpsMarkerTest {

    @Test
    fun updatingTheEventBumpsTheChangeMarker() = testComprehension {
        val eventId = seedEvent()
        val user = seedClubWithUser(eventId, "A").user.id!!

        val before = EventChangeMarker.current(eventId)
        !EventService.updateEvent(UpdateEventRequest.example.copy(challengeResultType = null), user, eventId)
        assertTrue(EventChangeMarker.current(eventId) > before)
    }

    @Test
    fun updatingACompetitionThroughAnotherEventIsNotFound() = testComprehension {
        val eventId = seedEvent()
        val other = seedEvent()
        val competition = seedSingleCompetition(eventId, seedNamedParticipant())
        val user = seedClubWithUser(eventId, "A").user.id!!

        assertKIOFails(CompetitionError.CompetitionNotFound) {
            CompetitionService.updateCompetition(CompetitionPropertiesRequest.example, user, competition, other)
        }
    }
}
