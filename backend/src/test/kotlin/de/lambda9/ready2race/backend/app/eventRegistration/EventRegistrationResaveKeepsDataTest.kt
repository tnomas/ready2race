package de.lambda9.ready2race.backend.app.eventRegistration

import com.fasterxml.jackson.module.kotlin.readValue
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionRegistration.control.CompetitionRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationUpsertDto
import de.lambda9.ready2race.backend.app.material.SeededTeamEvent
import de.lambda9.ready2race.backend.app.material.createTestUser
import de.lambda9.ready2race.backend.app.material.seedMatch
import de.lambda9.ready2race.backend.app.material.seedOpenTeamEvent
import de.lambda9.ready2race.backend.app.material.seedTime
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Erneutes Speichern des Meldeformulars (H3-F1). Der Speicherpfad löscht die nicht gesperrten
 * Meldungen des Vereins und legt die vom Formular genannten mit derselben ID neu an. Eine so
 * „bestehen bleibende" Meldung darf dabei nichts verlieren, was das Formular nicht selbst trägt:
 * die Meldungsnummer (ab der Fixierung fest, ADR-0111), den Namen und wer sie wann angelegt hat.
 *
 * Gefüttert mit dem echten Frontend-Payload (Form wie `formDataToRequest`) bzw. mit dem
 * unverändert zurückgeschickten Template, wie es `GET …/registrationTemplate` ausliefert.
 */
class EventRegistrationResaveKeepsDataTest {

    private fun TestComprehensionScope<JEnv>.seedPersons(seeded: SeededTeamEvent, n: Int): List<UUID> =
        List(n) {
            val id = UUID.randomUUID()
            !PARTICIPANT.insert(
                ParticipantRecord(
                    id = id, club = seeded.clubId, firstname = "Ruder", lastname = "Person $id", year = 1995,
                    gender = Gender.M, external = false, createdAt = seedTime, updatedAt = seedTime,
                )
            )
            id
        }

    /** Der Körper von `POST /event/{eventId}/register`, Feld für Feld wie das Formular ihn schickt. */
    private fun frontendPayload(seeded: SeededTeamEvent, teams: List<Pair<UUID, List<UUID>>>): EventRegistrationUpsertDto {
        val persons = teams.flatMap { it.second }
        fun participant(id: UUID) = """{"id":"$id","isNew":false,"hasChanged":false,"firstname":"Ruder","lastname":"Person $id","year":1995,"gender":"M","email":null,"external":false,"externalClubName":null,"competitionsSingle":[]}"""
        val teamJson = teams.map { (id, crew) ->
            """{"id":"$id","optionalFees":[],"namedParticipants":[{"namedParticipantId":"${seeded.namedParticipantId}","participantIds":[${crew.joinToString(",") { "\"$it\"" }}]}]}"""
        }
        val json = """{"participants":[${persons.joinToString(",") { participant(it) }}],""" +
            """"competitionRegistrations":[{"competitionId":"${seeded.competitionId}","teams":[${teamJson.joinToString(",")}]}],""" +
            """"callbackUrl":"http://localhost:5123/challenge/"}"""
        return parse(json)
    }

    private fun parse(json: String): EventRegistrationUpsertDto {
        val dto = jsonMapper.readValue<EventRegistrationUpsertDto>(json)
        assertTrue(dto.validate() !is ValidationResult.Invalid, "der Payload muss die Validierung bestehen")
        return dto
    }

    /** Das Template, wie der Verein es abruft - als JSON und unverändert zurück. */
    private fun TestComprehensionScope<JEnv>.templateAsPayload(seeded: SeededTeamEvent): EventRegistrationUpsertDto {
        val template = (!EventRegistrationService.getEventRegistrationTemplate(seeded.eventId, seeded.clubId)
            as ApiResponse.Dto<*>).dto
        val upsertable = (template as de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationTemplateDto)
            .upsertableRegistration
        return parse(jsonMapper.writeValueAsString(upsertable.copy(callbackUrl = "http://localhost:5123/challenge/")))
    }

    private fun TestComprehensionScope<JEnv>.registrations(seeded: SeededTeamEvent): Map<UUID, CompetitionRegistrationRecord> =
        (!CompetitionRegistrationRepo.getByClub(seeded.clubId)).associateBy { it.id }

    /** Alles außer der Änderungsspur (`updated_at`/`updated_by` geben das Speichern wieder). */
    private fun CompetitionRegistrationRecord.stored() = listOf(
        id, eventRegistration, competition, club, name, createdAt, createdBy, teamNumber, isLate, ratingCategory,
    )

    @Test
    fun resaveAfterFinalizeKeepsNumbersNewTeamWaitsRemovedTeamFreesItsNumber() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val adminId = !createTestUser()
        val crews = listOf(listOf(seeded.participant1, seeded.participant2)) + seedPersons(seeded, 4).chunked(2)
        val (teamA, teamB, teamC) = List(3) { UUID.randomUUID() }

