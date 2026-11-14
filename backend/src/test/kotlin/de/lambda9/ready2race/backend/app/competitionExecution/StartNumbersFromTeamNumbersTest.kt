package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRegistrationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.EFFECTIVE_MATERIAL_FOR_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_REGISTRATION
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Startnummer aus Meldungsnummer (ADR-0111, Entscheidung vom 14.11.2026): Ist die Veranstaltung mit
 * "Meldungsnummern nach Bootsnummern vergeben" fixiert (`event.team_numbers_as_start_numbers`),
 * startet jedes Boot in jedem Lauf - Vorlauf wie Finale - unter seiner Meldungsnummer, und die Sicht
 * `effective_material_for_match_team` meldet nur dort eine Abweichung, wo wirklich ein anderes Boot
 * fährt. Ohne den Schalter bleibt es bei Setzposition bzw. Rang.
 *
 * Aufbau: Vorlauf (zwei Läufe à zwei Boote) und Finale (vier Plätze), vier Meldungen mit den
 * nicht lückenlosen Meldungsnummern 7, 2, 6, 1. Leihboote: #7 fährt Boot 7, #2 "Vierer 2", #6 Boot 6
 * mit Ersatz Boot 8 als Ausnahme in seinem Vorlauf; #1 hat ein eigenes Boot.
 */
class StartNumbersFromTeamNumbersTest {

    private val now: LocalDateTime = LocalDateTime.of(2026, 11, 14, 10, 0)

    private data class Seeded(
        val eventId: UUID,
        val competitionId: UUID,
        val heatSetupMatchIds: List<UUID>,
        val finalSetupMatchId: UUID,
        val registrationByTeamNumber: Map<Int, UUID>,
        val requestByTeamNumber: Map<Int, UUID>,
        val itemByNumber: Map<Int, UUID>,
    )

