package de.lambda9.ready2race.backend.stream

import de.lambda9.ready2race.backend.app.competitionExecution.entity.MatchTeamLapDto
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardResult
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardStartState
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardTeam
import de.lambda9.ready2race.backend.app.matchStatus.entity.MatchState
import de.lambda9.ready2race.backend.app.stream.boundary.ResolvedScene
import de.lambda9.ready2race.backend.app.stream.boundary.StreamOverrideRow
import de.lambda9.ready2race.backend.app.stream.boundary.StreamResolverInput
import de.lambda9.ready2race.backend.app.stream.boundary.resolveScene
import de.lambda9.ready2race.backend.app.stream.entity.StreamFinishEntry
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Reiner Unit-Test des Szenen-Resolvers — keine DB, keine KIO. `t0` ist der feste Ankerpunkt für
 * alle Zeitangaben, damit jeder Testfall exakt an- und ausschaltende Sekunden nachrechnen kann.
 */
class StreamSceneResolverTest {

    private val t0: LocalDateTime = LocalDateTime.of(2026, 8, 27, 10, 0)

    /** Minimal-Fabrik für einen laufenden/vorbereitenden Lauf; nur die für den Resolver relevanten Felder sind gesetzt. */
    private fun testMatch(
        id: UUID = UUID.randomUUID(),
        state: MatchState = MatchState.PREPARING,
        laps: List<MatchTeamLapDto> = emptyList(),
    ): AthleteBoardMatch = AthleteBoardMatch(
        matchId = id,
        competitionName = "Achter Herren",
        categoryName = null,
        roundName = null,
        matchName = null,
        startTime = null,
        state = state,
        startState = AthleteBoardStartState.UNSCHEDULED,
        teams = if (laps.isEmpty()) emptyList() else listOf(
            AthleteBoardTeam(
                startNumber = 1,
                teamNumber = null,
                clubsShort = null,
                clubsFull = null,
                teamName = "Test-Boot",
                participants = emptyList(),
                laps = laps,
            )
        ),
    )

    private fun testResult(id: UUID = UUID.randomUUID(), clarification: Boolean = false): AthleteBoardResult = AthleteBoardResult(
        matchId = id,
        competitionName = "Achter Herren",
        categoryName = null,
        roundName = null,
        matchName = null,
        startTime = null,
        actualStartTime = null,
        clarification = clarification,
        teams = emptyList(),
    )

    private fun graphic(
        type: StreamGraphicType,
        placement: StreamPlacement,
        displaySeconds: Int? = null,
        showMaterial: Boolean? = null,
    ): StreamSceneGraphicDto = StreamSceneGraphicDto(
        type = type,
        enabled = true,
        placement = placement,
        size = StreamGraphicSize.NORMAL,
        settings = StreamGraphicSettings(displaySeconds = displaySeconds, showMaterial = showMaterial),
    )

    /** Alle Eingaben defaulten auf "nichts los" — jeder Test setzt gezielt, was er prüft. */
    private fun baseInput(
        now: LocalDateTime = t0,
        graphics: List<StreamSceneGraphicDto> = emptyList(),
        overrides: List<StreamOverrideRow> = emptyList(),
        preparing: AthleteBoardMatch? = null,
        preparingSince: LocalDateTime? = null,
        running: AthleteBoardMatch? = null,
        sequenceStartedAt: LocalDateTime? = null,
        sequenceFiresAt: LocalDateTime? = null,
        sequencePausedAt: LocalDateTime? = null,
        latestResult: AthleteBoardResult? = null,
        latestResultAt: LocalDateTime? = null,
        latestResultProvisional: Boolean = false,
        finishEntries: List<StreamFinishEntry> = emptyList(),
        overriddenMatches: Map<UUID, AthleteBoardMatch> = emptyMap(),
        overriddenResults: Map<UUID, AthleteBoardResult> = emptyMap(),
        schedule: List<AthleteBoardMatch> = emptyList(),
        courseImageUrl: String? = null,
    ): StreamResolverInput = StreamResolverInput(
        now = now,
        graphics = graphics,
        overrides = overrides,
        preparing = preparing,
        preparingSince = preparingSince,
        running = running,
        sequenceStartedAt = sequenceStartedAt,
        sequenceFiresAt = sequenceFiresAt,
        sequencePausedAt = sequencePausedAt,
        latestResult = latestResult,
        latestResultAt = latestResultAt,
        latestResultProvisional = latestResultProvisional,
        finishEntries = finishEntries,
        overriddenMatches = overriddenMatches,
        overriddenResults = overriddenResults,
        schedule = schedule,
        courseImageUrl = courseImageUrl,
    )

