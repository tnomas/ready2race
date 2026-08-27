package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.control.StreamOverrideRepo
import de.lambda9.ready2race.backend.app.stream.control.StreamSceneRepo
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamError
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.Duration
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Repos + Service der Szenen-Verwaltung (Task 5): Szenen-CRUD, Grafik-Konfiguration samt
 * Platzierungsprüfung, Regie-Eingriffe und Probemodus. Rechte kommen erst mit den Routen (Task
 * 6) - hier zählt nur, dass der Fachweg die im Task-Brief zugesagten Regeln einhält.
 */
class StreamSceneServiceTest {

    private fun sceneRequest(name: String = "Rennen") = StreamSceneRequest(
        name = name,
        background = StreamBackground.TRANSPARENT,
        safeAreaPercent = 5,
    )

    @Test
    fun createGetUpdateAndDeleteAScene() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        val created = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto
        assertEquals("Rennen", created.name)
        assertEquals(StreamBackground.TRANSPARENT, created.background)
        assertEquals(5, created.safeAreaPercent)
        assertTrue(created.graphics.isEmpty())
        assertEquals(false, created.trialMode)

        val listed = (!StreamSceneService.getScenes(eventId)).data
        assertEquals(listOf(created.id), listed.map { it.id })

        val updateRequest = StreamSceneRequest(
            name = "Tagesprogramm",
            background = StreamBackground.CHROMA,
            chromaColor = "#00FF00",
            safeAreaPercent = 8,
        )
        val updated = (!StreamSceneService.updateScene(eventId, created.id, updateRequest)).dto
        assertEquals("Tagesprogramm", updated.name)
        assertEquals(StreamBackground.CHROMA, updated.background)
        assertEquals("#00FF00", updated.chromaColor)
        assertEquals(8, updated.safeAreaPercent)

        !StreamSceneService.deleteScene(eventId, created.id)

