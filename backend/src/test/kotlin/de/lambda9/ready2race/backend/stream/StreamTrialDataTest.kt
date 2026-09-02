package de.lambda9.ready2race.backend.stream

import de.lambda9.ready2race.backend.app.stream.boundary.COUNTDOWN_LEAD_IN_SECONDS
import de.lambda9.ready2race.backend.app.stream.boundary.StreamOverrideRow
import de.lambda9.ready2race.backend.app.stream.boundary.resolveScene
import de.lambda9.ready2race.backend.app.stream.boundary.trialInput
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamTrialPhase
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Testet die Probemodus-Datenquelle [trialInput] direkt gegen den reinen Resolver
 * [resolveScene] - jeder Testfall wählt eine Phase des Demo-Laufs und prüft, dass die dafür
 * vorgesehene Grafik sichtbar wird bzw. den erwarteten Inhalt trägt.
 */
class StreamTrialDataTest {

    private val since: LocalDateTime = LocalDateTime.of(2026, 9, 2, 10, 0)

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

    private val allGraphics = listOf(
        graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
        graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
        graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_LEFT),
        graphic(StreamGraphicType.RESULT, StreamPlacement.FULL_CENTER),
        graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT),
        graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_RIGHT),
        graphic(StreamGraphicType.SCHEDULE, StreamPlacement.FULL_CENTER),
    )

    private fun resolve(phase: StreamTrialPhase, secondsIntoPhase: Long = 2, graphics: List<StreamSceneGraphicDto> = allGraphics) =
        resolveScene(trialInput(since.plusSeconds(secondsIntoPhase), phase, since, graphics))

    private fun visible(phase: StreamTrialPhase, type: StreamGraphicType, secondsIntoPhase: Long = 2): Boolean =
        resolve(phase, secondsIntoPhase).graphics.first { it.type == type }.visible

    @Test
    fun `Vorbereitung zeigt Startliste und Als Naechstes, aber keine Uhr`() {
        assertTrue(visible(StreamTrialPhase.PREPARING, StreamGraphicType.STARTLIST))
        assertFalse(visible(StreamTrialPhase.PREPARING, StreamGraphicType.CLOCK))
        assertFalse(visible(StreamTrialPhase.PREPARING, StreamGraphicType.RESULT))
    }

    @Test
    fun `das Startlisten-Fenster laeuft ab Phasenbeginn und schliesst sich danach`() {
        assertTrue(visible(StreamTrialPhase.PREPARING, StreamGraphicType.STARTLIST, secondsIntoPhase = 14))
        assertFalse(visible(StreamTrialPhase.PREPARING, StreamGraphicType.STARTLIST, secondsIntoPhase = 16))
        // Nach dem Fenster gibt die Startliste den Platz frei — Als Nächstes bleibt.
        assertTrue(visible(StreamTrialPhase.PREPARING, StreamGraphicType.NEXT_UP, secondsIntoPhase = 16))
    }

    @Test
    fun `Countdown zeigt die Uhr mit Feuerzeitpunkt nach dem Vorlauf`() {
        val clock = resolve(StreamTrialPhase.COUNTDOWN).graphics.first { it.type == StreamGraphicType.CLOCK }
        assertTrue(clock.visible)
        assertEquals(since, clock.sequenceStartedAt)
        assertEquals(since.plusSeconds(COUNTDOWN_LEAD_IN_SECONDS), clock.sequenceFiresAt)
        assertFalse(visible(StreamTrialPhase.COUNTDOWN, StreamGraphicType.STARTLIST), "Ab Sequenzstart ist die Startliste aus")
    }

    @Test
    fun `Rennen laeuft mit gestempeltem Start und ohne frische Marke`() {
        val resolved = resolve(StreamTrialPhase.RUNNING)
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertTrue(clock.visible)
        assertNotNull(clock.match?.actualStartTime)
        assertTrue(clock.match!!.actualStartTime!!.isBefore(since), "Der Rennstart liegt vor dem Phasenbeginn")
        assertFalse(resolved.graphics.first { it.type == StreamGraphicType.LAPS }.visible, "Keine frische Marke - kein Rundenband")
        assertTrue(clock.match!!.teams.all { it.timeString == null }, "Noch niemand im Ziel")
    }

    @Test
    fun `Zwischenzeit zeigt das Rundenband mit einer eben eingetroffenen Marke`() {
        val resolved = resolve(StreamTrialPhase.SPLIT)
        val laps = resolved.graphics.first { it.type == StreamGraphicType.LAPS }
        assertTrue(laps.visible)
        val latest = laps.match!!.teams.flatMap { it.laps }.mapNotNull { it.recordedAt }.max()
        assertEquals(since, latest, "Die jüngste Marke ist auf den Phasenbeginn gestempelt")
        assertFalse(visible(StreamTrialPhase.SPLIT, StreamGraphicType.LAPS, secondsIntoPhase = 9), "Das 8-s-Fenster schließt sich")
    }

    @Test
    fun `Einlauf zeigt zwei Boote im Ziel bei laufender Uhr`() {
        val resolved = resolve(StreamTrialPhase.FINISH)
        val ticker = resolved.graphics.first { it.type == StreamGraphicType.FINISH_TICKER }
        assertTrue(ticker.visible)
        assertEquals(listOf(1, 2), ticker.finishEntries!!.map { it.rank })
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertEquals(2, clock.match!!.teams.count { it.timeString != null })
    }

    @Test
    fun `alle im Ziel fuellt den Ticker und stempelt jedes Boot`() {
        val resolved = resolve(StreamTrialPhase.FINISHED)
        val ticker = resolved.graphics.first { it.type == StreamGraphicType.FINISH_TICKER }
        assertEquals(4, ticker.finishEntries!!.size)
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertTrue(clock.match!!.teams.all { it.timeString != null }, "Die Bühne friert die Uhr auf der letzten Zielzeit ein")
        assertFalse(visible(StreamTrialPhase.FINISHED, StreamGraphicType.RESULT), "Noch kein Ergebnis")
    }

    @Test
    fun `Ergebnis ist vorlaeufig und verdraengt den Ticker`() {
        val resolved = resolve(StreamTrialPhase.RESULT)
        val result = resolved.graphics.first { it.type == StreamGraphicType.RESULT }
        assertTrue(result.visible)
        assertEquals(true, result.provisional)
        assertEquals(listOf(1, 2, 3, 4), result.result!!.teams.map { it.place })
        assertFalse(resolved.graphics.first { it.type == StreamGraphicType.FINISH_TICKER }.visible)
        assertFalse(visible(StreamTrialPhase.RESULT, StreamGraphicType.RESULT, secondsIntoPhase = 21), "Das 20-s-Fenster schließt sich")
    }

    @Test
    fun `Leerlauf zeigt nur das Tagesprogramm`() {
        val resolved = resolve(StreamTrialPhase.IDLE)
        val visibleTypes = resolved.graphics.filter { it.visible }.map { it.type }
        assertEquals(listOf(StreamGraphicType.SCHEDULE), visibleTypes)
        assertTrue(resolved.graphics.first { it.type == StreamGraphicType.SCHEDULE }.schedule!!.isNotEmpty())
    }

    @Test
    fun `das Tagesprogramm liegt in jeder Phase vor und in der Zukunft`() {
        for (phase in StreamTrialPhase.entries) {
            val schedule = resolve(phase).graphics.first { it.type == StreamGraphicType.SCHEDULE }.schedule!!
            assertTrue(schedule.isNotEmpty(), "Phase $phase ohne Tagesprogramm")
            assertTrue(schedule.all { it.startTime!!.isAfter(since) }, "Phase $phase: Programm liegt nicht in der Zukunft")
        }
    }

    @Test
    fun `dieselben Eingaben liefern dieselbe Ausgabe (deterministisch)`() {
        val now = since.plusSeconds(3)
        assertEquals(
            trialInput(now, StreamTrialPhase.SPLIT, since, allGraphics),
            trialInput(now, StreamTrialPhase.SPLIT, since, allGraphics),
        )
    }

    @Test
    fun `nur erfundene Vereine tauchen auf`() {
        for (phase in StreamTrialPhase.entries) {
            val clubs = resolve(phase).graphics.flatMap { graphic ->
                graphic.match?.teams.orEmpty().mapNotNull { it.clubsShort } +
                    graphic.result?.teams.orEmpty().mapNotNull { it.clubsShort } +
                    graphic.finishEntries.orEmpty().mapNotNull { it.clubsShort }
            }
            assertTrue(clubs.all { it.endsWith("Demo") || it.endsWith("Probe") || it.endsWith("Muster") || it.endsWith("Fiktiv") }, "$phase: $clubs")
        }
    }

    @Test
    fun `FORCED_OFF im Probemodus blendet eine von der Phase gezeigte Grafik aus`() {
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_OFF,
                match = null,
                expiresAt = null,
                createdAt = since.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(since.plusSeconds(2), StreamTrialPhase.PREPARING, since, graphics, overrides))
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertFalse(startlist.visible, "FORCED_OFF muss auch im Probemodus greifen")
        assertEquals(StreamOverrideState.FORCED_OFF, startlist.overrideState)
    }

    @Test
    fun `FORCED_ON im Probemodus zeigt eine von der Phase verdeckte Grafik mit Demo-Inhalt`() {
        // In der Vorbereitung liefe die Uhr nicht automatisch - erzwungen zeigt sie den Demo-Lauf.
        val graphics = listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.CLOCK,
                state = StreamOverrideState.FORCED_ON,
                match = null,
                expiresAt = null,
                createdAt = since.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(since.plusSeconds(2), StreamTrialPhase.PREPARING, since, graphics, overrides))
        val clock = resolved.graphics.first { it.type == StreamGraphicType.CLOCK }
        assertTrue(clock.visible, "FORCED_ON muss auch im Probemodus greifen")
        assertEquals(StreamOverrideState.FORCED_ON, clock.overrideState)
        assertTrue(clock.match != null, "FORCED_ON ohne Lauf-Bezug zeigt den aktuellen Demo-Inhalt")
    }

    @Test
    fun `FORCED_ON mit unaufloesbarem Lauf-Bezug bleibt auch im Probemodus verdeckt`() {
        // Der Vertrag gilt unverändert (siehe StreamSceneResolver.overrideContentUnresolved):
        // ein Lauf, den es im Demo-Lauf nicht gibt, darf nicht still auf den Automatik-Inhalt
        // zurückfallen.
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_ON,
                match = UUID.randomUUID(),
                expiresAt = null,
                createdAt = since.minusSeconds(1),
            ),
        )

        val resolved = resolveScene(trialInput(since.plusSeconds(2), StreamTrialPhase.PREPARING, since, graphics, overrides))
        val startlist = resolved.graphics.first { it.type == StreamGraphicType.STARTLIST }
        assertFalse(startlist.visible, "Ein unauflösbarer Lauf-Bezug darf nicht auf Automatik-Inhalt zurückfallen")
        assertEquals(StreamOverrideState.FORCED_ON, startlist.overrideState)
        assertNull(startlist.match)
    }
}
