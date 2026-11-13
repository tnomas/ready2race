package de.lambda9.ready2race.backend.app.appuser

import de.lambda9.ready2race.backend.app.appuser.boundary.AppUserService
import de.lambda9.ready2race.backend.app.appuser.entity.AppUserRegisterRequest
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionError
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationError
import de.lambda9.ready2race.backend.app.eventRegistration.entity.ParticipantRegisterCompetitionRequest
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test

/**
 * Die öffentliche Registrierung mit Wettkampfmeldung muss dieselben Bedingungen erfüllen wie die
 * Teilnehmer-Selbstmeldung - sonst hängt man über sie Wettkämpfe fremder, geschlossener oder
 * unveröffentlichter Veranstaltungen an die Meldung einer offenen.
 */
class RegisterWithCompetitionsTest {

    private fun request(vararg competitions: UUID) = AppUserRegisterRequest(
        email = "neu-${UUID.randomUUID()}@example.org",
        password = "5kFlg09?\$!dF",
        firstname = "Neue",
        lastname = "Person",
        clubId = null,
        clubname = "Neuer Verein ${UUID.randomUUID()}",
        language = EmailLanguage.DE,
        callbackUrl = "https://example.org/verify/",
        registerToSingleCompetitions = competitions.map { ParticipantRegisterCompetitionRequest(it, null, null) },
        birthYear = 1990,
        gender = Gender.F,
    )

    @Test
    fun competitionsMustAllBelongToOneEvent() = testComprehension {
        val open = seedEvent(participantSelfRegistration = true)
        val other = seedEvent(participantSelfRegistration = false, published = false)
        val np = seedNamedParticipant()
        val a = seedSingleCompetition(open, np, identifier = "A")
        val b = seedSingleCompetition(other, np, identifier = "B")

        assertKIOFails(CompetitionError.CompetitionNotFound) { AppUserService.register(request(a, b)) }
    }

    @Test
    fun eventMustAllowSelfRegistration() = testComprehension {
        val closedForSelf = seedEvent(participantSelfRegistration = false)
        val c = seedSingleCompetition(closedForSelf, seedNamedParticipant())

        assertKIOFails(EventRegistrationError.SelfRegistrationNotAllowed) { AppUserService.register(request(c)) }
    }

    @Test
    fun aRegularSelfRegistrationStillWorks() = testComprehension {
        val open = seedEvent(participantSelfRegistration = true)
        val c = seedSingleCompetition(open, seedNamedParticipant())

        !AppUserService.register(request(c))
    }
}
