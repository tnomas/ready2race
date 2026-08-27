package de.lambda9.ready2race.backend.stream

import de.lambda9.ready2race.backend.app.stream.boundary.TRIAL_LOOP_EPOCH
import de.lambda9.ready2race.backend.app.stream.boundary.resolveScene
import de.lambda9.ready2race.backend.app.stream.boundary.trialInput
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    @Test
    fun `die Schleife wiederholt sich nach 180s identisch (bis auf now)`() {
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val first = trialInput(TRIAL_LOOP_EPOCH.plusSeconds(10), graphics)
        val secondLoop = trialInput(TRIAL_LOOP_EPOCH.plusSeconds(190), graphics)

        assertEquals(first.preparing, secondLoop.preparing, "Der synthetische Lauf muss über Schleifen hinweg gleich aussehen")
    }
}
