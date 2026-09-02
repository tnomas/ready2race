package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventInfoService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Ein Lauf in Klärung fliegt aus dem öffentlichen Running-Block (er darf Stream-Uhr und
 * Anzeigen-Cursor nicht festhalten), aber das Sprecher-Board bestellt ihn ausdrücklich mit
 * (`includeClarification`) und bekommt ihn markiert — nur das Flag, nie die Begründung.
 */
class RunningMatchesClarificationTest {

    @Test
    fun clarificationMatchesComeOnlyOnRequestAndFlagged() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val now = LocalDateTime.now()

        val disputed = !createTestMatchFixture(eventId, 1)
        !CompetitionMatchRepo.update(disputed.setupMatchId) {
            activatedAt = now
            // Beides oder nichts — der Check-Constraint competition_match_clarification_complete
            // verlangt zur Klärung immer auch eine Begründung. Sie bleibt intern: die Antwort
            // unten trägt nur das Flag.
            clarificationSince = now
            clarificationReason = "Bojenberührung wird geprüft"
        }.orDie()

        val plain = !createTestMatchFixture(eventId, 1)
        !CompetitionMatchRepo.update(plain.setupMatchId) {
            activatedAt = now
        }.orDie()

        // Der öffentliche Standardweg: der strittige Lauf bleibt draußen.
        val publicView = !EventInfoService.getRunningMatches(eventId, 10)
        assertEquals(listOf(plain.setupMatchId), publicView.data.map { it.matchId })
        // Ohne die ausdrückliche Bestellung bleibt das Feld leer — kein halber Kanal.
        assertTrue(publicView.data.all { it.clarification == null })

        // Das Sprecher-Board: beide Läufe, der strittige markiert.
        val speakerView = !EventInfoService.getRunningMatches(eventId, 10, includeClarification = true)
        assertEquals(
            setOf(disputed.setupMatchId, plain.setupMatchId),
            speakerView.data.map { it.matchId }.toSet(),
        )
        assertEquals(
            true,
            speakerView.data.first { it.matchId == disputed.setupMatchId }.clarification,
        )
        assertEquals(
            false,
            speakerView.data.first { it.matchId == plain.setupMatchId }.clarification,
        )
    }
}
