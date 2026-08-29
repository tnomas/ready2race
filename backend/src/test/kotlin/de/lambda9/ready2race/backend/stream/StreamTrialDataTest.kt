package de.lambda9.ready2race.backend.stream

import de.lambda9.ready2race.backend.app.stream.boundary.StreamOverrideRow
import de.lambda9.ready2race.backend.app.stream.boundary.TRIAL_LOOP_EPOCH
import de.lambda9.ready2race.backend.app.stream.boundary.nextTrialEvaluationAt
import de.lambda9.ready2race.backend.app.stream.boundary.resolveScene
import de.lambda9.ready2race.backend.app.stream.boundary.trialInput
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Testet die Probemodus-Datenquelle [trialInput] direkt gegen den reinen Resolver
 * [resolveScene] - jeder Testfall wählt ein `now` in einer der vier Phasen der 3-Minuten-
 * Schleife und prüft, dass die dafür vorgesehene Grafik sichtbar wird.
 */
class StreamTrialDataTest {

    private fun graphic(
        type: StreamGraphicType,
        placement: StreamPlacement,
        displaySeconds: Int? = null,
    ): StreamSceneGraphicDto = StreamSceneGraphicDto(
        type = type,
        enabled = true,
        placement = placement,
        size = StreamGraphicSize.NORMAL,
        settings = StreamGraphicSettings(displaySeconds = displaySeconds),
    )

