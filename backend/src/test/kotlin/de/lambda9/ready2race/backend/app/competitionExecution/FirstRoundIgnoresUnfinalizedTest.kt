package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedCompetitionRegistration
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.app.competitionRegistration.seedNamedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedParticipant
import de.lambda9.ready2race.backend.app.competitionRegistration.seedSingleCompetition
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Die erste Runde setzt nur finalisierte Meldungen (mit Startnummer); der Dialog warnt, dass die
 * übrigen ignoriert werden. Setzliste und Freilos-Erkennung zählten sie aber mit: ein Lauf mit
 * nur einem Boot bekam keinen automatischen ersten Platz, galt aber als Freilos - die
 * Ergebniseingabe war gesperrt und die Folgerunde nie erzeugbar.
 */
class FirstRoundIgnoresUnfinalizedTest {

    @Test
    fun aLoneBoatInANonRequiredFirstRoundGetsItsPlace() = testComprehension {
        val now = LocalDateTime.now()
        val eventId = seedEvent()
        val np = seedNamedParticipant()
        val competitionId = seedSingleCompetition(eventId, np)
        val propertiesId = !Jooq.query {
            select(COMPETITION_PROPERTIES.ID).from(COMPETITION_PROPERTIES)
                .where(COMPETITION_PROPERTIES.COMPETITION.eq(competitionId)).fetchSingle().value1()!!
        }
        !COMPETITION_SETUP.insert(CompetitionSetupRecord(competitionProperties = propertiesId, createdAt = now, updatedAt = now))
        val roundId = UUID.randomUUID()
        !COMPETITION_SETUP_ROUND.insert(
            CompetitionSetupRoundRecord(
                id = roundId,
                competitionSetup = propertiesId,
                name = "Vorlauf",
                required = false,
                useDefaultSeeding = true,
                placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                nextRound = null,
            )
        )
        listOf(1, 2).forEach { w ->
            !COMPETITION_SETUP_MATCH.insert(
                CompetitionSetupMatchRecord(
                    id = UUID.randomUUID(),
                    competitionSetupRound = roundId,
                    weighting = w,
                    name = "Lauf $w",
                    executionOrder = w,
                    teams = 2,
                )
            )
        }

        val club = seedClubWithUser(eventId, "A")
        val registrations = (1..4).map { i ->
            seedCompetitionRegistration(competitionId, club, np, seedParticipant(club.clubId, "P$i"))
        }
        // Drei finalisiert, die vierte ohne Startnummer.
        registrations.take(3).forEachIndexed { i, id ->
            !Jooq.query {
                update(COMPETITION_REGISTRATION).set(COMPETITION_REGISTRATION.TEAM_NUMBER, i + 1)
                    .set(COMPETITION_REGISTRATION.NAME, "#${i + 1}")
                    .where(COMPETITION_REGISTRATION.ID.eq(id)).execute()
            }
        }

        !CompetitionExecutionService.createNewRound(eventId, competitionId, SYSTEM_USER)

        val teams = !Jooq.query {
            selectFrom(COMPETITION_MATCH_TEAM)
                .where(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION.`in`(registrations))
                .fetch()
        }
        assertEquals(3, teams.size, "nur finalisierte Meldungen werden gesetzt")
        val byMatch = teams.groupBy { it.competitionMatch }
        val alone = byMatch.values.filter { it.size == 1 }
        assertTrue(alone.isNotEmpty(), "drei Boote auf zwei Läufe: einer fährt allein")
        alone.forEach { assertEquals(1, it.single().place, "Freilos ohne Pflichtrunde: automatischer erster Platz") }
    }
}
