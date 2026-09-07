package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.eventInfo.MyEventFixture
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneBroadcaster
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TimingMatchStampLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceEntryRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.control.plannedStartMillis
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchTeam
import de.lambda9.ready2race.backend.app.timing.createTestMatchTeams
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneLogic
import de.lambda9.ready2race.backend.app.stream.control.StreamSceneRepo
import de.lambda9.ready2race.backend.app.stream.control.toJsonb
import de.lambda9.ready2race.backend.database.generated.tables.records.StreamSceneGraphicRecord
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamTrialPhase
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Datenbeschaffung und Szenenstand (Task 8) gegen ein echtes Postgres: derselbe Weg, den der
 * Szenen-Kanal und `GET .../view` nehmen - echte Läufe aus der Board-Datenlogik durch
 * `resolveScene` in einen [de.lambda9.ready2race.backend.app.stream.entity.StreamSceneViewDto].
 *
 * Das Regelwerk selbst hängt am reinen Resolver (StreamSceneResolverTest) und die Demo-Schleife
 * an StreamTrialDataTest - hier zählt nur, dass die echten Quellen richtig angezapft werden und
 * dass der Probemodus sie vollständig umgeht.
 */
class StreamSceneViewTest {

    private fun sceneRequest(name: String = "Rennen") = StreamSceneRequest(
        name = name,
        background = StreamBackground.TRANSPARENT,
        safeAreaPercent = 5,
    )

    private fun graphic(
        type: StreamGraphicType,
        placement: StreamPlacement,
        enabled: Boolean = true,
        displaySeconds: Int? = null,
    ) = StreamSceneGraphicDto(
        type = type,
        enabled = enabled,
        placement = placement,
        size = StreamGraphicSize.NORMAL,
        settings = StreamGraphicSettings(displaySeconds = displaySeconds),
    )

    /** Ruft den Lauf an den Start (`activated_at`), ohne ihn zu starten - das ist "In Vorbereitung". */
    private fun activate(matchId: UUID, at: LocalDateTime) = Jooq.query {
        update(COMPETITION_MATCH)
            .set(COMPETITION_MATCH.ACTIVATED_AT, at)
            .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
            .execute()
    }

