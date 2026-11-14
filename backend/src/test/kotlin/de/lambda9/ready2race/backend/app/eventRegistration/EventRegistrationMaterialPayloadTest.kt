package de.lambda9.ready2race.backend.app.eventRegistration

import com.fasterxml.jackson.module.kotlin.readValue
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesHasMaterialTypeRepo
import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.material.SeededTeamEvent
import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.control.MaterialRequestRepo
import de.lambda9.ready2race.backend.app.material.createTestUser
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestsUpsertRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.provider
import de.lambda9.ready2race.backend.app.material.seedOpenTeamEvent
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.app.material.seedTime
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesHasMaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testCommittingComprehension
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.tailwind.jooq.transact
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Der Speicherpfad der Anmeldung mit Materialanfragen, gefüttert mit dem **echten
 * Frontend-Payload** statt mit Kotlin-Konstruktoren: so, wie `formDataToRequest` in
 * `EventRegistrationCreatePage.tsx` ihn baut (Teams nur mit `id`, `clubId`, `optionalFees`,
 * `namedParticipants`, `ratingCategory`; nicht gesetzte Felder fehlen im JSON) und wie
 * `syncMaterialRequests` danach je geänderter Meldung `{"offerIds": [...]}` schickt.
 *
 * Beide Flüsse: Anlegen (erste Anmeldung) und Ändern (erneutes Speichern), jeweils mit und ohne
 * Materialanfrage. Die Meldungs-ID kommt aus dem Formular und muss das Neu-Anlegen beim Speichern
 * überleben, sonst hinge die Anfrage an einer verschwundenen Meldung; eine wirklich entfernte
 * Meldung nimmt ihre Anfrage über den aufgeschobenen Trigger `A0_material_request_orphan_cleanup`
 * mit. Den Trigger belegt [triggerKeepsRequestsOnResaveAndDropsThemOnRemovalAfterARealCommit]
 * mit echtem Commit.
 */
class EventRegistrationMaterialPayloadTest {

    private data class Scenario(val seeded: SeededTeamEvent, val providerId: UUID, val offerId: UUID, val userId: UUID)

    private fun TestComprehensionScope<JEnv>.setupProvider(seeded: SeededTeamEvent): Scenario {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeBoat =
            (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !CompetitionPropertiesHasMaterialTypeRepo.create(
            listOf(CompetitionPropertiesHasMaterialTypeRecord(competitionProperties = seeded.propertiesId, materialType = typeBoat, count = 1))
        )
        !MaterialService.inviteProvider(seeded.eventId, providerId, userId)
        val offerId = (
            !MaterialService.addOffer(seeded.eventId, providerId, MaterialOfferRequest(typeBoat, "55 € pro Tag", 3, 30), userId)
                as ApiResponse.Created
            ).id
        return Scenario(seeded, providerId, offerId, userId)
    }

    /** Zwei weitere Personen des Vereins für ein zweites Boot (die Fixture hat nur zwei). */
    private fun TestComprehensionScope<JEnv>.seedTwoMorePersons(seeded: SeededTeamEvent): List<UUID> =
        List(2) {
            val id = UUID.randomUUID()
            !PARTICIPANT.insert(
                ParticipantRecord(
                    id = id, club = seeded.clubId, firstname = "Ruder", lastname = "Person $id", year = 1995,
                    gender = Gender.M, external = false, createdAt = seedTime, updatedAt = seedTime,
                )
            )
            id
        }

    /**
     * Der Körper von `POST /event/{eventId}/register`, Feld für Feld wie das Formular ihn schickt.
     * Teilnehmer kommen aus dem Template (`isNew: false`, `hasChanged: false`), Teams tragen die
     * im Formular erzeugte bzw. aus dem Template übernommene ID; `clubId` und `ratingCategory`
     * fehlen, weil das Formular sie `undefined` lässt.
     */
    private fun frontendPayload(seeded: SeededTeamEvent, persons: List<UUID>, teams: List<Pair<UUID, List<UUID>>>): String {
        fun participant(id: UUID) = """{"id":"$id","isNew":false,"hasChanged":false,"firstname":"Ruder","lastname":"Person $id","year":1995,"gender":"M","email":null,"external":false,"externalClubName":null,"competitionsSingle":[]}"""
        val teamJson = teams.map { (id, crew) ->
            """{"id":"$id","optionalFees":[],"namedParticipants":[{"namedParticipantId":"${seeded.namedParticipantId}","participantIds":[${crew.joinToString(",") { "\"$it\"" }}]}]}"""
        }
        return """{"participants":[${persons.joinToString(",") { participant(it) }}],""" +
            """"competitionRegistrations":[{"competitionId":"${seeded.competitionId}","teams":[${teamJson.joinToString(",")}]}],""" +
            """"callbackUrl":"http://localhost:5123/challenge/"}"""
    }

    /** Wie `receiveKIO` in der Route: lesen, dann validieren. */
    private fun parse(json: String): EventRegistrationUpsertDto {
        val dto = jsonMapper.readValue<EventRegistrationUpsertDto>(json)
        assertTrue(dto.validate() !is ValidationResult.Invalid, "der Frontend-Payload muss die Validierung bestehen")
        return dto
    }

    private fun offerIdsBody(vararg offerIds: UUID): MaterialRequestsUpsertRequest =
        jsonMapper.readValue("""{"offerIds":[${offerIds.joinToString(",") { "\"$it\"" }}]}""")

    @Test
    fun createAndUpdateWithAndWithoutMaterialRequestKeepIdsAndRequests() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val s = setupProvider(seeded)
        val teamA = UUID.randomUUID()
        val teamB = UUID.randomUUID()
        val crewA = listOf(seeded.participant1, seeded.participant2)
        val crewB = seedTwoMorePersons(seeded)
        val persons = crewA + crewB
        fun payload(vararg teams: Pair<UUID, List<UUID>>) = parse(frontendPayload(seeded, persons, teams.toList()))

        // Anlegen ohne Materialanfrage: die Formular-ID wird die Meldungs-ID.
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, payload(teamA to crewA), seeded.user)
        assertEquals(listOf(teamA), (!CompetitionRegistrationRepo.getByClub(seeded.clubId)).map { it.id })

