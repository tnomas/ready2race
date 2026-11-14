package de.lambda9.ready2race.backend.app.competitionDeregistration

import de.lambda9.ready2race.backend.app.competitionDeregistration.boundary.CompetitionDeregistrationService
import de.lambda9.ready2race.backend.app.competitionDeregistration.entity.CompetitionDeregistrationRequest
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationError
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedCompetitionRegistration
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_DEREGISTRATION
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Ab- und Wiederanmeldung gehören zum Wettkampf im Pfad und erreichen die öffentlichen Anzeigen.
 */
class CompetitionDeregistrationServiceTest {

    private data class Setup(val eventId: java.util.UUID, val competitionId: java.util.UUID, val other: java.util.UUID, val registration: java.util.UUID, val userId: java.util.UUID)

    /** Meldezeitraum vorbei - erst dann ist eine Abmeldung möglich. */
    private fun de.lambda9.ready2race.testing.kio.TestComprehensionScope<de.lambda9.ready2race.backend.app.JEnv>.setup(): Setup {
        val now = LocalDateTime.now()
        val eventId = seedEvent(now = now.minusDays(1), regularTo = now.minusHours(2))
        val np = seedNamedParticipant()
        val competitionId = seedSingleCompetition(eventId, np, identifier = "1")
        val other = seedSingleCompetition(eventId, np, identifier = "2")
        val club = seedClubWithUser(eventId, "A")
        val registration = seedCompetitionRegistration(competitionId, club, np)
        return Setup(eventId, competitionId, other, registration, club.user.id!!)
    }

    @Test
    fun registrationMustBelongToTheCompetition() = testComprehension {
        val s = setup()

        assertKIOFails(CompetitionRegistrationError.NotFound) {
            CompetitionDeregistrationService.createCompetitionDeregistration(
                s.userId, s.other, s.registration, CompetitionDeregistrationRequest(reason = null)
            )
        }
        assertEquals(0, !Jooq.query { fetchCount(COMPETITION_DEREGISTRATION) })

        assertKIOFails(CompetitionRegistrationError.NotFound) {
            CompetitionDeregistrationService.removeCompetitionDeregistration(s.other, s.registration)
        }
    }

    @Test
    fun deregistrationAndUndoBumpTheChangeMarker() = testComprehension {
        val s = setup()

        val before = EventChangeMarker.current(s.eventId)
        !CompetitionDeregistrationService.createCompetitionDeregistration(
            s.userId, s.competitionId, s.registration, CompetitionDeregistrationRequest(reason = "krank")
        )
        val afterCreate = EventChangeMarker.current(s.eventId)
        assertTrue(afterCreate > before, "Abmeldung bumpt")

        !CompetitionDeregistrationService.removeCompetitionDeregistration(s.competitionId, s.registration)
        assertTrue(EventChangeMarker.current(s.eventId) > afterCreate, "Wiederanmeldung bumpt")
    }
}
