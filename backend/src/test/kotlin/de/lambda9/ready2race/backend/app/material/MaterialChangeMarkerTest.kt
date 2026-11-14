package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentEntry
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentsRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSeverity
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Der Änderungsmarker ([EventChangeMarker]) für die Materialvermietung: jede Mutation, die das
 * wirksame Boot je Lauf-Team (`effective_material_for_match_team`) oder die Materialanfragen in
 * Mein Event ändert, bumpt genau die betroffene Veranstaltung - sonst zeigen Boards, Mein Event,
 * Live-Läufe, Startliste und Stream die alte Zuteilung bis zum Ablauf ihres Zwischenspeichers.
 * Was keine Anzeige liest (Schadensakte, „Vergabe geschlossen", ein unveränderter Aufruf), bumpt
 * nicht. Außerhalb eines Requests wirkt der Bump sofort (siehe `AfterCommit.register`), deshalb
 * lässt er sich hier direkt am Zähler ablesen.
 */
class MaterialChangeMarkerTest {

    private data class Scenario(
        val eventId: UUID,
        val propertiesId: UUID,
        val regId: UUID,
        val userId: UUID,
        val providerId: UUID,
        val typeBoat: UUID,
        val offerBoat: UUID,
        val itemA: UUID,
        val itemB: UUID,
    )

    private fun TestComprehensionScope<JEnv>.setupScenario(): Scenario {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2)))),
            seeded.user,
        )

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerBoat = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "45 €", 5, 30), userId)
                as ApiResponse.Created
            ).id
        val itemA = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id
        val itemB = (
            !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 8, "Boot 8", null, MaterialItemStatus.ACTIVE), userId)
                as ApiResponse.Created
            ).id

        return Scenario(seeded.eventId, seeded.propertiesId, teamId, userId, providerId, typeBoat, offerBoat, itemA, itemB)
    }

    /** Anfrage stellen und bestätigen - der Ausgangspunkt für Zuteilung und Rücknahme. */
    private fun TestComprehensionScope<JEnv>.confirmedRequest(s: Scenario): UUID {
        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        val requestId = (!MaterialRequestRepo.forRegistration(s.regId)).single().id
        !MaterialService.decideRequest(
            s.eventId, s.providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), s.userId,
        )
        return requestId
    }

    private fun TestComprehensionScope<JEnv>.bumpsOf(eventId: UUID, action: TestComprehensionScope<JEnv>.() -> Unit): Long {
        val before = EventChangeMarker.current(eventId)
        action()
        return EventChangeMarker.current(eventId) - before
    }

    @Test
    fun requestChangesBumpButAnUnchangedListDoesNot() = testComprehension {
        val s = setupScenario()

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        }, "neue Anfrage erscheint in Mein Event")

        assertEquals(0, bumpsOf(s.eventId) {
            !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        }, "dieselbe Liste noch einmal ändert nichts")

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, emptyList(), s.userId)
        }, "Rückzug durch den Verein")
    }

    @Test
    fun decisionAndAssignmentsBump() = testComprehension {
        val s = setupScenario()
        !MaterialService.setRequestsForRegistration(s.eventId, s.regId, Privilege.Scope.GLOBAL to null, listOf(s.offerBoat), s.userId)
        val requestId = (!MaterialRequestRepo.forRegistration(s.regId)).single().id

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.decideRequest(
                s.eventId, s.providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), s.userId,
            )
        }, "Bestätigung")

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.setAssignments(
                s.eventId, s.providerId, requestId,
                MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemA, null))), s.userId,
            )
        }, "Grundzuteilung")

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.decideRequest(
                s.eventId, s.providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.DECLINED, "doch nicht"), s.userId,
            )
        }, "Rücknahme der Bestätigung nimmt das Boot von den Anzeigen")
    }

    @Test
    fun replacementAfterDamageBumpsButTheDamageItselfDoesNot() = testComprehension {
        val s = setupScenario()
        val requestId = confirmedRequest(s)
        val match = seedMatch(s.propertiesId, s.regId, startNumber = 7)
        !MaterialService.setAssignments(
            s.eventId, s.providerId, requestId,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemA, null))), s.userId,
        )

        fun damage(status: MaterialDamageStatus, repairedAt: java.time.LocalDateTime?) = MaterialDamageRequest(
            materialItem = s.itemA,
            reportedAt = seedTime,
            description = "Leck am Bug",
            severity = MaterialDamageSeverity.TOTAL,
            status = status,
            causedByRegistration = null,
            outOfServiceFrom = seedTime,
            outOfServiceUntil = null,
            repairedAt = repairedAt,
        )
        var damageId: UUID? = null
        assertEquals(0, bumpsOf(s.eventId) {
            damageId = (!MaterialService.addDamage(s.providerId, damage(MaterialDamageStatus.REPORTED, null), s.userId) as ApiResponse.Created).id
        }, "keine Anzeige liest die Schadensakte")
        assertEquals(0, bumpsOf(s.eventId) {
            !MaterialService.updateDamage(
                s.providerId, damageId!!,
                damage(MaterialDamageStatus.REPAIRED, seedTime.plusHours(2)), s.userId,
            )
        }, "Reparatur beendet nur das Fenster")

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.setAssignments(
                s.eventId, s.providerId, requestId,
                MaterialAssignmentsRequest(
                    listOf(MaterialAssignmentEntry(s.itemA, null), MaterialAssignmentEntry(s.itemB, match.matchId))
                ),
                s.userId,
            )
        }, "Ersatzwahl als Ausnahme je Lauf")
    }

    @Test
    fun masterDataChangesBumpTheEventsThatShowThem() = testComprehension {
        val s = setupScenario()
        val requestId = confirmedRequest(s)
        !MaterialService.setAssignments(
            s.eventId, s.providerId, requestId,
            MaterialAssignmentsRequest(listOf(MaterialAssignmentEntry(s.itemA, null))), s.userId,
        )

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.updateItem(
                s.providerId, s.itemA, MaterialItemRequest(s.typeBoat, 17, "Boot 17", null, MaterialItemStatus.ACTIVE), s.userId,
            )
        }, "zugeteiltes Stück umbenannt")
        assertEquals(0, bumpsOf(s.eventId) {
            !MaterialService.updateItem(
                s.providerId, s.itemB, MaterialItemRequest(s.typeBoat, 18, "Boot 18", null, MaterialItemStatus.ACTIVE), s.userId,
            )
        }, "nicht zugeteiltes Stück steht auf keiner Anzeige")

        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.updateProvider(s.providerId, provider("Bootshaus Süd"), s.userId)
        }, "Anbietername in Mein Event")
        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.updateType(s.typeBoat, MaterialTypeRequest("C4x+ neu", MaterialCategory.BOAT, null), s.userId)
        }, "Name und Kategorie der Art")
        assertEquals(1, bumpsOf(s.eventId) {
            !MaterialService.updateOffer(s.eventId, s.providerId, s.offerBoat, MaterialOfferRequest(s.typeBoat, "50 €", 5, 30), s.userId)
        }, "Angebot (Art kann wechseln)")
    }

    @Test
    fun pureConfigurationDoesNotBump() = testComprehension {
        val s = setupScenario()

        assertEquals(0, bumpsOf(s.eventId) {
            !MaterialService.setRequestsClosed(s.eventId, s.providerId, true, s.userId)
        }, "Vergabe geschlossen ist reine Konfiguration")
    }

    @Test
    fun finalizingRegistrationsBumps() = testComprehension {
        val s = setupScenario()

        assertEquals(1, bumpsOf(s.eventId) {
            !EventRegistrationService.finalizeRegistrations(s.userId, s.eventId, keepNumbers = false, alignMaterialNumbers = true)
        }, "Fixierung vergibt die Nummern neu")
    }
}