        assertTrue((!StreamSceneService.getScenes(eventId)).data.isEmpty())
    }

    @Test
    fun updateAndDeleteFailForAnUnknownScene() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val unknownId = UUID.randomUUID()

        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.updateScene(eventId, unknownId, sceneRequest())
        }
        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.deleteScene(eventId, unknownId)
        }
        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.setTrialMode(eventId, unknownId, true)
        }
    }

    @Test
    fun sceneActionsFailForASceneBelongingToAnotherEvent() = testComprehension {
        val (ownEventId, _) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(otherEventId, sceneRequest())).dto.id

        // Dieselben Regeln wie bei einer unbekannten Szene - eine fremde sceneId antwortet
        // gleich, sonst verriete der Aufruf, dass es die Szene irgendwo gibt (Task-6-Vorgabe).
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.updateScene(ownEventId, sceneId, sceneRequest())
        }
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.deleteScene(ownEventId, sceneId)
        }
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.setTrialMode(ownEventId, sceneId, true)
        }
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.updateGraphics(ownEventId, sceneId, emptyList())
        }
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.setOverride(
                ownEventId,
                sceneId,
                StreamGraphicType.CLOCK,
                StreamOverrideRequest(state = StreamOverrideState.FORCED_ON, match = null, seconds = null),
            )
        }
        assertKIOFails(StreamError.SceneNotFound(sceneId)) {
            StreamSceneService.clearOverride(ownEventId, sceneId, StreamGraphicType.CLOCK)
        }

        // Über die eigene Veranstaltung bleibt die Szene erreichbar - die Sperre trifft nur die
        // Verwechslung, nicht die Szene selbst.
        !StreamSceneService.setTrialMode(otherEventId, sceneId, true)
    }

    @Test
    fun graphicsRoundTripThroughTheJsonbSettingsColumn() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id

        val laps = StreamSceneGraphicDto(
            type = StreamGraphicType.LAPS,
            enabled = true,
            placement = StreamPlacement.BOTTOM_LEFT,
            size = StreamGraphicSize.COMPACT,
            settings = StreamGraphicSettings(displaySeconds = 12),
        )
        val courseImage = StreamSceneGraphicDto(
            type = StreamGraphicType.COURSE_IMAGE,
            enabled = false,
            placement = StreamPlacement.FULL_CENTER,
            size = StreamGraphicSize.NORMAL,
            settings = StreamGraphicSettings(imageDocument = UUID.randomUUID()),
        )

        val updated = (!StreamSceneService.updateGraphics(eventId, sceneId, listOf(laps, courseImage))).dto
        assertEquals(2, updated.graphics.size)

        val storedLaps = updated.graphics.first { it.type == StreamGraphicType.LAPS }
        assertEquals(12, storedLaps.settings.displaySeconds)
        assertEquals(StreamPlacement.BOTTOM_LEFT, storedLaps.placement)
        assertEquals(StreamGraphicSize.COMPACT, storedLaps.size)
        assertTrue(storedLaps.enabled)

        val storedCourseImage = updated.graphics.first { it.type == StreamGraphicType.COURSE_IMAGE }
        assertEquals(courseImage.settings.imageDocument, storedCourseImage.settings.imageDocument)
        assertNull(storedCourseImage.settings.displaySeconds)

        // Erneutes Lesen über getScenes trifft denselben jsonb-Stand, nicht nur die
        // Rückgabe von updateGraphics selbst.
        val reloaded = (!StreamSceneService.getScenes(eventId)).data.single { it.id == sceneId }
        assertEquals(12, reloaded.graphics.first { it.type == StreamGraphicType.LAPS }.settings.displaySeconds)
    }

    @Test
    fun updateGraphicsRejectsADisallowedPlacementForTheWholeBatch() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id

        // CLOCK erlaubt nur TOP_LEFT/TOP_RIGHT (siehe allowedPlacements) - BOTTOM_CENTER ist
        // unzulässig und muss den ganzen Aufruf ablehnen, auch wenn STARTLIST daneben gültig ist.
        val validStartlist = StreamSceneGraphicDto(
            type = StreamGraphicType.STARTLIST,
            enabled = true,
            placement = StreamPlacement.BOTTOM_CENTER,
            size = StreamGraphicSize.NORMAL,
            settings = StreamGraphicSettings(),
        )
        val invalidClock = StreamSceneGraphicDto(
            type = StreamGraphicType.CLOCK,
            enabled = true,
            placement = StreamPlacement.BOTTOM_CENTER,
            size = StreamGraphicSize.NORMAL,
            settings = StreamGraphicSettings(),
        )

        assertKIOFails(StreamError.PlacementNotAllowed(StreamGraphicType.CLOCK, StreamPlacement.BOTTOM_CENTER)) {
            StreamSceneService.updateGraphics(eventId, sceneId, listOf(validStartlist, invalidClock))
        }

        // Nichts von der abgelehnten Anfrage wurde übernommen - auch nicht die gültige Zeile.
        val graphics = !StreamSceneRepo.getGraphics(sceneId).orDie()
        assertTrue(graphics.isEmpty())
    }

    @Test
    fun updateGraphicsFailsForAnUnknownScene() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val unknownId = UUID.randomUUID()
        val startlist = StreamSceneGraphicDto(
            type = StreamGraphicType.STARTLIST,
            enabled = true,
            placement = StreamPlacement.BOTTOM_CENTER,
            size = StreamGraphicSize.NORMAL,
            settings = StreamGraphicSettings(),
        )

        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.updateGraphics(eventId, unknownId, listOf(startlist))
        }
    }

    @Test
    fun setOverrideWithSecondsProducesAnExpiryAndClearRemovesTheRow() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id

        val before = LocalDateTime.now()
        !StreamSceneService.setOverride(
            eventId,
            sceneId,
            StreamGraphicType.RESULT,
            StreamOverrideRequest(state = StreamOverrideState.FORCED_ON, match = null, seconds = 30),
        )

        val row = !StreamOverrideRepo.findOne(sceneId, StreamGraphicType.RESULT).orDie()
        assertNotNull(row)
        assertEquals("FORCED_ON", row.state)
        assertNotNull(row.expiresAt)
        // expiresAt = now + seconds, auf Sekunden genau geprüft, um eine Millisekunden-Flanke
        // im Testlauf nicht zum Fehlschlag zu machen.
        val expectedExpiry = before.plusSeconds(30)
        assertTrue(
            Duration.between(expectedExpiry, row.expiresAt).abs() < Duration.ofSeconds(5),
            "expiresAt ${row.expiresAt} sollte nahe bei $expectedExpiry liegen",
        )

        !StreamSceneService.clearOverride(eventId, sceneId, StreamGraphicType.RESULT)
        assertNull(!StreamOverrideRepo.findOne(sceneId, StreamGraphicType.RESULT).orDie())
    }

    @Test
    fun setOverrideWithoutSecondsNeverExpiresAndAutoStateClears() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id

        !StreamSceneService.setOverride(
            eventId,
            sceneId,
            StreamGraphicType.STARTLIST,
            StreamOverrideRequest(state = StreamOverrideState.FORCED_OFF, match = null, seconds = null),
        )
        val row = !StreamOverrideRepo.findOne(sceneId, StreamGraphicType.STARTLIST).orDie()
        assertNotNull(row)
        assertNull(row.expiresAt)

        // AUTO über setOverride ist gleichbedeutend mit clearOverride: keine Zeile mehr.
        !StreamSceneService.setOverride(
            eventId,
            sceneId,
            StreamGraphicType.STARTLIST,
            StreamOverrideRequest(state = StreamOverrideState.AUTO, match = null, seconds = null),
        )
        assertNull(!StreamOverrideRepo.findOne(sceneId, StreamGraphicType.STARTLIST).orDie())
    }

    @Test
    fun overrideActionsFailForAnUnknownScene() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val unknownId = UUID.randomUUID()

        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.setOverride(
                eventId,
                unknownId,
                StreamGraphicType.CLOCK,
                StreamOverrideRequest(state = StreamOverrideState.FORCED_ON, match = null, seconds = null),
            )
        }
        assertKIOFails(StreamError.SceneNotFound(unknownId)) {
            StreamSceneService.clearOverride(eventId, unknownId, StreamGraphicType.CLOCK)
        }
    }

    @Test
    fun setTrialModeTogglesTheFlag() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest())).dto.id

        !StreamSceneService.setTrialMode(eventId, sceneId, true)
        assertEquals(true, (!StreamSceneRepo.findById(sceneId).orDie())?.trialMode)

        !StreamSceneService.setTrialMode(eventId, sceneId, false)
        assertEquals(false, (!StreamSceneRepo.findById(sceneId).orDie())?.trialMode)
    }
}
