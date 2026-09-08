package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.control.EventRegistrationRepo
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Fixierung mit `alignMaterialNumbers` (Task 4.2, Spec Abschnitt 8): Der [TeamNumberAlignment]-
 * Algorithmus wird hier nicht erneut geprüft (siehe [TeamNumberAlignmentTest], reine Funktion ohne
 * DB) - dieser Test prüft nur, dass [EventRegistrationService.finalizeRegistrations] die richtigen
 * Daten (Bootsnummern aus [MaterialService.boatNumbersForRegistrations], vorhandene Nummern) daran
 * übergibt und das Ergebnis in `competition_registration.team_number` landet.
 */
class FinalizeAlignmentTest {

    @Test
    fun rentedTeamGetsBoatNumberOwnTeamStaysBelow() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val rentedRegId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(rentedRegId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id

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
        // Zwei aktive Boote, Nummern 3 und 5 - das Mietteam bekommt eine davon als Startnummer.
        !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
        !MaterialService.addItem(providerId, MaterialItemRequest(typeBoat, 5, "Boot 5", null, MaterialItemStatus.ACTIVE), userId)

        !MaterialService.setRequestsForRegistration(
            seeded.eventId, rentedRegId, Privilege.Scope.GLOBAL to null, listOf(offerBoat), userId
        )
        val request = (!MaterialRequestRepo.forRegistration(rentedRegId)).single()
        !MaterialRequestRepo.update(request.id) { status = "CONFIRMED" }

        // Zweite Meldung im selben Wettkampf, ohne Mietboot - direkt eingefügt (wie
        // ClubChainFixture), weil für dieses Szenario keine echte Anmeldung mit Teilnehmern nötig
        // ist, nur eine zweite Startnummern-Kandidatin im selben Wettkampf.
        val eventRegistration = !EventRegistrationRepo.getByEventAndClub(seeded.eventId, seeded.clubId).orDie()
        val ownRegId = UUID.randomUUID()
        !COMPETITION_REGISTRATION.insert(
            CompetitionRegistrationRecord(
                id = ownRegId,
                eventRegistration = eventRegistration!!.id!!,
                competition = seeded.competitionId,
                club = seeded.clubId,
                name = "Eigenes Boot",
                createdAt = LocalDateTime.now(),
                updatedAt = LocalDateTime.now(),
            )
        )

        !EventRegistrationService.finalizeRegistrations(
            seeded.user.id!!, seeded.eventId, keepNumbers = false, alignMaterialNumbers = true,
        )

        val rentedReg = !COMPETITION_REGISTRATION.selectOne { ID.eq(rentedRegId) }
        val ownReg = !COMPETITION_REGISTRATION.selectOne { ID.eq(ownRegId) }

        assertTrue(rentedReg!!.teamNumber in setOf(3, 5))
        assertEquals(1, ownReg!!.teamNumber)
    }
}
