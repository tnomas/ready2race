package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.testing.ConcurrentTx
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * „Zu prüfen" (e): Eine Anfrage, die angelegt wird, während dieselbe Meldung gelöscht wird,
 * darf keine Waise hinterlassen. `setRequestsForRegistration` sperrt die Meldung per
 * `FOR KEY SHARE`: Läuft das Löschen zuerst, wartet die Anfrage und findet die Meldung danach
 * nicht mehr. Ohne Sperre läse sie den Stand vor dem Commit und legte eine Anfrage an, die der
 * Trigger des Löschens nie mehr sieht.
 */
class MaterialOrphanRaceTest {

    @Test
    fun requestRacingTheDeletionOfItsRegistrationLeavesNoOrphan() = testCommittingComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            upsertDto(seeded, listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2)))),
            seeded.user,
        )
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider("Rennen ${UUID.randomUUID()}"), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C1x ${UUID.randomUUID()}", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offer = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, null, 3, 30), userId)
                as ApiResponse.Created
            ).id

        val (_, second) = ConcurrentTx.runHoldingFirst(
            env,
            first = COMPETITION_REGISTRATION.delete { ID.eq(teamId) }.orDie(),
            second = MaterialService.setRequestsForRegistration(
                seeded.eventId, teamId, Privilege.Scope.GLOBAL to null, listOf(offer), userId,
            ),
        )

        second.fold(
            onSuccess = { fail("Die Anfrage hätte ihre gelöschte Meldung nicht mehr finden dürfen") },
            onError = { assertEquals(MaterialError.RegistrationNotFound, it) },
            onDefect = { fail("Die Anfrage starb: $it") },
        )
        assertTrue((!MaterialRequestRepo.forRegistration(teamId)).isEmpty())
    }
}
