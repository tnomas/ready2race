package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.MyEventService
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.createTestUser
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.provider
import de.lambda9.ready2race.backend.app.material.seedOpenTeamEvent
import de.lambda9.ready2race.backend.app.material.teamDto
import de.lambda9.ready2race.backend.app.material.upsertDto
import de.lambda9.ready2race.backend.app.qrCodeApp.control.QrCodeRepo
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.QrCodesRecord
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Der Materialblock in "Mein Event" (Task 3.4): eine echte Meldung aus der Material-Fixture
 * (`MaterialRegistrationFixture.kt`, Task 3.0/3.1), eine Anfrage über
 * [MaterialService.setRequestsForRegistration] darauf, und geprüft wird gegen den Sportler-
 * Endpunkt selbst - derselbe Weg, den auch das Telefon am Band nimmt.
 */
class MyEventMaterialTest {

    @Test
    fun materialRequestAppearsOnTheRegistrationAndWithdrawnOnesDoNot() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat = (
            !MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId)
                as ApiResponse.Created
            ).id
        val typeOars = (
            !MaterialService.addType(MaterialTypeRequest("Riemen", MaterialCategory.OTHER, null), userId)
                as ApiResponse.Created
            ).id

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

        // Beide angefragt, dann die Riemen wieder aus der Wunschliste genommen - genau der
        // Weg, über den eine Anfrage WITHDRAWN wird (siehe MaterialService.setRequestsForRegistration).
        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerBoat, offerOars), userId
        )
        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offerBoat), userId
        )

        val qrCode = "mein-event-material-${UUID.randomUUID()}"
        !QrCodeRepo.create(
            QrCodesRecord(
                id = UUID.randomUUID(),
                qrCodeId = qrCode,
                participant = seeded.participant1,
                event = seeded.eventId,
                createdAt = LocalDateTime.now(),
            )
        )

        val response = !MyEventService.getMyEvent(seeded.eventId, qrCode)
        val registration = response.dto.unscheduled.single { it.competitionId == seeded.competitionId }

        // Nur die Boot-Anfrage steht noch, die zurückgezogenen Riemen tauchen nicht auf.
        val material = registration.material.single()
        assertEquals("C4x+", material.typeName)
        assertEquals(MaterialCategory.BOAT, material.category)
        assertEquals("Bootshaus Nord", material.providerName)
        assertEquals(MaterialRequestStatus.REQUESTED, material.status)
        assertEquals(1, material.count)
        assertTrue(registration.material.none { it.typeName == "Riemen" })
    }
}