        // Danach (wie syncMaterialRequests) die Anfrage, und der Anbieter bestätigt.
        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamA, Privilege.Scope.OWN to seeded.clubId, offerIdsBody(s.offerId).offerIds, seeded.user.id!!,
        )
        val requestA = (!MaterialRequestRepo.forRegistration(teamA)).single()
        !MaterialService.decideRequest(
            seeded.eventId, s.providerId, requestA.id, MaterialDecisionRequest(MaterialRequestStatus.CONFIRMED, null), s.userId,
        )

        // Ändern ohne Änderung: dieselbe ID, dieselbe (bestätigte) Anfrage.
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, payload(teamA to crewA), seeded.user)
        !Jooq.query { execute("set constraints all immediate") }
        assertEquals(listOf(teamA), (!CompetitionRegistrationRepo.getByClub(seeded.clubId)).map { it.id })
        val keptA = (!MaterialRequestRepo.forRegistration(teamA)).single()
        assertEquals(requestA.id, keptA.id)
        assertEquals(MaterialRequestStatus.CONFIRMED.name, keptA.status)

        // Ändern mit neuem Team und Anfrage dafür.
        !Jooq.query { execute("set constraints all deferred") }
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, payload(teamA to crewA, teamB to crewB), seeded.user)
        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamB, Privilege.Scope.OWN to seeded.clubId, offerIdsBody(s.offerId).offerIds, seeded.user.id!!,
        )
        assertEquals(setOf(teamA, teamB), (!CompetitionRegistrationRepo.getByClub(seeded.clubId)).map { it.id }.toSet())

        // Team A wirklich entfernt: seine Anfrage verschwindet, die von Team B bleibt. Die
        // Prüfung erzwingt den aufgeschobenen Trigger innerhalb der Testtransaktion.
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, payload(teamB to crewB), seeded.user)
        !Jooq.query { execute("set constraints all immediate") }
        assertTrue((!MaterialRequestRepo.forRegistration(teamA)).isEmpty(), "Anfrage der entfernten Meldung ist weg")
        assertEquals(1, (!MaterialRequestRepo.forRegistration(teamB)).size, "Anfrage der verbliebenen Meldung bleibt")
    }

    @Test
    fun aRequestForAForeignClubsRegistrationIsRefused() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val s = setupProvider(seeded)
        val teamA = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, parse(frontendPayload(seeded, listOf(seeded.participant1, seeded.participant2), listOf(teamA to listOf(seeded.participant1, seeded.participant2)))), seeded.user)

        assertKIOFails(de.lambda9.ready2race.backend.app.material.entity.MaterialError.RegistrationNotFound) {
            MaterialService.setRequestsForRegistration(
                seeded.eventId, teamA, Privilege.Scope.OWN to UUID.randomUUID(), listOf(s.offerId), seeded.user.id!!,
            )
        }
    }

    /**
     * Der aufgeschobene Trigger mit echtem Commit: Das Speichern läuft wie in der Route in EINER
     * Transaktion. Beim erneuten Speichern ist die Meldung am Commit wieder da - die Anfrage
     * bleibt; beim Entfernen fehlt sie am Commit - die Anfrage geht mit.
     */
    @Test
    fun triggerKeepsRequestsOnResaveAndDropsThemOnRemovalAfterARealCommit() = testCommittingComprehension {
        val seeded = seedOpenTeamEvent()
        val s = setupProvider(seeded)
        val teamA = UUID.randomUUID()

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, parse(frontendPayload(seeded, listOf(seeded.participant1, seeded.participant2), listOf(teamA to listOf(seeded.participant1, seeded.participant2)))), seeded.user)
            .transact()
        !MaterialService.setRequestsForRegistration(
            seeded.eventId, teamA, Privilege.Scope.OWN to seeded.clubId, listOf(s.offerId), seeded.user.id!!,
        ).transact()

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, parse(frontendPayload(seeded, listOf(seeded.participant1, seeded.participant2), listOf(teamA to listOf(seeded.participant1, seeded.participant2)))), seeded.user)
            .transact()
        assertEquals(1, (!MaterialRequestRepo.forRegistration(teamA)).size, "erneutes Speichern behält die Anfrage")

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, parse(frontendPayload(seeded, listOf(seeded.participant1, seeded.participant2), emptyList())), seeded.user)
            .transact()
        assertTrue((!MaterialRequestRepo.forRegistration(teamA)).isEmpty(), "Entfernen räumt die Anfrage am Commit weg")
    }
}