    private fun ResolvedScene.graphic(type: StreamGraphicType): de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicViewDto =
        graphics.first { it.type == type }

    @Test
    fun `startlist zeigt sich bei preparing und gibt nach 15 s den Platz an nextUp frei`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
            graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_CENTER),
        )

        val atStart = resolveScene(
            baseInput(now = t0, graphics = graphics, preparing = preparing, preparingSince = t0)
        )
        assertTrue(atStart.graphic(StreamGraphicType.STARTLIST).visible, "Startliste muss beim Vorbereiten sichtbar sein")
        assertFalse(atStart.graphic(StreamGraphicType.NEXT_UP).visible, "nextUp muss dem Platz weichen, solange Startliste zeigt")

        val afterDisplaySeconds = resolveScene(
            baseInput(now = t0.plusSeconds(15), graphics = graphics, preparing = preparing, preparingSince = t0)
        )
        assertFalse(afterDisplaySeconds.graphic(StreamGraphicType.STARTLIST).visible, "Startliste muss nach 15 s aus sein")
        assertTrue(afterDisplaySeconds.graphic(StreamGraphicType.NEXT_UP).visible, "nextUp muss den freien Platz übernehmen")
    }

    @Test
    fun `nextUp verschwindet mit dem Sequenzstart`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_CENTER))

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                preparing = preparing,
                preparingSince = t0.minusSeconds(30),
                sequenceStartedAt = t0,
            )
        )
        assertFalse(resolved.graphic(StreamGraphicType.NEXT_UP).visible, "nextUp muss mit Sequenzstart aus sein")
    }

    @Test
    fun `clock zaehlt ab Sequenzstart (sichtbar, sequenceStartedAt gesetzt)`() {
        val graphics = listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT))
        val firesAt = t0.plusSeconds(30)

        val resolved = resolveScene(
            baseInput(now = t0, graphics = graphics, sequenceStartedAt = t0, sequenceFiresAt = firesAt)
        )
        val clock = resolved.graphic(StreamGraphicType.CLOCK)
        assertTrue(clock.visible, "Uhr muss ab Sequenzstart sichtbar sein")
        assertEquals(t0, clock.sequenceStartedAt, "Sequenzstart muss durchgereicht werden")
        assertEquals(firesAt, clock.sequenceFiresAt, "Feuerzeitpunkt muss durchgereicht werden")
        assertEquals(null, clock.sequencePausedAt, "ohne Pause darf kein Pausenbeginn mitreisen")
    }

    @Test
    fun `clock bleibt bei pausierter Sequenz sichtbar und traegt den Pausenbeginn`() {
        // Die Pause ist eine Unterbrechung, kein Ende: die Uhr bleibt on air und friert auf dem
        // Reststand des Pausenbeginns ein (das Einfrieren rechnet die Bühne, der Resolver reicht
        // nur den Zeitpunkt durch - und zwar AUSSCHLIESSLICH an die CLOCK-Grafik).
        val graphics = listOf(
            graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
            graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_CENTER),
        )
        val firesAt = t0.plusSeconds(30)
        val pausedAt = t0.plusSeconds(19)

        val resolved = resolveScene(
            baseInput(
                now = t0.plusSeconds(25),
                graphics = graphics,
                preparing = testMatch(state = MatchState.PREPARING),
                preparingSince = t0.minusSeconds(60),
                sequenceStartedAt = t0,
                sequenceFiresAt = firesAt,
                sequencePausedAt = pausedAt,
            )
        )
        val clock = resolved.graphic(StreamGraphicType.CLOCK)
        assertTrue(clock.visible, "Uhr muss auch pausiert sichtbar bleiben")
        assertEquals(pausedAt, clock.sequencePausedAt, "Pausenbeginn muss durchgereicht werden")
        assertEquals(
            null,
            resolved.graphic(StreamGraphicType.NEXT_UP).sequencePausedAt,
            "Pausenbeginn gehört ausschließlich an die CLOCK-Grafik",
        )
        assertFalse(
            resolved.graphic(StreamGraphicType.NEXT_UP).visible,
            "die pausierte Sequenz ist weiter aktiv - nextUp bleibt verdrängt",
        )
    }

    @Test
    fun `laps verdraengt startlist auf demselben Platz`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val running = testMatch(
            state = MatchState.RUNNING,
            laps = listOf(MatchTeamLapDto(name = "500m", timeString = "01:40.0", recordedAt = t0)),
        )
        val graphics = listOf(
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
            graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_CENTER),
        )

        val resolved = resolveScene(
            baseInput(now = t0, graphics = graphics, preparing = preparing, preparingSince = t0, running = running)
        )
        assertTrue(resolved.graphic(StreamGraphicType.LAPS).visible, "Laps muss den Platz gewinnen")
        assertFalse(resolved.graphic(StreamGraphicType.STARTLIST).visible, "Startliste muss verdrängt werden")
    }

    @Test
    fun `result verdraengt laps und traegt provisional bei Klaerung`() {
        val running = testMatch(
            state = MatchState.RUNNING,
            laps = listOf(MatchTeamLapDto(name = "500m", timeString = "01:40.0", recordedAt = t0)),
        )
        val result = testResult()
        val graphics = listOf(
            graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_CENTER),
            graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER),
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                running = running,
                latestResult = result,
                latestResultAt = t0,
                latestResultProvisional = true,
            )
        )
        val resultDto = resolved.graphic(StreamGraphicType.RESULT)
        assertTrue(resultDto.visible, "Ergebnis muss den Platz gewinnen")
        assertFalse(resolved.graphic(StreamGraphicType.LAPS).visible, "Laps muss dem Ergebnis weichen")
        assertEquals(true, resultDto.provisional, "Klärung muss als vorläufig durchgereicht werden")
    }

    @Test
    fun `finishTicker erscheint mit dem ersten Einlauf und weicht result`() {
        val entries = listOf(StreamFinishEntry(rank = 1, startNumber = 3, clubsShort = "RGF", clubsFull = null, timeString = "06:12.3"))
        // RESULT muss in der Szene konfiguriert sein, sonst gibt es nichts, dem der Ticker weichen könnte.
        val graphics = listOf(
            graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT),
            graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER),
        )

        val withoutResult = resolveScene(
            baseInput(now = t0, graphics = graphics, finishEntries = entries)
        )
        assertTrue(withoutResult.graphic(StreamGraphicType.FINISH_TICKER).visible, "Ticker muss mit erstem Einlauf erscheinen")

        val withResult = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                finishEntries = entries,
                latestResult = testResult(),
                latestResultAt = t0,
            )
        )
        assertFalse(withResult.graphic(StreamGraphicType.FINISH_TICKER).visible, "Ticker muss dem Ergebnis weichen")
    }

    @Test
    fun `finishTicker bleibt sichtbar wenn die Szene gar kein RESULT konfiguriert hat`() {
        val entries = listOf(StreamFinishEntry(rank = 1, startNumber = 3, clubsShort = "RGF", clubsFull = null, timeString = "06:12.3"))
        // Keine RESULT-Zeile in dieser Szene - ein latestResultAt im Anzeigefenster darf den
        // Ticker trotzdem nicht ausblenden, weil nichts an seine Stelle treten würde.
        val graphics = listOf(graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT))

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                finishEntries = entries,
                latestResult = testResult(),
                latestResultAt = t0,
            )
        )
        assertTrue(
            resolved.graphic(StreamGraphicType.FINISH_TICKER).visible,
            "Ohne konfigurierte RESULT-Grafik darf der Ticker nicht ausgeblendet werden",
        )
    }

    @Test
    fun `forcedOff blendet trotz Automatik aus`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_OFF,
                match = null,
                expiresAt = null,
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(now = t0, graphics = graphics, overrides = overrides, preparing = preparing, preparingSince = t0)
        )
        val startlist = resolved.graphic(StreamGraphicType.STARTLIST)
        assertFalse(startlist.visible, "FORCED_OFF muss trotz erfüllter Automatik ausblenden")
        assertEquals(StreamOverrideState.FORCED_OFF, startlist.overrideState)
    }

    @Test
    fun `forcedOn mit matchBezug zeigt den gewaehlten Lauf`() {
        val chosenId = UUID.randomUUID()
        val chosenMatch = testMatch(id = chosenId, state = MatchState.UPCOMING)
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.NEXT_UP,
                state = StreamOverrideState.FORCED_ON,
                match = chosenId,
                expiresAt = null,
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                overrides = overrides,
                preparing = preparing,
                preparingSince = t0,
                overriddenMatches = mapOf(chosenId to chosenMatch),
            )
        )
        val nextUp = resolved.graphic(StreamGraphicType.NEXT_UP)
        assertTrue(nextUp.visible, "FORCED_ON muss unabhängig von der Platz-Priorität sichtbar sein")
        assertEquals(chosenId, nextUp.match?.matchId, "FORCED_ON mit match-Bezug muss den gewählten Lauf zeigen, nicht preparing")
    }

    @Test
    fun `forcedOn RESULT mit matchBezug traegt die eigene Klaerung des gewaehlten Ergebnisses`() {
        val chosenId = UUID.randomUUID()
        // Das gewählte Ergebnis steht selbst auf Klärung - unabhängig von latestResultProvisional,
        // das hier bewusst false bleibt, um zu zeigen, dass es nicht mehr herangezogen wird.
        val chosenResult = testResult(id = chosenId, clarification = true)
        val graphics = listOf(graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.RESULT,
                state = StreamOverrideState.FORCED_ON,
                match = chosenId,
                expiresAt = null,
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                overrides = overrides,
                latestResultProvisional = false,
                overriddenResults = mapOf(chosenId to chosenResult),
            )
        )
        val result = resolved.graphic(StreamGraphicType.RESULT)
        assertTrue(result.visible, "FORCED_ON muss das Ergebnis zeigen")
        assertEquals(true, result.provisional, "Die Klärung des gewählten Ergebnisses muss durchgereicht werden, nicht verworfen")
    }

    // --- FORCED_ON auf einen unauflösbaren Lauf: kein stiller Rückfall auf Automatik-Inhalt ---
    //
    // `overriddenMatches`/`overriddenResults` kommen von `StreamSceneLogic.buildInput` und decken
    // nicht jeden denkbaren Lauf ab (Startliste/nextUp/Uhr/Laps kennen nur laufende/anstehende
    // Läufe, Ergebnis nur beendete - siehe Kommentar an `overrideContentUnresolved`). Fehlt der
    // von der Regie benannte Lauf in der jeweiligen Map (z. B. weil er inzwischen beendet ist),
    // darf der Resolver NICHT auf `preparing`/`latestResult` zurückfallen: das zeigte einen
    // anderen Lauf, als die Regie verlangt hat, ohne jedes Signal an die Bedienoberfläche.

    @Test
    fun `forcedOn STARTLIST mit unaufloesbarem Lauf bleibt aus statt auf preparing zurueckzufallen`() {
        val missingId = UUID.randomUUID()
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_ON,
                match = missingId,
                expiresAt = null,
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                overrides = overrides,
                preparing = preparing,
                preparingSince = t0,
                // overriddenMatches bleibt leer: der benannte Lauf ist nicht auffindbar (z. B.
                // längst beendet - buildInput befüllt die Map nur aus laufenden/anstehenden Läufen).
            )
        )
        val startlist = resolved.graphic(StreamGraphicType.STARTLIST)
        assertFalse(startlist.visible, "Ein unauflösbarer FORCED_ON-Bezug darf nicht auf den Automatik-Inhalt zurückfallen")
        assertEquals(
            StreamOverrideState.FORCED_ON,
            startlist.overrideState,
            "Die Regie muss weiterhin als aktiv (aber leer) gemeldet werden, nicht als AUTO",
        )
        assertNull(startlist.match, "Ohne aufgelösten Inhalt darf kein Lauf im DTO stehen")
    }

    @Test
    fun `forcedOn RESULT mit unaufloesbarem Lauf bleibt aus statt auf latestResult zurueckzufallen`() {
        val missingId = UUID.randomUUID()
        val graphics = listOf(graphic(StreamGraphicType.RESULT, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.RESULT,
                state = StreamOverrideState.FORCED_ON,
                match = missingId,
                expiresAt = null,
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                overrides = overrides,
                latestResult = testResult(),
                latestResultAt = t0,
                // overriddenResults bleibt leer: der benannte Lauf liefert kein (bestätigtes)
                // Ergebnis.
            )
        )
        val result = resolved.graphic(StreamGraphicType.RESULT)
        assertFalse(result.visible, "Ein unauflösbarer FORCED_ON-Bezug darf nicht auf das jüngste Ergebnis zurückfallen")
        assertEquals(
            StreamOverrideState.FORCED_ON,
            result.overrideState,
            "Die Regie muss weiterhin als aktiv (aber leer) gemeldet werden, nicht als AUTO",
        )
        assertNull(result.result, "Ohne aufgelösten Inhalt darf kein Ergebnis im DTO stehen")
    }

    @Test
    fun `abgelaufener Override faellt auf AUTO zurueck`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER))
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_OFF,
                match = null,
                expiresAt = t0.minusSeconds(1),
                createdAt = t0.minusSeconds(60),
            )
        )

        val resolved = resolveScene(
            baseInput(now = t0, graphics = graphics, overrides = overrides, preparing = preparing, preparingSince = t0)
        )
        val startlist = resolved.graphic(StreamGraphicType.STARTLIST)
        assertTrue(startlist.visible, "Abgelaufener FORCED_OFF darf die Automatik nicht mehr blockieren")
        assertEquals(StreamOverrideState.AUTO, startlist.overrideState, "Abgelaufener Override muss als AUTO gelten")
    }

    @Test
    fun `zwei forcedOn auf einem Platz - der juengere gewinnt`() {
        val graphics = listOf(
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
            graphic(StreamGraphicType.NEXT_UP, StreamPlacement.BOTTOM_CENTER),
        )
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.STARTLIST,
                state = StreamOverrideState.FORCED_ON,
                match = null,
                expiresAt = null,
                createdAt = t0.minusSeconds(10),
            ),
            StreamOverrideRow(
                graphicType = StreamGraphicType.NEXT_UP,
                state = StreamOverrideState.FORCED_ON,
                match = null,
                expiresAt = null,
                createdAt = t0,
            ),
        )

        val resolved = resolveScene(baseInput(now = t0, graphics = graphics, overrides = overrides))
        assertTrue(resolved.graphic(StreamGraphicType.NEXT_UP).visible, "Der jüngere FORCED_ON (späteres createdAt) muss gewinnen")
        assertFalse(resolved.graphic(StreamGraphicType.STARTLIST).visible, "Der ältere FORCED_ON muss weichen")
    }

    @Test
    fun `nextEvaluationAt ist der fruehste Umschaltpunkt`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val running = testMatch(
            state = MatchState.RUNNING,
            laps = listOf(MatchTeamLapDto(name = "500m", timeString = "01:40.0", recordedAt = t0)),
        )
        val graphics = listOf(
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_LEFT, displaySeconds = 15),
            graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_RIGHT, displaySeconds = 8),
        )
        val overrides = listOf(
            StreamOverrideRow(
                graphicType = StreamGraphicType.NEXT_UP,
                state = StreamOverrideState.FORCED_ON,
                match = null,
                expiresAt = t0.plusSeconds(20),
                createdAt = t0,
            )
        )

        val resolved = resolveScene(
            baseInput(
                now = t0,
                graphics = graphics,
                overrides = overrides,
                preparing = preparing,
                preparingSince = t0,
                running = running,
            )
        )
        // Startliste faellt nach 8s LAPS zum Opfer? Nein - unterschiedliche Plaetze, beide zaehlen eigenstaendig:
        // startlist bis t0+15s, laps bis t0+8s, override bis t0+20s -> das Minimum ist t0+8s (laps).
        assertEquals(t0.plusSeconds(8), resolved.nextEvaluationAt, "Der früheste künftige Umschaltpunkt muss gewinnen")
    }

    @Test
    fun `nextEvaluationAt ist null ohne kuenftigen Umschaltpunkt`() {
        val resolved = resolveScene(baseInput(now = t0))
        assertNull(resolved.nextEvaluationAt, "Ohne Zeitgeber darf kein Umschaltpunkt entstehen")
    }

    @Test
    fun `showMaterial spiegelt die Grafik-Einstellung, false ohne eigene Angabe`() {
        val preparing = testMatch(state = MatchState.PREPARING)
        val graphics = listOf(
            graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER, showMaterial = true),
            graphic(StreamGraphicType.NEXT_UP, StreamPlacement.TOP_LEFT),
        )

        val resolved = resolveScene(
            baseInput(now = t0, graphics = graphics, preparing = preparing, preparingSince = t0)
        )

        assertTrue(resolved.graphic(StreamGraphicType.STARTLIST).showMaterial, "muss die gesetzte Einstellung übernehmen")
        assertFalse(resolved.graphic(StreamGraphicType.NEXT_UP).showMaterial, "muss ohne eigene Angabe auf false fallen")
    }
}