    private fun TestComprehensionScope<JEnv>.seed(teamNumbersAsStartNumbers: Boolean): Seeded {
        val eventId = UUID.randomUUID()
        val competitionId = UUID.randomUUID()
        val propertiesId = UUID.randomUUID()
        val heatRoundId = UUID.randomUUID()
        val finalRoundId = UUID.randomUUID()
        val heatIds = listOf(UUID.randomUUID(), UUID.randomUUID())
        val finalId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val eventRegistrationId = UUID.randomUUID()

        !EVENT.insert(
            EventRecord(
                id = eventId,
                name = "Startnummer-Test",
                createdAt = now,
                updatedAt = now,
                teamNumbersAsStartNumbers = teamNumbersAsStartNumbers,
            )
        )
        !COMPETITION.insert(CompetitionRecord(id = competitionId, event = eventId, createdAt = now, updatedAt = now))
        !COMPETITION_PROPERTIES.insert(
            CompetitionPropertiesRecord(id = propertiesId, competition = competitionId, identifier = "M1", name = "Vierer")
        )
        !COMPETITION_SETUP.insert(CompetitionSetupRecord(competitionProperties = propertiesId, createdAt = now, updatedAt = now))
        !COMPETITION_SETUP_ROUND.insert(
            CompetitionSetupRoundRecord(
                id = finalRoundId, competitionSetup = propertiesId, name = "Finale", required = true,
                useDefaultSeeding = true, placesOption = CompetitionSetupPlacesOption.EQUAL.name, nextRound = null,
            )
        )
        !COMPETITION_SETUP_ROUND.insert(
            CompetitionSetupRoundRecord(
                id = heatRoundId, competitionSetup = propertiesId, name = "Vorlauf", required = true,
                useDefaultSeeding = true, placesOption = CompetitionSetupPlacesOption.EQUAL.name, nextRound = finalRoundId,
            )
        )
        heatIds.forEachIndexed { index, id ->
            !COMPETITION_SETUP_MATCH.insert(
                CompetitionSetupMatchRecord(
                    id = id, competitionSetupRound = heatRoundId, weighting = index + 1,
                    name = "Vorlauf ${index + 1}", executionOrder = index + 1, teams = 2,
                )
            )
        }
        !COMPETITION_SETUP_MATCH.insert(
            CompetitionSetupMatchRecord(
                id = finalId, competitionSetupRound = finalRoundId, weighting = 1,
                name = "Finale", executionOrder = 1, teams = 4,
            )
        )
        (1..4).forEach { seed ->
            !COMPETITION_SETUP_PARTICIPANT.insert(
                CompetitionSetupParticipantRecord(
                    id = UUID.randomUUID(), competitionSetupMatch = finalId, seed = seed, ranking = seed,
                )
            )
        }

        !CLUB.insert(ClubRecord(id = clubId, name = "Verein $clubId", createdAt = now, updatedAt = now))
        !EVENT_REGISTRATION.insert(
            EventRegistrationRecord(id = eventRegistrationId, event = eventId, club = clubId, createdAt = now, updatedAt = now)
        )
        val registrationByTeamNumber = listOf(7, 2, 6, 1).associateWith { teamNumber ->
            val id = UUID.randomUUID()
            !COMPETITION_REGISTRATION.insert(
                CompetitionRegistrationRecord(
                    id = id, eventRegistration = eventRegistrationId, competition = competitionId, club = clubId,
                    name = "Team $teamNumber", teamNumber = teamNumber, createdAt = now, updatedAt = now,
                )
            )
            id
        }

        // Material: ein Anbieter, eine Bootsart, Boote 2, 6, 7, 8; drei bestätigte Anfragen mit
        // Grundzuteilung (#7 -> Boot 7, #2 -> Boot 2, #6 -> Boot 6).
        val providerId = UUID.randomUUID()
        val typeId = UUID.randomUUID()
        val offerId = UUID.randomUUID()
        sql("insert into material_provider (id, name, created_at, updated_at) values (?, 'Bootshaus', now(), now())", providerId)
        sql("insert into material_type (id, name, category, created_at, updated_at) values (?, 'C4x+', 'BOAT', now(), now())", typeId)
        sql(
            "insert into event_has_material_provider (event, material_provider, created_at, updated_at) values (?, ?, now(), now())",
            eventId, providerId,
        )
        sql(
            "insert into material_offer (id, event, material_provider, material_type, planned_count, created_at, updated_at) " +
                "values (?, ?, ?, ?, 4, now(), now())",
            offerId, eventId, providerId, typeId,
        )
        val itemByNumber = listOf(2, 6, 7, 8).associateWith { number ->
            val id = UUID.randomUUID()
            sql(
                "insert into material_item (id, material_provider, material_type, number, label, created_at, updated_at) " +
                    "values (?, ?, ?, ?, ?, now(), now())",
                id, providerId, typeId, number, "Boot $number",
            )
            id
        }
        val requestByTeamNumber = listOf(7, 2, 6).associateWith { teamNumber ->
            val id = UUID.randomUUID()
            sql(
                "insert into material_request (id, competition_registration, material_offer, count, status, requested_at, created_at, updated_at) " +
                    "values (?, ?, ?, 1, 'CONFIRMED', now(), now(), now())",
                id, registrationByTeamNumber.getValue(teamNumber), offerId,
            )
            assign(id, itemByNumber.getValue(teamNumber), null)
            id
        }

        return Seeded(eventId, competitionId, heatIds, finalId, registrationByTeamNumber, requestByTeamNumber, itemByNumber)
    }

    private fun TestComprehensionScope<JEnv>.sql(statement: String, vararg bindings: Any) {
        !Jooq.query { execute(statement, *bindings) }
    }

    private fun TestComprehensionScope<JEnv>.assign(requestId: UUID, itemId: UUID, setupMatchId: UUID?) {
        if (setupMatchId == null) {
            sql(
                "insert into material_assignment (id, material_request, material_item, created_at, updated_at) values (?, ?, ?, now(), now())",
                UUID.randomUUID(), requestId, itemId,
            )
        } else {
            sql(
                "insert into material_assignment (id, material_request, material_item, competition_match, created_at, updated_at) " +
                    "values (?, ?, ?, ?, now(), now())",
                UUID.randomUUID(), requestId, itemId, setupMatchId,
            )
        }
    }

    private data class Row(
        val setupMatchId: UUID,
        val registrationId: UUID,
        val startNumber: Int,
        val boatNumber: Int?,
        val deviates: Boolean?,
    )

    private fun TestComprehensionScope<JEnv>.rows(setupMatchIds: List<UUID>): List<Row> = !Jooq.query {
        select(
            COMPETITION_MATCH_TEAM.COMPETITION_MATCH,
            COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION,
            COMPETITION_MATCH_TEAM.START_NUMBER,
            EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.NUMBER,
            EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.DEVIATES_FROM_START_NUMBER,
        )
            .from(COMPETITION_MATCH_TEAM)
            .leftJoin(EFFECTIVE_MATERIAL_FOR_MATCH_TEAM)
            .on(EFFECTIVE_MATERIAL_FOR_MATCH_TEAM.COMPETITION_MATCH_TEAM.eq(COMPETITION_MATCH_TEAM.ID))
            .where(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.`in`(setupMatchIds))
            .fetch { Row(it.value1()!!, it.value2()!!, it.value3()!!, it.value4(), it.value5()) }
    }

