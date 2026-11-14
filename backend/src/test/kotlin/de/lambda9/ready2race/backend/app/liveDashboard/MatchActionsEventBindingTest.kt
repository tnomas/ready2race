package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.club.CHAIN_SEED_TIME
import de.lambda9.ready2race.backend.app.club.seedClubChain
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardError
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.tailwind.jooq.Jooq
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Beenden, „Läuft" und An-den-Start-Rufen am Schiedsrichter-Dashboard: der Lauf muss zur
 * Veranstaltung im Pfad gehören, und ein beendeter Lauf lässt sich nicht still wieder öffnen.
 */
class MatchActionsEventBindingTest {

    @Test
    fun matchOfAnotherEventIsUnknownOnAllThreeWays() = testComprehension {
        val seeded = seedClubChain()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val userId = seedAuthor()
        val markerBefore = EventChangeMarker.current(otherEventId)
        val before = matchRow(seeded.matchId)!!

        assertKIOFails(LiveDashboardError.MatchNotFound(seeded.matchId)) {
            LiveDashboardService.finishMatch(otherEventId, seeded.matchId, userId)
        }
        assertKIOFails(LiveDashboardError.MatchNotFound(seeded.matchId)) {
            LiveDashboardService.markMatchStarted(otherEventId, seeded.matchId, userId)
        }
        assertKIOFails(LiveDashboardError.MatchNotFound(seeded.matchId)) {
            LiveDashboardService.setMatchActivated(otherEventId, seeded.matchId, true, userId)
        }

        val match = matchRow(seeded.matchId)!!
        assertNull(match.finishedAt)
        assertEquals(before.startedAt, match.startedAt)
        assertEquals(before.activatedAt, match.activatedAt)
        assertEquals(before.updatedAt, match.updatedAt)
        assertEquals(markerBefore, EventChangeMarker.current(otherEventId))
    }

    @Test
    fun unknownMatchIdIsNotFound() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor()
        val unknown = UUID.randomUUID()

        assertKIOFails(LiveDashboardError.MatchNotFound(unknown)) {
            LiveDashboardService.finishMatch(seeded.eventId, unknown, userId)
        }
        assertKIOFails(LiveDashboardError.MatchNotFound(unknown)) {
            LiveDashboardService.markMatchStarted(seeded.eventId, unknown, userId)
        }
        assertKIOFails(LiveDashboardError.MatchNotFound(unknown)) {
            LiveDashboardService.setMatchActivated(seeded.eventId, unknown, true, userId)
        }
    }

    @Test
    fun finishedMatchCannotBeRestartedOrReactivated() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor()
        !LiveDashboardService.finishMatch(seeded.eventId, seeded.matchId, userId)

        assertKIOFails(LiveDashboardError.MatchAlreadyFinished(seeded.matchId)) {
            LiveDashboardService.markMatchStarted(seeded.eventId, seeded.matchId, userId)
        }
        assertKIOFails(LiveDashboardError.MatchAlreadyFinished(seeded.matchId)) {
            LiveDashboardService.setMatchActivated(seeded.eventId, seeded.matchId, true, userId)
        }
        val match = matchRow(seeded.matchId)
        assertNotNull(match!!.finishedAt)
        assertNull(match.activatedAt)

        // Zurücknehmen bleibt erlaubt - es ändert an einem beendeten Lauf nichts Sichtbares.
        !LiveDashboardService.setMatchActivated(seeded.eventId, seeded.matchId, false, userId)
    }

    private fun TestComprehensionScope<JEnv>.matchRow(matchId: UUID): CompetitionMatchRecord? = !Jooq.query {
        selectFrom(COMPETITION_MATCH).where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId)).fetchOne()
    }

    private fun TestComprehensionScope<JEnv>.seedAuthor(): UUID {
        val id = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = id,
                email = "dash-$id@example.org",
                password = "x",
                firstname = "Rita",
                lastname = "Ricci",
                language = "de",
                createdAt = CHAIN_SEED_TIME,
                updatedAt = CHAIN_SEED_TIME,
            )
        )
        return id
    }
}
