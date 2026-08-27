package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.eventInfo.MyEventFixture
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneBroadcaster
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneLogic
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
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
    ) = StreamSceneGraphicDto(
        type = type,
        enabled = enabled,
        placement = placement,
        size = StreamGraphicSize.NORMAL,
        settings = StreamGraphicSettings(),
    )

    /** Ruft den Lauf an den Start (`activated_at`), ohne ihn zu starten - das ist "In Vorbereitung". */
    private fun activate(matchId: UUID, at: LocalDateTime) = Jooq.query {
        update(COMPETITION_MATCH)
            .set(COMPETITION_MATCH.ACTIVATED_AT, at)
            .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
            .execute()
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

    @Test
    fun trialModeReplacesTheRealDataWithSyntheticBoats() = testComprehension {
        val fixture = !MyEventFixture.create()
        !activate(fixture.ownMatchId, LocalDateTime.now())

        val sceneId = (!StreamSceneService.createScene(fixture.eventId, sceneRequest("Probe"))).dto.id
        // Alle Grafiken, die in irgendeiner Phase der Demo-Schleife Inhalt tragen - so ist
        // unabhängig vom Zeitpunkt des Testlaufs immer mindestens eine sichtbar.
        !StreamSceneService.updateGraphics(
            fixture.eventId,
            sceneId,
            listOf(
                graphic(StreamGraphicType.STARTLIST, StreamPlacement.BOTTOM_CENTER),
                graphic(StreamGraphicType.CLOCK, StreamPlacement.TOP_RIGHT),
                graphic(StreamGraphicType.LAPS, StreamPlacement.BOTTOM_LEFT),
                graphic(StreamGraphicType.RESULT, StreamPlacement.FULL_CENTER),
                graphic(StreamGraphicType.FINISH_TICKER, StreamPlacement.SIDE_RIGHT),
            ),
        )
        !StreamSceneService.setTrialMode(fixture.eventId, sceneId, true)

        val view = !StreamSceneLogic.buildView(fixture.eventId, sceneId)
        assertTrue(view.trialMode, "Der Szenenstand muss den Probemodus ausweisen")

        val visible = view.graphics.filter { it.visible }
        assertTrue(visible.isNotEmpty(), "In jeder Phase der Demo-Schleife ist etwas zu sehen")

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
