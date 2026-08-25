package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.entity.TimingMatchProgress
import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Ableitung des Partien-Zustands für die Posten-Startliste: offen -> Startsequenz läuft ->
 * gestartet -> im Ziel. Der Zustand wird nicht gespeichert, sondern aus Sequenzen, Marken und
 * `finished_at` abgeleitet - diese Tests legen die Rangfolge der Ableitung fest.
 */
class TimingMatchProgressTest {

    private val now: LocalDateTime = LocalDateTime.now()

    @Test
    fun untouchedMatchIsOpen() {
        assertEquals(
            TimingMatchProgress.OPEN,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = false,
                anyTeamStarted = false,
                allTeamsFinished = false,
            ),
        )
    }

    @Test
    fun activeSequenceMeansStarting() {
        assertEquals(
            TimingMatchProgress.STARTING,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = true,
                anyTeamStarted = false,
                allTeamsFinished = false,
            ),
        )
    }

    @Test
    fun aRunningIntervalSequenceStaysStartingEvenWhenTheFirstBoatsAreAway() {
        // Intervallstart: die ersten Boote sind schon unterwegs, die Sequenz feuert noch - für den
        // Startposten ist "Startsequenz läuft" die maßgebliche Information, nicht "gestartet".
        assertEquals(
            TimingMatchProgress.STARTING,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = true,
                anyTeamStarted = true,
                allTeamsFinished = false,
            ),
        )
    }

    @Test
    fun startedOnceAnyTeamIsAwayAndNoSequenceIsLive() {
        assertEquals(
            TimingMatchProgress.STARTED,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = false,
                anyTeamStarted = true,
                allTeamsFinished = false,
            ),
        )
    }

    @Test
    fun finishedWhenEveryStartedTeamHasAFinish() {
        assertEquals(
            TimingMatchProgress.FINISHED,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = false,
                anyTeamStarted = true,
                allTeamsFinished = true,
            ),
        )
    }

    @Test
    fun aPersistedFinishAlwaysWins() {
        // finished_at ist die ausdrückliche Entscheidung "dieser Lauf ist beendet" - sie schlägt
        // jede abgeleitete Zwischenstufe, auch eine (liegengebliebene) aktive Sequenz.
        assertEquals(
            TimingMatchProgress.FINISHED,
            TimingMatchProgress.of(
                finishedAt = now,
                hasActiveSequence = true,
                anyTeamStarted = false,
                allTeamsFinished = false,
            ),
        )
    }

    @Test
    fun allTeamsFinishedWithoutAnyStartIsNotFinished() {
        // "Alle im Ziel" ist ohne einen einzigen Start eine leere Aussage (kein Team hat Marken) -
        // eine unberührte Partie bleibt offen.
        assertEquals(
            TimingMatchProgress.OPEN,
            TimingMatchProgress.of(
                finishedAt = null,
                hasActiveSequence = false,
                anyTeamStarted = false,
                allTeamsFinished = true,
            ),
        )
    }
}
