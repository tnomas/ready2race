package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.club.CHAIN_SEED_TIME
import de.lambda9.ready2race.backend.app.club.seedClubChain
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionExecutionError
import de.lambda9.ready2race.backend.app.competitionExecution.entity.UpdateCompetitionMatchActivationRequest
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * An den Start rufen und „Läuft" über die Durchführungsseite bzw. den Zeitplan-Reiter: dieselben
 * Vorbedingungen wie am Schiedsrichter-Dashboard (Lauf gehört zur Veranstaltung des Pfads, ein
 * beendeter Lauf wird nicht still wieder geöffnet).
 */
class ExecutionActivationGuardTest {

    private val activate = UpdateCompetitionMatchActivationRequest(activated = true)
    private val deactivate = UpdateCompetitionMatchActivationRequest(activated = false)

    @Test
    fun matchOfAnotherEventIsUnknown() = testComprehension {
        val seeded = seedClubChain()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val userId = seedAuthor()
        val markerBefore = EventChangeMarker.current(otherEventId)
        val before = matchRow(seeded.matchId)!!

        assertKIOFails(CompetitionExecutionError.MatchNotFound) {
            CompetitionExecutionService.updateMatchActivation(seeded.matchId, userId, activate, otherEventId)
        }
        assertKIOFails(CompetitionExecutionError.MatchNotFound) {
            CompetitionExecutionService.markMatchStarted(otherEventId, seeded.matchId, userId)
        }

        val match = matchRow(seeded.matchId)!!
        assertEquals(before.activatedAt, match.activatedAt)
        assertEquals(before.startedAt, match.startedAt)
        assertEquals(before.updatedAt, match.updatedAt)
        assertEquals(markerBefore, EventChangeMarker.current(otherEventId))
    }

    @Test
    fun unknownMatchIsNotFound() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor()
        val unknown = UUID.randomUUID()

        assertKIOFails(CompetitionExecutionError.MatchNotFound) {
            CompetitionExecutionService.updateMatchActivation(unknown, userId, activate, seeded.eventId)
        }
        assertKIOFails(CompetitionExecutionError.MatchNotFound) {
            CompetitionExecutionService.markMatchStarted(seeded.eventId, unknown, userId)
        }
    }

    @Test
    fun finishedMatchCannotBeActivatedOrMarkedRunning() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor()
        !LiveDashboardService.finishMatch(seeded.eventId, seeded.matchId, userId)

        assertKIOFails(CompetitionExecutionError.MatchAlreadyFinished) {
            CompetitionExecutionService.updateMatchActivation(seeded.matchId, userId, activate, seeded.eventId)
        }
        assertKIOFails(CompetitionExecutionError.MatchAlreadyFinished) {
            CompetitionExecutionService.markMatchStarted(seeded.eventId, seeded.matchId, userId)
        }
        val match = matchRow(seeded.matchId)!!
        assertNotNull(match.finishedAt)
        assertNull(match.activatedAt)

        // Zurücknehmen bleibt erlaubt - es ändert an einem beendeten Lauf nichts Sichtbares.
        !CompetitionExecutionService.updateMatchActivation(seeded.matchId, userId, deactivate, seeded.eventId)
    }

    @Test
    fun openMatchOfTheEventIsActivatedAndMarkedRunning() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor()

        !CompetitionExecutionService.updateMatchActivation(seeded.matchId, userId, activate, seeded.eventId)
        assertNotNull(matchRow(seeded.matchId)!!.activatedAt)

        !CompetitionExecutionService.markMatchStarted(seeded.eventId, seeded.matchId, userId)
        assertNotNull(matchRow(seeded.matchId)!!.startedAt)
    }

    private fun TestComprehensionScope<JEnv>.matchRow(matchId: UUID): CompetitionMatchRecord? = !Jooq.query {
        selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
    }

    private fun TestComprehensionScope<JEnv>.seedAuthor(): UUID {
        val id = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = id,
                email = "exec-$id@example.org",
                password = "x",
                firstname = "Bea",
                lastname = "Büro",
                language = "de",
                createdAt = CHAIN_SEED_TIME,
                updatedAt = CHAIN_SEED_TIME,
            )
        )
        return id
    }
}
