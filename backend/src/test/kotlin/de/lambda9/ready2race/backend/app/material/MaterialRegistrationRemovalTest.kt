package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.competitionRegistration.boundary.CompetitionRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.control.EventRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * RB-01: Verschwindet eine Meldung mit aktiver Materialanfrage endgültig, zählt das wie ein
 * Rückzug - auf jedem Weg, nicht nur über die Anfrage-Route. Der Verein (Meldeformular, eigenes
 * Löschen) wird bei geschlossener Vergabe abgewiesen; Veranstalter und Admin dürfen löschen. In
 * jedem Fall erfährt ein bestätigter Anbieter es per Rückzugs-Mail, und der Waisen-Trigger räumt
 * die Anfrage beim Commit weg.
 */
class MaterialRegistrationRemovalTest {

    private data class Scenario(
        val seeded: SeededTeamEvent,
        val teamId: UUID,
        val providerId: UUID,
        val userId: UUID,
        val contact: String,
        val requestId: UUID,
    )

    private fun TestComprehensionScope<JEnv>.setup(confirm: Boolean = true): Scenario {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, withTeam(seeded, teamId), seeded.user)

        val contact = "anbieter-${UUID.randomUUID()}@bootshaus.example"
        val userId = !createTestUser()
        val providerId = (
            !MaterialService.addProvider(MaterialProviderRequest("Bootshaus ${UUID.randomUUID()}", null, contact, null, null), userId)
                as ApiResponse.Created
            ).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+ ${UUID.randomUUID()}", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offer = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, null, 3, 30), userId)
                as ApiResponse.Created
            ).id
        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.OWN to seeded.clubId, listOf(offer), userId)
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id
        if (confirm) {
            !MaterialService.decideRequest(
                seeded.eventId, providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId,
            )
        }
        return Scenario(seeded, teamId, providerId, userId, contact, requestId)
    }

    private fun withTeam(seeded: SeededTeamEvent, teamId: UUID) =
        upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))))

    /** Wettkampf ganz abgewählt: das Formular schickt ihn gar nicht mehr. */
    private fun withoutCompetition(seeded: SeededTeamEvent) =
        EventRegistrationUpsertDto(
            participants = listOf(participantDto(seeded.participant1), participantDto(seeded.participant2)),
            competitionRegistrations = emptyList(),
            message = null,
            callbackUrl = null,
        )

    private fun TestComprehensionScope<JEnv>.mailsTo(recipient: String): Int =
        !Jooq.query { fetchCount(EMAIL, EMAIL.RECIPIENT.eq(recipient)) }

    /** Der aufgeschobene Waisen-Trigger feuert in einem zurückgerollten Test nur so. */
    private fun TestComprehensionScope<JEnv>.fireDeferredTriggers() {
        !Jooq.query { execute("set constraints all immediate") }
    }

    private fun globalUser(clubUser: AppUserWithPrivilegesRecord) =
        AppUserWithPrivilegesRecord(id = clubUser.id, club = null, language = "DE", firstname = "Ver", lastname = "Anstalter", email = "va@example.org")

    @Test
    fun clubRemovingATeamWithClosedRequestsIsRejected() = testComprehension {
        val s = setup()
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RemovalRequestsClosed) {
            EventRegistrationService.upsertRegistrationForEvent(s.seeded.eventId, upsertDto(s.seeded, emptyList()), s.seeded.user)
        }
    }

    @Test
    fun clubDeselectingTheCompetitionWithClosedRequestsIsRejected() = testComprehension {
        val s = setup(confirm = false)
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RemovalRequestsClosed) {
            EventRegistrationService.upsertRegistrationForEvent(s.seeded.eventId, withoutCompetition(s.seeded), s.seeded.user)
        }
    }

    @Test
    fun clubRemovingATeamWithConfirmedRequestMailsTheProvider() = testComprehension {
        val s = setup()
        assertEquals(0, mailsTo(s.contact))

        !EventRegistrationService.upsertRegistrationForEvent(s.seeded.eventId, withoutCompetition(s.seeded), s.seeded.user)
        fireDeferredTriggers()

        assertEquals(1, mailsTo(s.contact))
        // Die Mail nennt Wettkampf (Kennung + Name), Team (Verein, bei einem einzigen Team ohne
        // Meldungsnamen), Menge und Art.
        val body = !Jooq.query { select(EMAIL.BODY).from(EMAIL).where(EMAIL.RECIPIENT.eq(s.contact)).fetchSingle { it.value1()!! } }
        assertTrue(body.contains("1 Vierer ohne · Ruderclub Test ${s.seeded.clubId} · 1 × C4x+"), body)
        assertTrue((!MaterialRequestRepo.forRegistration(s.teamId)).isEmpty())
    }

    @Test
    fun removingAnUnconfirmedRequestSendsNoMail() = testComprehension {
        val s = setup(confirm = false)

        !EventRegistrationService.upsertRegistrationForEvent(s.seeded.eventId, upsertDto(s.seeded, emptyList()), s.seeded.user)
        fireDeferredTriggers()

        assertEquals(0, mailsTo(s.contact))
        assertTrue((!MaterialRequestRepo.forRegistration(s.teamId)).isEmpty())
    }

    /** Fehlender Test aus dem Review: erneutes Speichern mit Anfrage - die Anfrage bleibt dieselbe. */
    @Test
    fun resavingKeepsTheRequestAndItsId() = testComprehension {
        val s = setup()
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)

        // Auch bei geschlossener Vergabe: das Team bleibt, also ist nichts zurückgezogen.
        !EventRegistrationService.upsertRegistrationForEvent(s.seeded.eventId, withTeam(s.seeded, s.teamId), s.seeded.user)
        fireDeferredTriggers()

        val after = (!MaterialRequestRepo.forRegistration(s.teamId)).single()
        assertEquals(s.requestId, after.id)
        assertEquals(MaterialRequestStatus.CONFIRMED.name, after.status)
        assertEquals(0, mailsTo(s.contact))
    }

    @Test
    fun clubDeletingItsRegistrationWithClosedRequestsIsRejected() = testComprehension {
        val s = setup()
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RemovalRequestsClosed) {
            CompetitionRegistrationService.delete(
                s.seeded.eventId, s.seeded.competitionId, s.teamId, Privilege.Scope.OWN, s.seeded.user,
            )
        }
    }

    @Test
    fun organizerDeletingARegistrationIsAllowedAndMailsTheProvider() = testComprehension {
        val s = setup()
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)

        !CompetitionRegistrationService.delete(
            s.seeded.eventId, s.seeded.competitionId, s.teamId, Privilege.Scope.GLOBAL, globalUser(s.seeded.user),
        )
        fireDeferredTriggers()

        assertEquals(1, mailsTo(s.contact))
        assertTrue((!MaterialRequestRepo.forRegistration(s.teamId)).isEmpty())
    }

    @Test
    fun adminDeletingTheWholeClubRegistrationIsAllowedAndMailsTheProvider() = testComprehension {
        val s = setup()
        !MaterialService.setRequestsClosed(s.seeded.eventId, s.providerId, true, s.userId)
        val eventRegistrationId = (!EventRegistrationRepo.findByEventAndClub(s.seeded.eventId, s.seeded.clubId))!!.id

        !EventRegistrationService.deleteRegistration(eventRegistrationId)
        fireDeferredTriggers()

        assertEquals(1, mailsTo(s.contact))
        assertTrue((!MaterialRequestRepo.forRegistration(s.teamId)).isEmpty())
    }
}
