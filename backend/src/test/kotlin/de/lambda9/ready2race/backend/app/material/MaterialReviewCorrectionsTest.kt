package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
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
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.EFFECTIVE_MATERIAL_FOR_MATCH_TEAM
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.select
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Korrekturen aus dem Schlussreview Backend (RB-02 bis RB-07, „Zu prüfen" b und e, fehlende
 * Tests): deterministische Sicht, Artwechsel, Startnummern nach Bootsnummern mit vorhandener
 * Grundzuteilung, Schadensakte beim Löschen, doppelte und ausgemusterte Zuteilungen, Rücknahme
 * einer Bestätigung, fremde Schadensakten, Startnummer je Lauf in der Übersicht, Waisen.
 */
class MaterialReviewCorrectionsTest {

    private data class Scenario(
        val seeded: SeededTeamEvent,
        val teamId: UUID,
        val userId: UUID,
        val providerId: UUID,
        val typeBoat: UUID,
        val offerBoat: UUID,
        val requestId: UUID,
        val item3: UUID,
        val item5: UUID,
        val item7: UUID,
    )

    private fun TestComprehensionScope<JEnv>.item(providerId: UUID, type: UUID, number: Int?, userId: UUID, status: MaterialItemStatus = MaterialItemStatus.ACTIVE) =
        (!MaterialService.addItem(providerId, MaterialItemRequest(type, number, "Boot $number", null, status), userId) as ApiResponse.Created).id