    /** Plätze 1..n je Lauf nach Startnummer und Runde beenden - Voraussetzung der Folgerunde. */
    private fun TestComprehensionScope<JEnv>.placeHeats(seeded: Seeded) {
        seeded.heatSetupMatchIds.forEach { matchId ->
            val teams = rows(listOf(matchId)).sortedBy { it.startNumber }
            teams.forEachIndexed { index, row ->
                !Jooq.query {
                    update(COMPETITION_MATCH_TEAM).set(COMPETITION_MATCH_TEAM.PLACE, index + 1)
                        .where(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(matchId))
                        .and(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION.eq(row.registrationId))
                        .execute()
                }
            }
        }
    }

    @Test
    fun withTheSwitchEveryBoatStartsUnderItsTeamNumberInHeatsAndFinal() = testComprehension {
        val seeded = seed(teamNumbersAsStartNumbers = true)
        val teamNumberOf = seeded.registrationByTeamNumber.entries.associate { (number, id) -> id to number }

        !CompetitionExecutionService.createNewRound(seeded.eventId, seeded.competitionId, SYSTEM_USER)

        // Ausnahme je Lauf: #6 fährt in seinem Vorlauf Boot 8 (Ersatz nach Ausfall).
        val heatOfSix = rows(seeded.heatSetupMatchIds)
            .single { it.registrationId == seeded.registrationByTeamNumber.getValue(6) }.setupMatchId
        assign(seeded.requestByTeamNumber.getValue(6), seeded.itemByNumber.getValue(8), heatOfSix)

        val heats = rows(seeded.heatSetupMatchIds)
        assertEquals(4, heats.size)
        heats.forEach { row ->
            assertEquals(teamNumberOf.getValue(row.registrationId), row.startNumber, "Vorlauf: Startnummer = Meldungsnummer")
        }
        heats.forEach { row ->
            val teamNumber = teamNumberOf.getValue(row.registrationId)
            when (teamNumber) {
                6 -> {
                    assertEquals(8, row.boatNumber, "Ausnahme je Lauf schlägt die Grundzuteilung")
                    assertEquals(true, row.deviates, "nur die echte Ausnahme ist abweichend")
                }
                1 -> assertEquals(null, row.boatNumber, "eigenes Boot: kein Material")
                else -> {
                    assertEquals(teamNumber, row.boatNumber)
                    assertEquals(false, row.deviates, "Boot $teamNumber fährt als #$teamNumber")
                }
            }
        }

        placeHeats(seeded)
        !CompetitionExecutionService.createNewRound(seeded.eventId, seeded.competitionId, SYSTEM_USER)

        val final = rows(listOf(seeded.finalSetupMatchId))
        assertEquals(4, final.size)
        final.forEach { row ->
            val teamNumber = teamNumberOf.getValue(row.registrationId)
            assertEquals(teamNumber, row.startNumber, "Finale: Startnummer = Meldungsnummer, nicht der Rang")
            if (teamNumber != 1) {
                assertEquals(teamNumber, row.boatNumber, "im Finale wieder die Grundzuteilung")
                assertEquals(false, row.deviates, "keine Abweichung im Finale")
            }
        }
    }

    @Test
    fun withoutTheSwitchStartNumbersStayPositional() = testComprehension {
        val seeded = seed(teamNumbersAsStartNumbers = false)

        !CompetitionExecutionService.createNewRound(seeded.eventId, seeded.competitionId, SYSTEM_USER)

        val heats = rows(seeded.heatSetupMatchIds)
        heats.groupBy { it.setupMatchId }.values.forEach { match ->
            assertEquals(setOf(1, 2), match.map { it.startNumber }.toSet(), "Vorlauf: Setzposition ab 1")
        }
        assertTrue(heats.any { it.deviates == true }, "Bootsnummer und Setzposition fallen auseinander")

        placeHeats(seeded)
        !CompetitionExecutionService.createNewRound(seeded.eventId, seeded.competitionId, SYSTEM_USER)

        val final = rows(listOf(seeded.finalSetupMatchId))
        assertEquals(setOf(1, 2, 3, 4), final.map { it.startNumber }.toSet(), "Finale: Rang des Setup-Platzes")
    }
}
