package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.club.CHAIN_SEED_TIME
import de.lambda9.ready2race.backend.app.club.seedClubChain
import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardService
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchDto
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchState
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardScope
import de.lambda9.ready2race.backend.app.liveDashboard.entity.MatchClarificationRequest
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Setzen, Nachschärfen, Aufheben - am echten Postgres, weil genau hier die Regel aus der Spec
 * hängt: `in Klärung ⇔ clarification_since is not null`. Ein Fehler sieht im Review harmlos aus
 * (ein vergessenes `= null` beim Aufheben), steht aber am Regattatag als Lauf da, der für immer
 * "in Klärung" bleibt.
 *
 * `userId` kommt bewusst aus [seedAuthor] statt aus einem bloßen `UUID.randomUUID()` - dieselbe
 * Vorrichtung wie in [LiveDashboardTeamNoteTest]: `competition_match.updated_by` trägt eine
 * Fremdschlüsselbindung auf `app_user`, und ein nicht existierender Nutzer scheitert dort erst
 * beim Schreiben, nicht beim Kompilieren.
 */
class MatchClarificationTest {

    @Test
    fun settingPutsTheMatchIntoClarificationAndKeepsItInTheRefereeScope() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor("Rita", "Ricci")

        !LiveDashboardService.setMatchClarification(
            seeded.eventId,
            seeded.matchId,
            MatchClarificationRequest(reason = "Einspruch RV Hansa, Bahnberührung"),
            userId,
        )

        val match = dashboardMatch(seeded.eventId, seeded.matchId)
        assertEquals(LiveDashboardMatchState.CLARIFICATION, match.state)
        assertEquals("Einspruch RV Hansa, Bahnberührung", match.clarificationReason)
        assertTrue(match.clarificationSince != null)
    }

    @Test
    fun settingTwiceSharpensTheReasonAndKeepsTheFirstTimestamp() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor("Rita", "Ricci")

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch"), userId,
        )
        val zuerst = dashboardMatch(seeded.eventId, seeded.matchId).clarificationSince

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch, Bahnberührung"), userId,
        )
        val danach = dashboardMatch(seeded.eventId, seeded.matchId)

        assertEquals(zuerst, danach.clarificationSince)
        assertEquals("Einspruch, Bahnberührung", danach.clarificationReason)
    }

    @Test
    fun liftingEmptiesBothColumns() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor("Rita", "Ricci")

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch"), userId,
        )
        !LiveDashboardService.clearMatchClarification(seeded.eventId, seeded.matchId, userId)

        val match = dashboardMatch(seeded.eventId, seeded.matchId)
        assertNull(match.clarificationSince)
        assertNull(match.clarificationReason)
    }

    /**
     * Beenden hebt die Klärung implizit auf - der zweite, wichtigere Teil der Regel "Beenden IST
     * die Freigabe". Ohne das Leeren in `finishMatchInternal` bliebe der Merker stehen: der
     * Zustand wäre zwar FINISHED (finishedAt schlägt die Klärung in der Ableitung), aber jede
     * Abfrage, die auf `clarification_since` filtert, verlöre den Lauf dauerhaft aus den
     * öffentlichen Anzeigen. Das seeded Team steht schon auf Platz 1 (placesCalculated), darum
     * braucht `finishMatch` hier kein `openResults`.
     */
    @Test
    fun finishingLiftsTheClarificationToo() = testComprehension {
        val seeded = seedClubChain()
        val userId = seedAuthor("Rita", "Ricci")

        !LiveDashboardService.setMatchClarification(
            seeded.eventId, seeded.matchId, MatchClarificationRequest("Einspruch"), userId,
        )
        !LiveDashboardService.finishMatch(seeded.eventId, seeded.matchId, userId)

        val match = dashboardMatch(seeded.eventId, seeded.matchId)
        assertNull(match.clarificationSince)
        assertNull(match.clarificationReason)
        assertEquals(LiveDashboardMatchState.FINISHED, match.state)
    }

    private fun TestComprehensionScope<JEnv>.dashboardMatch(
        eventId: UUID,
        matchId: UUID,
    ): LiveDashboardMatchDto {
        val dashboard = (!LiveDashboardService.getLiveDashboard(eventId, LiveDashboardScope.ALL, false)).dto
        return dashboard.matches.single { it.matchId == matchId }
    }

    /** Wie in [LiveDashboardTeamNoteTest] - `updated_by` verlangt einen wirklich existierenden Nutzer. */
    private fun TestComprehensionScope<JEnv>.seedAuthor(firstname: String, lastname: String): UUID {
        val id = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = id,
                email = "$firstname.$lastname-$id@example.org".lowercase(),
                password = "x",
                firstname = firstname,
                lastname = lastname,
                language = "de",
                createdAt = CHAIN_SEED_TIME,
                updatedAt = CHAIN_SEED_TIME,
            )
        )
        return id
    }
}
