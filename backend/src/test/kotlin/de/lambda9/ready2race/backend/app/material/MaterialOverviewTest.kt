package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentEntry
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentsRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Anbieter-Dashboard (Task 4.1): Übersicht, Entscheidung und Zuteilung. Nutzt die Fixture aus
 * `MaterialRegistrationFixture.kt` (Task 3.0/3.1) und ergänzt sie um einen Lauf ([seedMatch]) für
 * die Übersicht und die Ausnahme je Lauf bei der Zuteilung.
 */
class MaterialOverviewTest {

    private data class Scenario(
        val eventId: UUID,
        val propertiesId: UUID,
        val regId: UUID,
        val userId: UUID,
        val providerId: UUID,
        val typeBoat: UUID,
        val typeOars: UUID,
        val offerBoat: UUID,
        val itemBoat: UUID,
        val requestId: UUID,
    )

    /**
     * Team-Meldung mit einer bestätigungsfähigen Anfrage auf ein Boot: Anbieter, Bootsart mit
     * einem Stück, Zubehörart (für den Typ-Fehlerfall), Bedarf und Angebot, Einladung, Anfrage.
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
            (!MaterialService.addType(MaterialTypeRequest("Skulls", MaterialCategory.OTHER, null), userId) as ApiResponse.Created).id

        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(
                CompetitionPropertiesHasMaterialTypeRecord(
                    competitionProperties = seeded.propertiesId,
                    materialType = typeBoat,
                    count = 1,
                )
            )
        )

        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerBoat = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "45 €", 5, 30), userId)
                as ApiResponse.Created
            ).id
        val itemBoat = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id

        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerBoat), userId)
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id

        return Scenario(
            eventId = seeded.eventId,
            propertiesId = seeded.propertiesId,
            regId = teamId,
            userId = userId,
            providerId = providerId,
            typeBoat = typeBoat,
            typeOars = typeOars,
            offerBoat = offerBoat,
            itemBoat = itemBoat,
            requestId = requestId,
        )
    }

    @Test
    fun overviewListsRequestWithTeamNumberAndMatch() = testComprehension {
        val s = setupScenario()

        // Startnummer sitzt an der Meldung (finalizeRegistrations), nicht am Lauf-Team - Task 4.1
        // liest sie direkt von dort, unabhängig von einer Fixierung.
        !COMPETITION_REGISTRATION.update({ teamNumber = 3 }) { ID.eq(s.regId) }
        val match = seedMatch(s.propertiesId, s.regId)

        val overview = (!MaterialService.getOverview(s.eventId, s.providerId)).dto

        val request = overview.requests.single()
        assertEquals(3, request.teamNumber)
        assertEquals(s.regId, request.competitionRegistration)

        val overviewMatch = overview.matches.single()
        assertEquals(match.matchId, overviewMatch.id)
        assertTrue(overviewMatch.registrationIds.contains(s.regId))

        assertTrue(overview.items.any { it.id == s.itemBoat })
        assertTrue(overview.offers.any { it.id == s.offerBoat })
    }

    @Test
    fun assignmentRejectsWrongType() = testComprehension {
        val s = setupScenario()
        !MaterialRequestRepo.update(s.requestId) { status = "CONFIRMED" }

        val oarsItem = (
            !MaterialService.addItem(s.providerId, MaterialItemRequest(s.typeOars, null, "Skulls 1", null, MaterialItemStatus.ACTIVE), s.userId)
                as ApiResponse.Created
            ).id

        assertKIOFails(MaterialError.WrongItemType) {
            MaterialService.setAssignments(
                s.eventId, s.providerId, s.requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(oarsItem, null))),
                s.userId,
            )
        }
    }

    @Test
    fun assignmentPerMatchNeedsTeamInMatch() = testComprehension {
        val s = setupScenario()
        !MaterialRequestRepo.update(s.requestId) { status = "CONFIRMED" }

        // Ein Lauf, in dem die Meldung nicht steht - keine echte competition_match_team-Zeile dazu.
        val foreignMatch = UUID.randomUUID()

        assertKIOFails(MaterialError.MatchNotOfRegistration) {
            MaterialService.setAssignments(
                s.eventId, s.providerId, s.requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemBoat, foreignMatch))),
                s.userId,
            )
        }
    }

    @Test
    fun assignmentSucceedsForConfirmedRequestAndOwnMatch() = testComprehension {
        val s = setupScenario()
        !MaterialRequestRepo.update(s.requestId) { status = "CONFIRMED" }
        val match = seedMatch(s.propertiesId, s.regId)

        !MaterialService.setAssignments(
            s.eventId, s.providerId, s.requestId,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemBoat, match.matchId))),
            s.userId,
        )

        val overview = (!MaterialService.getOverview(s.eventId, s.providerId)).dto
        val assignment = overview.requests.single().assignments.single()
        assertEquals(s.itemBoat, assignment.materialItem)
        assertEquals(match.matchId, assignment.competitionMatch)
    }

    @Test
    fun decisionSetsDecidedAt() = testComprehension {
        val s = setupScenario()

        !MaterialService.decideRequest(
            s.eventId, s.providerId, s.requestId,
            MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null),
            s.userId,
        )

        val decided = (!MaterialRequestRepo.forRegistration(s.regId)).single()
        assertEquals("CONFIRMED", decided.status)
        assertNotNull(decided.decidedAt)
    }

    @Test
    fun withdrawnRequestCannotBeDecidedOrAssigned() = testComprehension {
        val s = setupScenario()
        !MaterialRequestRepo.update(s.requestId) { status = "WITHDRAWN" }

        assertKIOFails(MaterialError.RequestNotFound) {
            MaterialService.decideRequest(
                s.eventId, s.providerId, s.requestId,
                MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null),
                s.userId,
            )
        }
        assertKIOFails(MaterialError.RequestNotFound) {
            MaterialService.setAssignments(
                s.eventId, s.providerId, s.requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemBoat, null))),
                s.userId,
            )
        }
    }

    @Test
    fun assignmentRequiresConfirmedRequest() = testComprehension {
        val s = setupScenario()
        // s.requestId bleibt REQUESTED - noch keine Entscheidung des Anbieters.

        assertKIOFails(MaterialError.RequestNotConfirmed) {
            MaterialService.setAssignments(
                s.eventId, s.providerId, s.requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemBoat, null))),
                s.userId,
            )
        }
    }

    @Test
    fun assignmentRejectsItemOfForeignProvider() = testComprehension {
        val s = setupScenario()
        !MaterialRequestRepo.update(s.requestId) { status = "CONFIRMED" }

        val otherProviderId = (!MaterialService.addProvider(provider("Anderer Anbieter"), s.userId) as ApiResponse.Created).id
        val foreignItem = (
            !MaterialService.addItem(otherProviderId, MaterialItemRequest(s.typeBoat, 9, "Boot 9", null, MaterialItemStatus.ACTIVE), s.userId)
                as ApiResponse.Created
            ).id

        assertKIOFails(MaterialError.ItemNotOfProvider) {
            MaterialService.setAssignments(
                s.eventId, s.providerId, s.requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(foreignItem, null))),
                s.userId,
            )
        }
    }

    @Test
    fun decisionRejectsInvalidStatus() = testComprehension {
        val s = setupScenario()

        // Weder REQUESTED (Ausgangszustand) noch WITHDRAWN (Sache des Vereins) sind gültige Ziele
        // einer Entscheidung - MaterialDecisionRequest.validate() lehnt das schon vor dem Service ab.
        assertTrue(MaterialDecisionRequest(MaterialRequestStatus.WITHDRAWN, null).validate() != de.lambda9.ready2race.backend.validation.ValidationResult.Valid)
        assertTrue(MaterialDecisionRequest(MaterialRequestStatus.REQUESTED, null).validate() != de.lambda9.ready2race.backend.validation.ValidationResult.Valid)
    }
}
