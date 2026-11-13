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
import de.lambda9.ready2race.backend.app.appuser.entity.VerifyRegistrationRequest
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

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

    /**
     * Zwischen Registrierung und Bestätigung schaltet die Veranstaltung die Selbstmeldung ab (oder
     * schließt die Meldung). Die Bestätigung legt trotzdem Konto, Verein und Teilnehmer an - nur
     * die Wettkampfmeldung entfällt. Früher scheiterte die ganze Bestätigung, auf Dauer.
     */
    @Test
    fun confirmationAfterSelfRegistrationClosedKeepsTheAccountWithoutCompetitionRegistration() = testComprehension {
        val event = seedEvent(participantSelfRegistration = true)
        val c = seedSingleCompetition(event, seedNamedParticipant())
        val registerRequest = request(c)
        !AppUserService.register(registerRequest)

        !Jooq.query {
            update(EVENT).set(EVENT.PARTICIPANT_SELF_REGISTRATION, false).where(EVENT.ID.eq(event)).execute()
        }
        val token = !Jooq.query {
            select(APP_USER_REGISTRATION.TOKEN).from(APP_USER_REGISTRATION)
                .where(APP_USER_REGISTRATION.EMAIL.eq(registerRequest.email)).fetchOne(APP_USER_REGISTRATION.TOKEN)
        }

        !AppUserService.verifyRegistration(VerifyRegistrationRequest(token!!, "https://example.org/verify/"))

        val userCount = !Jooq.query { fetchCount(APP_USER, APP_USER.EMAIL.eq(registerRequest.email)) }
        assertEquals(1, userCount)
        val participant = !Jooq.query {
            selectFrom(PARTICIPANT).where(PARTICIPANT.EMAIL.eq(registerRequest.email)).fetchOne()
        }
        assertNotNull(participant)
        val competitionRegistrations = !Jooq.query {
            fetchCount(COMPETITION_REGISTRATION, COMPETITION_REGISTRATION.COMPETITION.eq(c))
        }
        assertEquals(0, competitionRegistrations)
    }

    @Test
    fun confirmationWhileStillOpenRegistersTheCompetition() = testComprehension {
        val event = seedEvent(participantSelfRegistration = true)
        val c = seedSingleCompetition(event, seedNamedParticipant())
        val registerRequest = request(c)
        !AppUserService.register(registerRequest)
        val token = !Jooq.query {
            select(APP_USER_REGISTRATION.TOKEN).from(APP_USER_REGISTRATION)
                .where(APP_USER_REGISTRATION.EMAIL.eq(registerRequest.email)).fetchOne(APP_USER_REGISTRATION.TOKEN)
        }

        !AppUserService.verifyRegistration(VerifyRegistrationRequest(token!!, "https://example.org/verify/"))

        val competitionRegistrations = !Jooq.query {
            fetchCount(COMPETITION_REGISTRATION, COMPETITION_REGISTRATION.COMPETITION.eq(c))
        }
        assertEquals(1, competitionRegistrations)
    }
}