    /** Gemeldetes Team, Anbieter mit Boots-Angebot (Menge 2 im Bedarf), Boote 3/5/7, Anfrage bestätigt. */
    private fun TestComprehensionScope<JEnv>.setup(): Scenario {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2)))),
            seeded.user,
        )
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider("Bootshaus ${UUID.randomUUID()}"), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C2x ${UUID.randomUUID()}", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 2))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerBoat = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, null, 5, 30), userId)
                as ApiResponse.Created
            ).id
        val item7 = item(providerId, typeBoat, 7, userId)
        val item5 = item(providerId, typeBoat, 5, userId)
        val item3 = item(providerId, typeBoat, 3, userId)
        !MaterialService.setRequestsForRegistration(seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerBoat), userId)
        val requestId = (!MaterialRequestRepo.forRegistration(teamId)).single().id
        confirm(seeded.eventId, providerId, requestId, userId)
        return Scenario(seeded, teamId, userId, providerId, typeBoat, offerBoat, requestId, item3, item5, item7)
    }

    private fun TestComprehensionScope<JEnv>.confirm(eventId: UUID, providerId: UUID, requestId: UUID, userId: UUID) =
        !MaterialService.decideRequest(eventId, providerId, requestId, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), userId)

    private fun TestComprehensionScope<JEnv>.assign(s: Scenario, vararg entries: MaterialAssignmentEntry) =
        MaterialService.setAssignments(s.seeded.eventId, s.providerId, s.requestId, MaterialAssignmentsRequest(entries.toList()), s.userId)

    /** Zweiter Lauf im Setup aus [seedMatch] (das Setup darf es je Wettkampf nur einmal geben). */
    private fun TestComprehensionScope<JEnv>.secondMatch(roundId: UUID, registrationId: UUID, startNumber: Int): UUID {
        val matchId = UUID.randomUUID()
        !COMPETITION_SETUP_MATCH.insert(
            CompetitionSetupMatchRecord(id = matchId, competitionSetupRound = roundId, weighting = 1, name = "Lauf 2", executionOrder = 2, teams = 1)
        )
        !COMPETITION_MATCH.insert(CompetitionMatchRecord(competitionSetupMatch = matchId, startTime = seedTime, createdAt = seedTime, updatedAt = seedTime))
        !COMPETITION_MATCH_TEAM.insert(
            CompetitionMatchTeamRecord(
                id = UUID.randomUUID(), competitionMatch = matchId, competitionRegistration = registrationId,
                startNumber = startNumber, createdAt = seedTime, updatedAt = seedTime,
            )
        )
        return matchId
    }

    private fun damage(item: UUID) = MaterialDamageRequest(
        materialItem = item,
        reportedAt = seedTime,
        description = "Kratzer am Bug",
        severity = MaterialDamageSeverity.MINOR,
        status = MaterialDamageStatus.REPORTED,
        causedByRegistration = null,
        outOfServiceFrom = null,
        outOfServiceUntil = null,
        repairedAt = null,
    )

    // RB-02 -------------------------------------------------------------------------------

    @Test
    fun viewPicksTheSmallestNumberAmongBaseAssignmentsAndAmongExceptions() = testComprehension {
        val s = setup()
        val match1 = seedMatch(s.seeded.propertiesId, s.teamId, startNumber = 3)
        val match2 = secondMatch(match1.roundId, s.teamId, startNumber = 5)

        // Absichtlich die höheren Nummern zuerst: zwei Grundzuteilungen (7, 3), zwei Ausnahmen im Lauf 2 (7, 5).
        !assign(
            s,
            MaterialAssignmentEntry(s.item7, null),
            MaterialAssignmentEntry(s.item3, null),
            MaterialAssignmentEntry(s.item7, match2),
            MaterialAssignmentEntry(s.item5, match2),
        )

        val team1 = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match1.matchId, s.teamId))!!
        val team2 = (!CompetitionMatchTeamRepo.getByMatchAndRegistrationId(match2, s.teamId))!!
        val row1 = (!EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(team1.id) }).single()
        val row2 = (!EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.select { COMPETITION_MATCH_TEAM.eq(team2.id) }).single()

        assertEquals(3, row1.number)
        assertEquals(false, row1.deviatesFromStartNumber)
        assertEquals(5, row2.number)
        assertEquals(false, row2.deviatesFromStartNumber)
    }

    // RB-03 -------------------------------------------------------------------------------

    @Test
    fun offerTypeIsLockedOnceRequestsExist() = testComprehension {
        val s = setup()
        val otherType =
            (!MaterialService.addType(MaterialTypeRequest("Ergo ${UUID.randomUUID()}", MaterialCategory.OTHER, null), s.userId) as ApiResponse.Created).id

        assertKIOFails(MaterialError.OfferTypeLocked) {
            MaterialService.updateOffer(s.seeded.eventId, s.providerId, s.offerBoat, MaterialOfferRequest(otherType, null, 5, 30), s.userId)
        }
        // Preis, Menge, Wechselzeit bleiben änderbar.
        assertKIOSucceeds {
            MaterialService.updateOffer(s.seeded.eventId, s.providerId, s.offerBoat, MaterialOfferRequest(s.typeBoat, "50 €", 9, 15), s.userId)
        }
    }

    @Test
    fun itemTypeIsLockedWhileAssigned() = testComprehension {
        val s = setup()
        val otherType =
            (!MaterialService.addType(MaterialTypeRequest("C4x ${UUID.randomUUID()}", MaterialCategory.BOAT, null), s.userId) as ApiResponse.Created).id
        !assign(s, MaterialAssignmentEntry(s.item3, null))

        assertKIOFails(MaterialError.ItemTypeLocked) {
            MaterialService.updateItem(s.providerId, s.item3, MaterialItemRequest(otherType, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), s.userId)
        }
        // Ein nicht zugeteiltes Stück darf die Art wechseln.
        assertKIOSucceeds {
            MaterialService.updateItem(s.providerId, s.item5, MaterialItemRequest(otherType, 5, "Boot 5", null, MaterialItemStatus.ACTIVE), s.userId)
        }
    }

    // RB-04 -------------------------------------------------------------------------------

    @Test
    fun finalizeKeepsTheNumberOfAnAlreadyAssignedBoat() = testComprehension {
        val s = setup()
        // Grundzuteilung Boot 5 vor der Fixierung; ohne die Korrektur wäre 3, 5 oder 7 verlost worden.
        !assign(s, MaterialAssignmentEntry(s.item5, null))

        repeat(5) {
            !EventRegistrationService.finalizeRegistrations(s.seeded.user.id!!, s.seeded.eventId, keepNumbers = false, alignMaterialNumbers = true)
            assertEquals(5, (!COMPETITION_REGISTRATION.selectOne { ID.eq(s.teamId) })!!.teamNumber)
        }
    }

    // RB-06 -------------------------------------------------------------------------------

    @Test
    fun itemWithDamagesCannotBeDeletedButRetired() = testComprehension {
        val s = setup()
        !MaterialService.addDamage(s.providerId, damage(s.item5), s.userId)

        assertKIOFails(MaterialError.ItemHasDamages) { MaterialService.deleteItem(s.providerId, s.item5) }
        assertKIOSucceeds {
            MaterialService.updateItem(s.providerId, s.item5, MaterialItemRequest(s.typeBoat, 5, "Boot 5", null, MaterialItemStatus.RETIRED), s.userId)
        }
        // Ohne Schaden und Zuteilung bleibt Löschen erlaubt.
        assertKIOSucceeds { MaterialService.deleteItem(s.providerId, s.item7) }
    }

    // RB-07 -------------------------------------------------------------------------------

    @Test
    fun duplicateAssignmentIsAClientError() = testComprehension {
        val s = setup()
        assertKIOFails(MaterialError.DuplicateAssignment) {
            assign(s, MaterialAssignmentEntry(s.item3, null), MaterialAssignmentEntry(s.item3, null))
        }
        assertEquals(422, MaterialError.DuplicateAssignment.respond().status.value)
    }

    // Zu prüfen (b) -----------------------------------------------------------------------

    @Test
    fun retiredItemIsNotNewlyAssignableButMayStay() = testComprehension {
        val s = setup()
        !assign(s, MaterialAssignmentEntry(s.item3, null))
        !MaterialService.updateItem(s.providerId, s.item3, MaterialItemRequest(s.typeBoat, 3, "Boot 3", null, MaterialItemStatus.RETIRED), s.userId)
        val retired = item(s.providerId, s.typeBoat, 9, s.userId, MaterialItemStatus.RETIRED)

        assertKIOFails(MaterialError.ItemRetired) { assign(s, MaterialAssignmentEntry(retired, null)) }
        // Das schon zugeteilte, inzwischen ausgemusterte Stück bleibt beim erneuten Speichern stehen.
        assertKIOSucceeds { assign(s, MaterialAssignmentEntry(s.item3, null), MaterialAssignmentEntry(s.item5, null)) }
    }

    // Bestätigt -> abgelehnt -> bestätigt ---------------------------------------------------

    @Test
    fun withdrawingAConfirmationReleasesTheAssignments() = testComprehension {
        val s = setup()
        !assign(s, MaterialAssignmentEntry(s.item3, null))

        !MaterialService.decideRequest(
            s.seeded.eventId, s.providerId, s.requestId, MaterialDecisionRequest(MaterialRequestStatus.DECLINED, "doch kein Boot"), s.userId,
        )
        confirm(s.seeded.eventId, s.providerId, s.requestId, s.userId)

        val overview = (!MaterialService.getOverview(s.seeded.eventId, s.providerId)).dto
        assertTrue(overview.requests.single { it.id == s.requestId }.assignments.isEmpty())
    }

    // updateDamage am fremden Stück ---------------------------------------------------------

    @Test
    fun damagesOfAnotherProviderStayInvisible() = testComprehension {
        val s = setup()
        val ownDamage = (!MaterialService.addDamage(s.providerId, damage(s.item3), s.userId) as ApiResponse.Created).id

        val otherProvider =
            (!MaterialService.addProvider(MaterialProviderRequest("Fremd ${UUID.randomUUID()}", null, null, null, null), s.userId) as ApiResponse.Created).id
        val foreignItem = item(otherProvider, s.typeBoat, 1, s.userId)
        val foreignDamage = (!MaterialService.addDamage(otherProvider, damage(foreignItem), s.userId) as ApiResponse.Created).id

        // Fremde Akte über die eigene Anbieter-ID: wie nicht vorhanden.
        assertKIOFails(MaterialError.DamageNotFound) {
            MaterialService.updateDamage(s.providerId, foreignDamage, damage(s.item3), s.userId)
        }
        // Eigene Akte, aber auf ein fremdes Stück umgehängt: abgewiesen.
        assertKIOFails(MaterialError.ItemNotFound) {
            MaterialService.updateDamage(s.providerId, ownDamage, damage(foreignItem), s.userId)
        }
    }

    // Startnummer je Lauf in der Übersicht ---------------------------------------------------

    @Test
    fun overviewCarriesTheStartNumberPerMatch() = testComprehension {
        val s = setup()
        val match1 = seedMatch(s.seeded.propertiesId, s.teamId, startNumber = 4)
        val match2 = secondMatch(match1.roundId, s.teamId, startNumber = 2)

        val matches = (!MaterialService.getOverview(s.seeded.eventId, s.providerId)).dto.matches.associateBy { it.id }
        assertEquals(4, matches.getValue(match1.matchId).teams.single { it.competitionRegistration == s.teamId }.startNumber)
        assertEquals(2, matches.getValue(match2).teams.single { it.competitionRegistration == s.teamId }.startNumber)
    }

    // Zu prüfen (e) / Seed-Waisen ------------------------------------------------------------

    @Test
    fun orphanRequestsAreNotCounted() = testComprehension {
        val s = setup()
        val before = !MaterialRequestRepo.capacityForOffers(s.seeded.eventId)
        val providersBefore = (!MaterialService.getEventProviders(s.seeded.eventId)).data.single { it.materialProvider == s.providerId }

        // Anfrage an einer Meldung, die es nicht gibt (der aufgeschobene Trigger hätte sie erst beim Commit entfernt).
        !MaterialRequestRepo.create(
            MaterialRequestRecord(
                id = UUID.randomUUID(),
                competitionRegistration = UUID.randomUUID(),
                materialOffer = s.offerBoat,
                count = 4,
                status = MaterialRequestStatus.REQUESTED.name,
                requestedAt = seedTime,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )

        assertEquals(before, !MaterialRequestRepo.capacityForOffers(s.seeded.eventId))
        val providersAfter = (!MaterialService.getEventProviders(s.seeded.eventId)).data.single { it.materialProvider == s.providerId }
        assertEquals(providersBefore, providersAfter)
    }
}
