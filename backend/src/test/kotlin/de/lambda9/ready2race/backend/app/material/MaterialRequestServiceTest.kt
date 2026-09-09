package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCapacityLevel
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Anfragen je Meldung: Ersetzen der Wunschliste, Ampel-Auslastung und die Prüfungen aus
 * [MaterialService.setRequestsForRegistration] (Bedarf, Sperre, doppelte Materialart). Nutzt die
 * Fixture aus `MaterialRegistrationFixture.kt` (Task 3.0) und ergänzt Anbieter, Einladung,
 * Angebote und Bedarf am Wettkampf.
 */
class MaterialRequestServiceTest {

    private data class Scenario(
        val eventId: UUID,
        val regId: UUID,
        val userId: UUID,
        val providerId: UUID,
        val typeBoat: UUID,
        val offerBoat: UUID,
        val offerOars: UUID,
    )

    /**
     * Team-Meldung (Task 3.0 Fixture) plus ein Anbieter mit zwei Angeboten (Boot und Riemen) für
     * genau die Materialarten, die der Wettkampf als Bedarf hinterlegt hat.
     */
    private fun TestComprehensionScope<JEnv>.setupScenario(): Scenario {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val typeOars =
            (!MaterialService.addType(MaterialTypeRequest("Riemen", MaterialCategory.OTHER, null), userId) as ApiResponse.Created).id

        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeBoat,
                    count = 1,
                ),
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeOars,
                    count = 8,
                ),
            )
        )

        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerBoat = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "45 €", 5, 30), userId)
                as ApiResponse.Created
            ).id
        val offerOars = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeOars, null, 20, 5), userId)
                as ApiResponse.Created
            ).id

        return Scenario(
            eventId = seeded.eventId,
            regId = teamId,
            userId = userId,
            providerId = providerId,
            typeBoat = typeBoat,
            offerBoat = offerBoat,
            offerOars = offerOars,
        )
    }

    @Test
    fun requestsAreReplacedButConfirmedSurvive() = testComprehension {
        val s = setupScenario()

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        val first = (!MaterialRequestRepo.forRegistration(s.regId)).single()
        !MaterialRequestRepo.update(first.id) { status = "CONFIRMED" }

        !MaterialService.setRequestsForRegistration(
            s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat, s.offerOars), s.userId
        )
        val after = !MaterialRequestRepo.forRegistration(s.regId)
        assertEquals("CONFIRMED", after.single { it.materialOffer == s.offerBoat }.status)
        assertEquals("REQUESTED", after.single { it.materialOffer == s.offerOars }.status)

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, emptyList(), s.userId)
        assertEquals(setOf("WITHDRAWN"), (!MaterialRequestRepo.forRegistration(s.regId)).map { it.status }.toSet())
    }

    @Test
    fun offerOfUndemandedTypeIsRejected() = testComprehension {
        val s = setupScenario()

        // Eine dritte Materialart, die der Wettkampf nicht als Bedarf hinterlegt hat.
        val undemandedType =
            (!MaterialService.addType(MaterialTypeRequest("Ergo", MaterialCategory.OTHER, null), s.userId) as ApiResponse.Created).id
        val undemandedOffer = (
            !MaterialService.addOffer(s.eventId, s.providerId, MaterialOfferRequest(undemandedType, null, 3, 10), s.userId)
                as ApiResponse.Created
            ).id

        assertKIOFails(MaterialError.TypeNotDemanded) {
            MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(undemandedOffer), s.userId)
        }
    }

    @Test
    fun closedProviderRejectsNewRequests() = testComprehension {
        val s = setupScenario()

        !MaterialService.setRequestsClosed(s.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RequestsClosed) {
            MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        }
    }

    @Test
    fun withdrawnRequestIsReactivatedWhenNamedAgain() = testComprehension {
        val s = setupScenario()

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, emptyList(), s.userId)
        val withdrawn = (!MaterialRequestRepo.forRegistration(s.regId)).single()
        assertEquals("WITHDRAWN", withdrawn.status)

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        val reactivated = (!MaterialRequestRepo.forRegistration(s.regId)).single()
        assertEquals(withdrawn.id, reactivated.id)
        assertEquals("REQUESTED", reactivated.status)
        assertEquals(null, reactivated.decidedAt)
    }

    @Test
    fun reactivationRespectsClosedProvider() = testComprehension {
        val s = setupScenario()

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, emptyList(), s.userId)
        !MaterialService.setRequestsClosed(s.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RequestsClosed) {
            MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        }
    }

    /**
     * Finding I-2 (Review 2026-09-07): `requests_closed` sperrte bisher nur neue bzw.
     * reaktivierte Anfragen, nicht den Rückzug - ein Verein konnte eine bereits bestätigte
     * Buchung nach dem Stichtag noch stornieren (Spec Abschnitt 4/7).
     */
    @Test
    fun closedProviderRejectsWithdrawalOfConfirmedRequest() = testComprehension {
        val s = setupScenario()

        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        val confirmed = (!MaterialRequestRepo.forRegistration(s.regId)).single { it.materialOffer == s.offerBoat }
        !MaterialRequestRepo.update(confirmed.id) { status = "CONFIRMED" }

        !MaterialService.setRequestsClosed(s.eventId, s.providerId, true, s.userId)

        assertKIOFails(MaterialError.RequestsClosed) {
            MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, emptyList(), s.userId)
        }

        // Nichts geändert - die Anfrage bleibt bestätigt, kein WITHDRAWN.
        val stillConfirmed = (!MaterialRequestRepo.forRegistration(s.regId)).single { it.materialOffer == s.offerBoat }
        assertEquals("CONFIRMED", stillConfirmed.status)
    }

    @Test
    fun capacityTurnsYellowAtPlannedCount() = testComprehension {
        val s = setupScenario()

        !MaterialService.updateOffer(s.eventId, s.providerId, s.offerBoat, MaterialOfferRequest(s.typeBoat, "45 €", 1, 30), s.userId)
        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)

        val yellow = !MaterialService.capacityLevels(s.eventId)
        assertEquals(MaterialCapacityLevel.YELLOW, yellow[s.offerBoat])

        !MaterialService.updateOffer(s.eventId, s.providerId, s.offerBoat, MaterialOfferRequest(s.typeBoat, "45 €", 2, 30), s.userId)

        val green = !MaterialService.capacityLevels(s.eventId)
        assertEquals(MaterialCapacityLevel.GREEN, green[s.offerBoat])
    }
}