    @Test
    fun `Vorbereitungsphase (0-30s) zeigt die Startliste`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(10)
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))

        val resolved = resolveScene(trialInput(now, graphics))
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertTrue(startlist.visible, "Startliste muss in der Vorbereitungsphase sichtbar sein")
    }

    @Test
    fun `Startsequenz (30-60s) zeigt die Uhr`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(45)
        val graphics = listOf(
            graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
        )

        val resolved = resolveScene(trialInput(now, graphics))
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertTrue(clock.visible, "Uhr muss während der Startsequenz sichtbar sein")
        assertFalse(startlist.visible, "Startliste muss mit Sequenzstart weichen")
    }

    @Test
    fun `Startsequenz kuendigt den Feuerzeitpunkt an - die Schleife startet bei Sekunde 60`() {
        // Bühne muss HERUNTERzählen können, nicht nur wissen, wann die Sequenz begann.
        val now = TRIAL_LOOP_EPOCH.plusSeconds(45)
        val graphics = listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT))

        val resolved = resolveScene(trialInput(now, graphics))
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertEquals(
            TRIAL_LOOP_EPOCH.plusSeconds(60),
            clock.sequenceFiresAt,
            "Feuerzeitpunkt der Demo-Schleife muss Sekunde 60 sein (Rennstart)",
        )
    }

    @Test
    fun `Rennphase zeigt Zwischenzeiten alle 20s`() {
        // 25s ins Rennen (Rennstart bei Sekunde 60 der Schleife) - eine Zwischenzeit (bei +20s) ist gefallen.
        val now = TRIAL_LOOP_EPOCH.plusSeconds(85)
        val graphics = listOf(graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_CENTER))

        val resolved = resolveScene(trialInput(now, graphics))
        val laps = resolved.graphics.first { it.type == StreamGraphicType.LAPS }
        assertTrue(laps.visible, "Zwischenzeit muss kurz nach ihrer Erfassung sichtbar sein")
        val recordedTimes = laps.match?.teams?.first()?.laps?.map { it.recordedAt }
        assertTrue(recordedTimes?.all { it != null && !it.isAfter(now) } == true, "Zwischenzeiten dürfen nicht aus der Zukunft stammen")
    }

    @Test
    fun `Rennphase zeigt Einlaeufe ab Sekunde 120`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(125)
        val graphics = listOf(graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT))

        val resolved = resolveScene(trialInput(now, graphics))
        val ticker = resolved.graphics.first { it.type == StreamGraphicType.FINISH_TICKER }
        assertTrue(ticker.visible, "Ticker muss ab dem ersten Einlauf sichtbar sein")
        val entries = ticker.finishEntries.orEmpty()
        assertTrue(entries.isNotEmpty(), "Es muss mindestens einen Einlauf geben")
        assertEquals(entries.map { it.rank }.sorted(), entries.map { it.rank }, "Einläufe müssen nach Rang geordnet sein")
    }

    @Test
    fun `Ergebnisphase (150-180s) ist in der ersten Haelfte provisorisch`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(155)
        val graphics = listOf(graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER))

        val resolved = resolveScene(trialInput(now, graphics))
        val result = resolved.graphics.first { it.type == StreamGraphicType.RESULT }
        assertTrue(result.visible, "Ergebnis muss in der Ergebnisphase sichtbar sein")
        assertEquals(true, result.provisional, "Ergebnis muss in der ersten Hälfte des Fensters vorläufig sein")
    }

    @Test
    fun `Ergebnisphase ist in der zweiten Haelfte nicht mehr provisorisch`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(168)
        val graphics = listOf(graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER))

        val resolved = resolveScene(trialInput(now, graphics))
        val result = resolved.graphics.first { it.type == StreamGraphicType.RESULT }
        assertTrue(result.visible, "Ergebnis muss noch innerhalb der Standard-Anzeigedauer sichtbar sein")
        assertEquals(false, result.provisional, "Ergebnis muss in der zweiten Hälfte des Fensters endgültig sein")
    }

    @Test
    fun `dieselbe now liefert dieselbe Eingabe (deterministisch)`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(97)
        val graphics = listOf(graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_CENTER))

        val first = trialInput(now, graphics)
        val second = trialInput(now, graphics)
        assertEquals(first, second, "trialInput muss für dasselbe now immer dieselbe Eingabe liefern")
    }

    /**
     * Der Weckzeitpunkt der Demo-Schleife: Im Probemodus schreibt niemand, also ist er der
     * einzige Grund, aus dem der Szenen-Kanal die nächste Phase je zeigt.
     */
    @Test
    fun `der naechste Weckzeitpunkt liegt immer in dieser Schleifenrunde`() {
        // Jede Sekunde der Schleife einmal durchgehen: nie null, immer echt nach `now`, nie
        // weiter als bis zum Ende der laufenden Runde.
        (0L until 180L).forEach { second ->
            val now = TRIAL_LOOP_EPOCH.plusSeconds(second)
            val next = nextTrialEvaluationAt(now)
            assertTrue(next.isAfter(now), "Weckzeitpunkt bei Sekunde $second muss in der Zukunft liegen: $next")
            assertTrue(
                !next.isAfter(now.plusSeconds(180 - second)),
                "Weckzeitpunkt bei Sekunde $second darf die Runde nicht überspringen: $next",
            )
        }
    }

    @Test
    fun `die Phasengrenzen sind Weckzeitpunkte`() {
        // Vorbereitung -> Startsequenz -> Rennen, und aus der Rennphase heraus die
        // Zwischenzeiten (Sekunde 80) bzw. der erste Zieleinlauf (Sekunde 120).
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(30), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(10)))
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(60), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(45)))
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(80), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(61)))
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(120), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(119)))
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(150), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(145)))
        // Aus der Ergebnisphase heraus: erst das Ende der Vorläufigkeit, dann die nächste Runde.
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(165), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(151)))
        assertEquals(TRIAL_LOOP_EPOCH.plusSeconds(180), nextTrialEvaluationAt(TRIAL_LOOP_EPOCH.plusSeconds(170)))
    }

    @Test
    fun `die Schleife wiederholt sich nach 180s identisch (bis auf now)`() {
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val first = trialInput(TRIAL_LOOP_EPOCH.plusSeconds(10), graphics)
        val secondLoop = trialInput(TRIAL_LOOP_EPOCH.plusSeconds(190), graphics)

        assertEquals(first.preparing, secondLoop.preparing, "Der synthetische Lauf muss über Schleifen hinweg gleich aussehen")
    }

    /**
     * Ab hier: die Regie-Übersteuerung im Probemodus (siehe [StreamSceneLogic.buildInput] -
     * `trialInput` bekommt jetzt die ECHTEN Overrides der Szene statt sie zu verschweigen, damit
     * eine Regie Auto/An/Aus an der Demo-Schleife üben kann).
     */

    @Test
    fun `FORCED_OFF im Probemodus blendet eine von der Schleife gezeigte Grafik aus`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(10) // Vorbereitungsphase - Startliste liefe automatisch.
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_OFF,
                match = null,
                expiresAt = null,
                createdAt = now.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(now, graphics, overrides))
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertFalse(startlist.visible, "FORCED_OFF muss auch im Probemodus greifen")
        assertEquals(StreamOverrideState.FORCED_OFF, startlist.overrideState)
    }

    @Test
    fun `FORCED_ON im Probemodus zeigt eine von der Schleife verdeckte Grafik mit Demo-Inhalt`() {
        val now = TRIAL_LOOP_EPOCH.plusSeconds(10) // Vorbereitungsphase - die Uhr liefe noch nicht automatisch.
        val graphics = listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.CLOCK,
                state = StreamOverrideState.FORCED_ON,
                match = null,
                expiresAt = null,
                createdAt = now.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(now, graphics, overrides))
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertTrue(clock.visible, "FORCED_ON muss auch im Probemodus greifen")
        assertEquals(StreamOverrideState.FORCED_ON, clock.overrideState)
        assertTrue(clock.match != null, "FORCED_ON ohne Lauf-Bezug zeigt den aktuellen Demo-Inhalt")
    }

    @Test
    fun `FORCED_ON mit unaufloesbarem Lauf-Bezug bleibt auch im Probemodus verdeckt`() {
        // Der Vertrag gilt unverändert (siehe StreamSceneResolver.overrideContentUnresolved):
        // ein Lauf, den es in der Demo-Schleife nicht gibt, darf nicht still auf den
        // Automatik-Inhalt zurückfallen.
        val now = TRIAL_LOOP_EPOCH.plusSeconds(10)
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_ON,
                match = UUID.randomUUID(),
                expiresAt = null,
                createdAt = now.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(now, graphics, overrides))
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertFalse(startlist.visible, "Ein unauflösbarer Lauf-Bezug darf nicht auf Automatik-Inhalt zurückfallen")
        assertEquals(StreamOverrideState.FORCED_ON, startlist.overrideState)
        assertNull(startlist.match)
    }
}
