package de.lambda9.ready2race.backend.app.competitionRegistration

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionError
import de.lambda9.ready2race.backend.app.competitionRegistration.boundary.CompetitionRegistrationService
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationError
import de.lambda9.ready2race.backend.app.competitionRegistration.entity.CompetitionRegistrationRequestProperties
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationNamedParticipantUpsertDto
import de.lambda9.ready2race.backend.app.eventRegistration.entity.CompetitionRegistrationTeamUpsertDto
import de.lambda9.ready2race.backend.app.invoice.entity.RegistrationInvoiceType
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION_NAMED_PARTICIPANT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Wer darf welche Wettkampfmeldung anlegen, ändern und löschen? Die Prüfung muss am Verein der
 * gespeicherten Meldung hängen, nicht an der Vereins-ID, die der Aufrufende im Körper mitschickt,
 * und der Wettkampf muss zur Veranstaltung im Pfad gehören.
 */
class CompetitionRegistrationScopeTest {

    private fun body(clubId: UUID, namedParticipantId: UUID, participantId: UUID) =
        CompetitionRegistrationTeamUpsertDto(
            id = null,
            clubId = clubId,
            optionalFees = emptyList(),
            namedParticipants = listOf(
                CompetitionRegistrationNamedParticipantUpsertDto(namedParticipantId, listOf(participantId))
            ),
            ratingCategory = null,
            callbackUrl = "https://example.com/challenge/",
        )

    private fun participantsOf(registrationId: UUID) = Jooq.query {
        select(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT)
            .from(COMPETITION_REGISTRATION_NAMED_PARTICIPANT)
            .where(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION.eq(registrationId))
            .fetch { it.value1() }
    }

    @Test
    fun ownScopeCannotOverwriteTheRegistrationOfAnotherClub() = testComprehension {
        val s = seedRegistrations()

        // Vertretung A schickt die eigene Vereins-ID mit, zielt aber auf Bs Meldung.
        assertKIOFails(CompetitionRegistrationError.NotFound) {
            CompetitionRegistrationService.update(
                request = body(s.a.clubId, s.namedParticipantId, s.a.participantId),
                eventId = s.eventId,
                competitionId = s.competitionId,
                competitionRegistrationId = s.registrationOfB,
                scope = Privilege.Scope.OWN,
                user = s.a.user,
                requestProperties = CompetitionRegistrationRequestProperties.None,
            )
        }

        assertEquals(listOf(s.b.participantId), !participantsOf(s.registrationOfB), "Bs Mannschaft bleibt")
    }

    @Test
    fun globalScopeCannotMoveARegistrationToAnotherClubByBody() = testComprehension {
        val s = seedRegistrations()

        assertKIOFails(CompetitionRegistrationError.NotFound) {
            CompetitionRegistrationService.update(
                request = body(s.a.clubId, s.namedParticipantId, s.a.participantId),
                eventId = s.eventId,
                competitionId = s.competitionId,
                competitionRegistrationId = s.registrationOfB,
                scope = Privilege.Scope.GLOBAL,
                user = s.a.user,
                requestProperties = CompetitionRegistrationRequestProperties.Permitted(RegistrationInvoiceType.REGULAR),
            )
        }
        assertEquals(listOf(s.b.participantId), !participantsOf(s.registrationOfB))
    }

    @Test
    fun ownScopeStillUpdatesTheOwnRegistration() = testComprehension {
        val s = seedRegistrations()
        val other = seedParticipant(s.b.clubId, "Ersatz B")

        !CompetitionRegistrationService.update(
            request = body(s.b.clubId, s.namedParticipantId, other),
            eventId = s.eventId,
            competitionId = s.competitionId,
            competitionRegistrationId = s.registrationOfB,
            scope = Privilege.Scope.OWN,
            user = s.b.user,
            requestProperties = CompetitionRegistrationRequestProperties.None,
        )

        assertEquals(listOf(other), !participantsOf(s.registrationOfB))
    }

    @Test
    fun competitionMustBelongToTheEventInThePath() = testComprehension {
        val s = seedRegistrations()
        val otherEvent = seedEvent()
        // A ist auch bei der anderen Veranstaltung gemeldet - ohne Bindung des Wettkampfs an die
        // Veranstaltung landete die neue Meldung an der falschen Veranstaltungsmeldung.
        val aInOther = seedClubWithUser(otherEvent, "A2")

        assertKIOFails(CompetitionError.CompetitionNotFound) {
            CompetitionRegistrationService.create(
                request = body(aInOther.clubId, s.namedParticipantId, aInOther.participantId),
                eventId = otherEvent,
                competitionId = s.competitionId,
                scope = Privilege.Scope.OWN,
                user = aInOther.user,
                requestProperties = CompetitionRegistrationRequestProperties.None,
            )
        }

        assertKIOFails(CompetitionError.CompetitionNotFound) {
            CompetitionRegistrationService.update(
                request = body(s.b.clubId, s.namedParticipantId, s.b.participantId),
                eventId = otherEvent,
                competitionId = s.competitionId,
                competitionRegistrationId = s.registrationOfB,
                scope = Privilege.Scope.OWN,
                user = s.b.user,
                requestProperties = CompetitionRegistrationRequestProperties.None,
            )
        }

        assertKIOFails(CompetitionError.CompetitionNotFound) {
            CompetitionRegistrationService.delete(
                eventId = otherEvent,
                competitionId = s.competitionId,
                competitionRegistrationId = s.registrationOfB,
                scope = Privilege.Scope.OWN,
                user = s.b.user,
            )
        }
    }

    @Test
    fun createInTheOwnClubWorks() = testComprehension {
        val s = seedRegistrations()

        !CompetitionRegistrationService.create(
            request = body(s.a.clubId, s.namedParticipantId, s.a.participantId),
            eventId = s.eventId,
            competitionId = s.competitionId,
            scope = Privilege.Scope.OWN,
            user = s.a.user,
            requestProperties = CompetitionRegistrationRequestProperties.None,
        )

        val count = !Jooq.query {
            fetchCount(COMPETITION_REGISTRATION, COMPETITION_REGISTRATION.CLUB.eq(s.a.clubId))
        }
        assertEquals(1, count)
    }

    /**
     * Ein Wettkampf mit erlaubter Nachmeldung ist im regulären Zeitraum genauso offen wie jeder
     * andere - die Sammelmeldung der Veranstaltung erlaubt ihn dort auch, und das Frontend sperrt
     * ihn nur im Nachmeldezeitraum, wenn die Nachmeldung NICHT erlaubt ist.
     */
    @Test
    fun lateAllowedCompetitionIsOpenDuringTheRegularPeriod() = testComprehension {
        val now = LocalDateTime.now()
        val eventId = seedEvent(now = now, lateRegistrationTo = now.plusDays(20))
        val np = seedNamedParticipant()
        val lateAllowed = seedSingleCompetition(eventId, np, lateRegistrationAllowed = true, identifier = "L")
        val regularOnly = seedSingleCompetition(eventId, np, lateRegistrationAllowed = false, identifier = "R")

        assertTrue(!CompetitionRepo.isOpenForRegistration(regularOnly, now))
        assertTrue(!CompetitionRepo.isOpenForRegistration(lateAllowed, now), "regulärer Zeitraum")
        assertTrue(!CompetitionRepo.isOpenForRegistration(lateAllowed, now.plusDays(15)), "Nachmeldezeitraum")
        assertEquals(false, !CompetitionRepo.isOpenForRegistration(regularOnly, now.plusDays(15)))
        assertEquals(false, !CompetitionRepo.isOpenForRegistration(lateAllowed, now.plusDays(25)))
    }
}
