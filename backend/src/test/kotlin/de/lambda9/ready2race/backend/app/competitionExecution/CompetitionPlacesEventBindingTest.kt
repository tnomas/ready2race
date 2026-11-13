package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionError
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test

/**
 * Die öffentlichen Platzierungen prüfen die Sichtbarkeit an der Veranstaltung im Pfad. Gehört der
 * Wettkampf nicht zu ihr, darf nichts herauskommen - sonst liest man über eine veröffentlichte
 * Veranstaltung die Namen aus einer unveröffentlichten.
 */
class CompetitionPlacesEventBindingTest {

    @Test
    fun placesOfAnotherEventsCompetitionAreNotFound() = testComprehension {
        val hiddenEvent = seedEvent(published = false)
        val hiddenCompetition = seedSingleCompetition(hiddenEvent, seedNamedParticipant())
        val visible = seedEvent(published = true)

        assertKIOFails(CompetitionError.CompetitionNotFound) {
            CompetitionExecutionService.getCompetitionPlaces(visible, hiddenCompetition, null)
        }
    }

    @Test
    fun placesStillComeForTheMatchingEvent() = testComprehension {
        val event = seedEvent(published = false)
        val competition = seedSingleCompetition(event, seedNamedParticipant())
        // GLOBAL sieht auch die unveröffentlichte Veranstaltung.
        !CompetitionExecutionService.getCompetitionPlaces(event, competition, Privilege.Scope.GLOBAL)
    }
}