    /**
     * Ein Altbestand mit unsinniger Zeilenzahl (vor der Eingabeprüfung geschrieben) darf den
     * Szenenaufbau nicht reißen - das Tagesprogramm bleibt dann schlicht leer, die übrigen
     * Grafiken der Szene kommen weiter durch.
     */
    @Test
    fun aNegativeScheduleLengthYieldsAnEmptyScheduleInsteadOfADefect() = testComprehension {
        val fixture = !MyEventFixture.create()
        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest())).dto.id
        // Am Dienst vorbei, wie eine Zeile aus der Zeit vor der Prüfung.
        !StreamSceneRepo.upsertGraphic(
            StreamSceneGraphicRecord(
                id = UUID.randomUUID(),
                scene = sceneId,
                type = StreamGraphicType.SCHEDULE.name,
                enabled = true,
                placement = StreamPlacement.FULL_CENTER.name,
                size = StreamGraphicSize.NORMAL.name,
                settings = StreamGraphicSettings(listLength = -1).toJsonb(),
            )
        ).orDie()

        val view = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        val schedule = view.graphics.first { it.type == StreamGraphicType.SCHEDULE }
        assertEquals(emptyList(), schedule.schedule)
    }

    @Test
    fun aPreparingMatchMakesTheStartlistVisible() = testComprehension {
        val fixture = !MyEventFixture.create()
        // Frisch aktiviert: die Startliste bleibt laut Voreinstellung 15 Sekunden stehen, der
        // Test läuft also innerhalb ihres Fensters.
        !activate(fixture.ownMatchId, LocalDateTime.now())

        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest())).dto.id
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(
                graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
                graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
            ),
        )

        val view = !StreamSceneLogic.buildView(fixture.eventId, sceneId)

        assertEquals(sceneId, view.sceneId)
        assertEquals(StreamBackground.TRANSPARENT, view.background)
        assertEquals(5, view.safeAreaPercent)
        assertFalse(view.trialMode)

        val startlist = view.graphics.single { it.type == StreamGraphicType.STARTLIST }
        assertTrue(startlist.visible, "Die Startliste muss bei einem Lauf in Vorbereitung sichtbar sein")
        assertEquals(fixture.ownMatchId, startlist.match?.matchId)
        assertNotNull(startlist.visibleSince)
        assertNotNull(startlist.visibleUntil)

        // Ohne laufende Startsequenz und ohne gestarteten Lauf hat die Uhr nichts zu zeigen.
        val clock = view.graphics.single { it.type == StreamGraphicType.CLOCK }
        assertFalse(clock.visible)
    }

    /**
     * Der ganze Weg der Pause bis in den Szenenstand, gegen echte Sequenz-Daten: eine über den
     * Service angehaltene Startsequenz muss der CLOCK-Grafik ihren Pausenbeginn mitgeben (daran
     * friert die Bühne den Countdown ein) und dabei sichtbar bleiben - die Pause ist eine
     * Unterbrechung, kein Ende.
     */
    @Test
    fun aPausedSequenceCarriesItsPauseStartIntoTheClock() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val team = !createTestMatchTeam(eventId)

        val created = !TimingSequenceService.createSequence(
            // Langer Vorlauf, damit im Testfenster garantiert nichts feuert.
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, listOf(team), 60000L),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)

        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id
        !StreamSceneService.updateGraphics(
            eventId,
            sceneId,
            listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT)),
        )

        // Vor der Pause: Countdown ohne Pausenbeginn.
        val runningView = !StreamSceneLogic.buildView(eventId, sceneId)
        val runningClock = runningView.graphics.single { it.type == StreamGraphicType.CLOCK }
        assertTrue(runningClock.visible, "Die Uhr muss während der laufenden Sequenz sichtbar sein")
        assertNotNull(runningClock.sequenceFiresAt)
        assertEquals(null, runningClock.sequencePausedAt)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        val pausedView = !StreamSceneLogic.buildView(eventId, sceneId)
        val pausedClock = pausedView.graphics.single { it.type == StreamGraphicType.CLOCK }
        assertTrue(pausedClock.visible, "Die Uhr muss auch pausiert sichtbar bleiben")
        assertNotNull(pausedClock.sequenceStartedAt)
        assertNotNull(pausedClock.sequenceFiresAt)
        assertNotNull(pausedClock.sequencePausedAt, "Die Pause muss als Pausenbeginn an der Uhr ankommen")

        // Fortgesetzt verschwindet der Pausenbeginn wieder - und der Feuerzeitpunkt ist um die
        // Pausendauer nach hinten gerückt (>=, der Testlauf selbst braucht Millisekunden).
        !TimingSequenceService.resumeSequence(sequenceId, userId, eventId)
        val resumedView = !StreamSceneLogic.buildView(eventId, sceneId)
        val resumedClock = resumedView.graphics.single { it.type == StreamGraphicType.CLOCK }
        assertEquals(null, resumedClock.sequencePausedAt)
        assertTrue(
            !resumedClock.sequenceFiresAt!!.isBefore(pausedClock.sequenceFiresAt!!),
            "Das Fortsetzen darf den Feuerzeitpunkt nie nach vorne ziehen",
        )
    }

    /**
     * Der Countdown der Stream-Uhr zählt auf den ERSTEN NOCH ANSTEHENDEN Start - nicht stur auf
     * den Slot der Position 0: Wird das erste Boot übersprungen, fällt der echte erste Start
     * einen Startabstand später, und genau dorthin muss die Uhr zählen (sonst stünde sie auf
     * 0:00, während noch niemand gestartet ist).
     */
    @Test
    fun theClockCountsDownToTheFirstPendingStart() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val teams = !createTestMatchTeams(eventId, 2)

        val created = !TimingSequenceService.createSequence(
            // Langer Vorlauf: nichts feuert im Testfenster, und der Skip trifft einen Slot weit
            // vor seiner Zeit - die Kette bleibt also unverschoben und der Erwartungswert exakt.
            CreateSequenceRequest(stationId, SequenceMode.INTERVAL, 60000, teams, 60000L),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id
        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val firstEntry = (!TimingSequenceEntryRepo.getBySequence(sequenceId).orDie())
            .minByOrNull { it.position ?: Int.MAX_VALUE }!!
        !TimingSequenceService.skipEntry(firstEntry.id, userId, eventId)

        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id
        !StreamSceneService.updateGraphics(
            eventId,
            sceneId,
            listOf(graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT)),
        )

        val view = !StreamSceneLogic.buildView(eventId, sceneId)
        val clock = view.graphics.single { it.type == StreamGraphicType.CLOCK }

        val record = (!TimingSequenceRepo.get(sequenceId).orDie())!!
        val expectedFiresAt = TimingMatchStampLogic.stampFor(plannedStartMillis(record, 1)!!)
        assertEquals(
            expectedFiresAt,
            clock.sequenceFiresAt,
            "Die Uhr muss auf den Slot des ersten ANSTEHENDEN Eintrags zählen (Position 1, nicht 0)",
        )
    }

    @Test
    fun trialModeReplacesTheRealDataWithSyntheticBoats() = testComprehension {
        val fixture = !MyEventFixture.create()
        !activate(fixture.ownMatchId, LocalDateTime.now())

        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest("Probe"))).dto.id
        // Einschalten setzt den Phasenbeginn auf jetzt: In der Vorgabephase (Vorbereitung)
        // ist die Startliste damit sicher sichtbar, egal wann der Test läuft.
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(
                graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER, displaySeconds = 30),
                graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
                graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_LEFT),
                graphic(StreamGraphicType.RESULT, StreamPlacement.FULL_CENTER, displaySeconds = 30),
                graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT),
            ),
        )
        !StreamSceneService.setTrialMode(fixture.eventId, sceneId, true)

        val view = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        assertTrue(view.trialMode, "Der Szenenstand muss den Probemodus ausweisen")

        val visible = view.graphics.filter { it.visible }
        assertTrue(visible.isNotEmpty(), "In der Vorbereitung ist die Startliste des Demo-Laufs zu sehen")

        val clubs = visible.flatMap { graphic ->
            graphic.match?.teams.orEmpty().mapNotNull { it.clubsShort } +
                graphic.result?.teams.orEmpty().mapNotNull { it.clubsShort } +
                graphic.finishEntries.orEmpty().mapNotNull { it.clubsShort }
        }
        assertTrue(clubs.isNotEmpty(), "Die sichtbaren Grafiken tragen die Demo-Boote")
        assertTrue(
            clubs.all { it.endsWith("Demo") || it.endsWith("Probe") || it.endsWith("Muster") || it.endsWith("Fiktiv") },
            "Im Probemodus dürfen nur die erfundenen Vereine erscheinen, gefunden: $clubs",
        )

        // Und kein echter Lauf der Veranstaltung darf durchschlagen.
        val matchIds = visible.mapNotNull { it.match?.matchId } + visible.mapNotNull { it.result?.matchId }
        assertFalse(matchIds.contains(fixture.ownMatchId), "Der Probemodus fasst die echten Daten nicht an")
    }

    /**
     * Die Regie schaltet den Demo-Lauf von Hand durch seine Phasen: Ein Phasenwechsel muss den
     * Szenenstand sofort umstellen und die gewählte Phase ausweisen - ohne dass ein Ereignis der
     * echten Zeitnahme nötig wäre.
     */
    @Test
    fun trialPhaseStepsTheDemoRaceByHand() = testComprehension {
        val fixture = !MyEventFixture.create()
        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest("Probe"))).dto.id
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(
                graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
                graphic(StreamGraphicType.RESULT, StreamPlacement.FULL_CENTER),
            ),
        )
        !StreamSceneService.setTrialMode(fixture.eventId, sceneId, true)

        val preparing = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        assertEquals(StreamTrialPhase.PREPARING, preparing.trialPhase, "Vorgabe ist die Vorbereitung")
        assertTrue(preparing.graphics.first { it.type == StreamGraphicType.STARTLIST }.visible)
        assertFalse(preparing.graphics.first { it.type == StreamGraphicType.RESULT }.visible)

        !StreamSceneService.setTrialPhase(fixture.eventId, sceneId, StreamTrialPhase.RESULT)

        val result = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        assertEquals(StreamTrialPhase.RESULT, result.trialPhase)
        assertTrue(result.graphics.first { it.type == StreamGraphicType.RESULT }.visible, "Das Ergebnisfenster läuft ab dem Klick")
        assertFalse(result.graphics.first { it.type == StreamGraphicType.STARTLIST }.visible)

        // Ausgeschaltet trägt der Stand keine Phase mehr - die Bühne zeigt wieder echte Daten.
        !StreamSceneService.setTrialMode(fixture.eventId, sceneId, false)
        assertNull((!StreamSceneLogic.buildView(fixture.eventId, sceneId)).trialPhase)
    }

    /**
     * Stehen zwei Läufe gleichzeitig in Vorbereitung, gewinnt der ZULETZT AKTIVIERTE - nicht der
     * im Zeitplan spätere. Genau der Fall der Kette, die einen Folgelauf aktiviert, während eine
     * Startgruppe noch am Steg steht.
     */
    @Test
    fun theMostRecentlyActivatedHeatWinsTheStartlist() = testComprehension {
        val fixture = !MyEventFixture.create()
        val now = LocalDateTime.now()
        // ownMatch ist im Zeitplan der frühere (executionOrder 1), foreignMatch der spätere -
        // aktiviert wird aber ownMatch zuletzt.
        !activate(fixture.foreignMatchId, now.minusSeconds(5))
        !activate(fixture.ownMatchId, now)

        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest())).dto.id
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER)),
        )

        val view = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        val startlist = view.graphics.single { it.type == StreamGraphicType.STARTLIST }

        assertTrue(startlist.visible)
        assertEquals(
            fixture.ownMatchId,
            startlist.match?.matchId,
            "Die Startliste muss den zuletzt an den Start gerufenen Lauf zeigen",
        )
    }

    /** Der Umschlag des Szenen-Kanals - Muster BoardViewBroadcaster.message. */
    @Test
    fun theChannelMessageCarriesTheResolvedView() = testComprehension {
        val fixture = !MyEventFixture.create()
        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest())).dto.id
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(graphic(StreamGraphicType.SCHEDULE, StreamPlacement.FULL_CENTER)),
        )

        val message = StreamSceneBroadcaster.message(!StreamSceneLogic.buildView(fixture.eventId, sceneId))
        assertContains(message, "\"type\":\"streamSceneView\"")
        assertContains(message, sceneId.toString())
    }
}
