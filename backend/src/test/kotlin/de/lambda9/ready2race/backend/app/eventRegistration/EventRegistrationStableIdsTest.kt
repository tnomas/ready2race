package de.lambda9.ready2race.backend.app.eventRegistration

import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.createTestUser
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.provider
import de.lambda9.ready2race.backend.app.material.seedOpenTeamEvent
import de.lambda9.ready2race.backend.app.material.seedTime
import de.lambda9.ready2race.backend.app.material.teamDto
import de.lambda9.ready2race.backend.app.material.upsertDto
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Meldungs-IDs müssen ein erneutes Speichern der Anmeldung überleben, weil Materialanfragen der
 * Materialvermietung an der Meldung hängen (Task 3.0). Die Anmeldung löscht beim Speichern alle
 * nicht gesperrten Meldungen und legt sie neu an - dieser Test belegt, dass eine vom Formular
 * zurückgegebene ID dabei erhalten bleibt, und dass eine wirklich entfernte Meldung ihre
 * Materialanfrage mitnimmt, ohne die aufgeschobene Fremdschlüsselprüfung zu verletzen.
 *
 * Die Seed-Hilfen liegen in `app/material/MaterialRegistrationFixture.kt` - geteilt mit
 * `MaterialRequestServiceTest` (Task 3.1), die dieselbe Ausgangslage braucht.
 */
class EventRegistrationStableIdsTest {

    @Test
    fun teamIdSurvivesResave() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)
        // Erneutes Speichern derselben Meldung - die Anmeldung löscht die Meldung und legt sie
        // neu an. Ohne die Client-ID würde die Materialanfrage jetzt ins Leere zeigen.
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val regs = !CompetitionRegistrationRepo.getByClub(seeded.clubId)
        assertEquals(listOf(teamId), regs.map { it.id })
    }

    @Test
    fun removedTeamDropsItsMaterialRequest() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamId = UUID.randomUUID()
        val dto = upsertDto(
            seeded,
            listOf(teamDto(teamId, seeded.namedParticipantId, listOf(seeded.participant1, seeded.participant2))),
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dto, seeded.user)

        val materialUser = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), materialUser) as ApiResponse.Created).id
        val typeId =
            (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), materialUser) as ApiResponse.Created).id
        !MaterialService.inviteProvider(seeded.eventId, providerId, materialUser)
        val offerId = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), materialUser)
                as ApiResponse.Created
            ).id

        !MaterialRequestRepo.create(
            MaterialRequestRecord(
                id = UUID.randomUUID(),
                competitionRegistration = teamId,
                materialOffer = offerId,
                count = 1,
                status = MaterialRequestStatus.REQUESTED.name,
                requestedAt = seedTime,
                createdAt = seedTime,
                updatedAt = seedTime,
            )
        )

        // Zweites Speichern ohne das Team: die Meldung wird gelöscht und diesmal nicht neu
        // angelegt - der Fall, für den Task 1.1 den aufgeschobenen Trigger gebaut hat.
        val dtoWithoutTeam = upsertDto(seeded, emptyList())
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, dtoWithoutTeam, seeded.user)

        // testComprehension rollt am Ende zurück, der aufgeschobene Trigger feuert also nie von
        // selbst beim Commit - "set constraints all immediate" erzwingt die Prüfung innerhalb der
        // laufenden Transaktion. Ohne Fremdschlüssel auf material_request.competition_registration
        // konkurriert dabei keine automatische Postgres-Prüfung mehr mit dem Aufräum-Trigger.
        !Jooq.query { execute("set constraints all immediate") }
        // Kein Wurf bis hierher: Der Trigger ist gelaufen, ohne dass eine Fremdschlüsselverletzung
        // die Transaktion abgebrochen hat.
        assertTrue(true)

        val remainingRequests = !MaterialRequestRepo.forRegistration(teamId)
        assertTrue(remainingRequests.isEmpty())
    }
}
