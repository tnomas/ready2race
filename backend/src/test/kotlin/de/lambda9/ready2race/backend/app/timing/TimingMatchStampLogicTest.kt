package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.eventSchedule.boundary.ChainDecision
import de.lambda9.ready2race.backend.app.eventSchedule.boundary.ChainSlot
import de.lambda9.ready2race.backend.app.eventSchedule.boundary.ScheduleChain
import de.lambda9.ready2race.backend.app.eventSchedule.entity.EventScheduleSlotState
import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchStampLogic
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Stempel-Entscheidungen der internen Zeitnahme als reine Logik: wann wird `started_at`
 * gesetzt, wann NIE, und woran erkennt die Versuchs-Rücknahme den eigenen Stempel.
 */
class TimingMatchStampLogicTest {

    // Ein fester Marken-Zeitstempel; der konkrete Wert ist egal, nur die Umrechnung zählt.
    private val markMillis = 1_755_950_400_123L

    @Test
    fun stampConversionIsDeterministic() {
        // Stempeln und Wiedererkennen laufen über dieselbe Funktion - zweimal dieselbe Marke
        // muss exakt denselben LocalDateTime ergeben, sonst zerbricht die Provenienz-Erkennung.
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), TimingMatchStampLogic.stampFor(markMillis))
    }

    @Test
    fun firstMarkStampsTheStart() {
        val stamp = TimingMatchStampLogic.startStampFor(null, listOf(markMillis))
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), stamp)
    }

    @Test
    fun earliestOfSeveralMarksWins() {
        // Intervallstart: das erste losfahrende Boot ist der Moment, ab dem die Partie läuft.
        val stamp = TimingMatchStampLogic.startStampFor(
            null,
            listOf(markMillis + 30_000, markMillis, markMillis + 60_000),
        )
        assertEquals(TimingMatchStampLogic.stampFor(markMillis), stamp)
    }

    @Test
    fun existingStartIsNeverMoved() {
        // Ein bestehender Ist-Start (Schiedsrichter-Stempel!) gewinnt immer - auch gegen eine
        // FRÜHERE Marke, die nachträglich zugeordnet wird.
        val referee = LocalDateTime.of(2026, 8, 23, 10, 15, 30, 123_456_789)
        assertNull(TimingMatchStampLogic.startStampFor(referee, listOf(markMillis)))
    }

    @Test
    fun noMarksMeansNoStamp() {
        assertNull(TimingMatchStampLogic.startStampFor(null, emptyList()))
    }

    @Test
    fun retractionRecognizesOwnStamp() {
        val own = TimingMatchStampLogic.stampFor(markMillis)
        assertTrue(TimingMatchStampLogic.startRetracted(own, listOf(markMillis)))
        // Auch wenn weitere Marken dazukamen: ein Treffer genügt.
        assertTrue(
            TimingMatchStampLogic.startRetracted(own, listOf(markMillis + 30_000, markMillis))
        )
    }

    @Test
    fun retractionLeavesForeignStampsAlone() {
        // Ein Handstempel (LocalDateTime.now() mit Mikro-/Nanosekunden-Anteil) fällt nie exakt
        // mit einer Marken-Umrechnung zusammen - er bleibt stehen.
        val referee = LocalDateTime.of(2026, 8, 23, 10, 15, 30, 123_456_789)
        assertFalse(TimingMatchStampLogic.startRetracted(referee, listOf(markMillis)))
    }

    @Test
    fun retractionNeedsAStartAndAMark() {
        assertFalse(TimingMatchStampLogic.startRetracted(null, listOf(markMillis)))
        assertFalse(
            TimingMatchStampLogic.startRetracted(TimingMatchStampLogic.stampFor(markMillis), emptyList())
        )
    }

    /**
     * Die Kette behandelt einen von der Zeitnahme gestempelten Lauf EXAKT wie einen von
     * Hand/Abrufpfad gestempelten: `ScheduleChain.decideNext` liest nur die Spalte, nicht ihre
     * Herkunft. Ein laufender Lauf (Ist-Start gesetzt) blockiert das Vorrücken seiner
     * Startgruppe - mit Marken-Stempel genauso wie mit Handstempel.
     */
    @Test
    fun chainTreatsTimingStampLikeAnyOtherStart() {
        val base = LocalDateTime.of(2026, 8, 23, 10, 0)
        fun slots(startedAt: LocalDateTime) = listOf(
            ChainSlot(
                slotId = UUID.randomUUID(),
                startTime = base,
                state = EventScheduleSlotState.LINKED,
                matchId = UUID.randomUUID(),
                matchFinished = false,
                matchOpen = true,
                matchActivatedAt = startedAt,
                matchStartedAt = startedAt,
            ),
            ChainSlot(
                slotId = UUID.randomUUID(),
                startTime = base.plusMinutes(10),
                state = EventScheduleSlotState.LINKED,
                matchId = UUID.randomUUID(),
                matchFinished = false,
                matchOpen = true,
            ),
        )

        val timingStamp = TimingMatchStampLogic.stampFor(markMillis)
        val refereeStamp = LocalDateTime.of(2026, 8, 23, 10, 1, 2, 345_678_000)
        assertEquals(ChainDecision.NothingToDo, ScheduleChain.decideNext(slots(timingStamp)))
        assertEquals(ScheduleChain.decideNext(slots(refereeStamp)), ScheduleChain.decideNext(slots(timingStamp)))
    }
}