        // Anlegen (erster Fluss), dann fixieren.
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(teamA to crews[0], teamB to crews[1])), seeded.user,
        )
        !EventRegistrationService.finalizeRegistrations(adminId, seeded.eventId, keepNumbers = false, alignMaterialNumbers = false)
        val fixed = registrations(seeded)
        assertEquals(setOf(1, 2), fixed.values.map { it.teamNumber }.toSet())

        // Ändern (zweiter Fluss) ohne Änderung: Meldung feldgleich, insbesondere die Nummer.
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(teamA to crews[0], teamB to crews[1])), seeded.user,
        )
        val resaved = registrations(seeded)
        assertEquals(fixed.mapValues { it.value.stored() }, resaved.mapValues { it.value.stored() })

        // Neues Team: bekommt erst beim nächsten Fixieren eine Nummer; die anderen behalten ihre.
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId,
            frontendPayload(seeded, listOf(teamA to crews[0], teamB to crews[1], teamC to crews[2])),
            seeded.user,
        )
        val withC = registrations(seeded)
        assertEquals(fixed.getValue(teamA).teamNumber, withC.getValue(teamA).teamNumber)
        assertEquals(fixed.getValue(teamB).teamNumber, withC.getValue(teamB).teamNumber)
        assertNull(withC.getValue(teamC).teamNumber, "ein neues Team hat bis zur Fixierung keine Nummer")
        !EventRegistrationService.finalizeRegistrations(adminId, seeded.eventId, keepNumbers = true, alignMaterialNumbers = false)
        val refixed = registrations(seeded)
        assertEquals(fixed.getValue(teamA).teamNumber, refixed.getValue(teamA).teamNumber)
        assertEquals(fixed.getValue(teamB).teamNumber, refixed.getValue(teamB).teamNumber)
        assertEquals(3, refixed.getValue(teamC).teamNumber)

        // Team B entfernt: seine Meldung (und damit seine Nummer) ist weg, die übrigen bleiben.
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(teamA to crews[0], teamC to crews[2])), seeded.user,
        )
        !Jooq.query { execute("set constraints all immediate") }
        val withoutB = registrations(seeded)
        assertEquals(setOf(teamA, teamC), withoutB.keys)
        assertEquals(refixed.getValue(teamA).teamNumber, withoutB.getValue(teamA).teamNumber)
        assertEquals(3, withoutB.getValue(teamC).teamNumber)
        assertTrue(withoutB.values.none { it.teamNumber == fixed.getValue(teamB).teamNumber }, "Nummer von B ist frei")
    }

    @Test
    fun templateSentBackUnchangedLeavesEveryRegistrationAsItWas() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val adminId = !createTestUser()
        val crews = listOf(listOf(seeded.participant1, seeded.participant2)) + seedPersons(seeded, 2).chunked(2)
        val (teamA, teamB) = List(2) { UUID.randomUUID() }
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(teamA to crews[0], teamB to crews[1])), seeded.user,
        )
        !EventRegistrationService.finalizeRegistrations(adminId, seeded.eventId, keepNumbers = false, alignMaterialNumbers = false)
        val before = registrations(seeded)

        // Ein anderes Konto des Vereins speichert: Ersteller bleibt, die Reihenfolge im Template
        // ist nicht zugesagt - die Namen hängen an der Meldung, nicht an der Position.
        val otherUser = AppUserWithPrivilegesRecord(
            id = !createTestUser(), club = seeded.clubId, language = "DE", firstname = "Zweite", lastname = "Melderin",
            email = "zweite-${UUID.randomUUID()}@example.org",
        )
        val template = templateAsPayload(seeded)
        val reversed = template.copy(
            competitionRegistrations = template.competitionRegistrations.map { it.copy(teams = it.teams?.reversed()) }
        )
        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, reversed, otherUser)
        assertEquals(before.mapValues { it.value.stored() }, registrations(seeded).mapValues { it.value.stored() })

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, templateAsPayload(seeded), seeded.user)
        assertEquals(before.mapValues { it.value.stored() }, registrations(seeded).mapValues { it.value.stored() })
    }

    @Test
    fun aSingleTeamKeepsItsNameOnResave() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val teamA = UUID.randomUUID()
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(teamA to listOf(seeded.participant1, seeded.participant2))), seeded.user,
        )
        // Ein Name, den das Formular nicht vergibt (Seed, ältere Daten): bleibt beim Speichern stehen.
        !Jooq.query { update(COMPETITION_REGISTRATION).set(COMPETITION_REGISTRATION.NAME, "MT 1").where(COMPETITION_REGISTRATION.ID.eq(teamA)).execute() }

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, templateAsPayload(seeded), seeded.user)
        assertEquals("MT 1", registrations(seeded).getValue(teamA).name)
    }

    @Test
    fun aLockedTeamIsNotRenamedWhenItsCompetitionDidNotChange() = testComprehension {
        val seeded = seedOpenTeamEvent()
        val crews = listOf(listOf(seeded.participant1, seeded.participant2)) + seedPersons(seeded, 2).chunked(2)
        val (locked, open) = List(2) { UUID.randomUUID() }
        !EventRegistrationService.upsertRegistrationForEvent(
            seeded.eventId, frontendPayload(seeded, listOf(open to crews[0], locked to crews[1])), seeded.user,
        )
        // „locked" fährt schon (Lauf), heißt #2; die offene Meldung #1.
        seedMatch(seeded.propertiesId, locked)
        assertEquals("#2", registrations(seeded).getValue(locked).name)

        !EventRegistrationService.upsertRegistrationForEvent(seeded.eventId, templateAsPayload(seeded), seeded.user)
        val after = registrations(seeded)
        assertEquals("#2", after.getValue(locked).name, "die gesperrte Meldung behält ihren Namen")
        assertEquals("#1", after.getValue(open).name)
    }
}
