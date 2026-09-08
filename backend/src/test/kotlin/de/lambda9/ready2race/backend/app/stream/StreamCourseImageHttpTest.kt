package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.eventDocument.boundary.EventDocumentService
import de.lambda9.ready2race.backend.app.eventDocument.control.EventDocumentRepo
import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.testing.TestApplicationComprehensionScope
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Das Streckenbild der Szene über die Route. Der bestehende Dokument-Download verlangt eine
 * Sitzung mit READ EVENT - eine reine Token-Bühne (Wirecast, OBS) kam damit nie an ihr Bild.
 * Der eigene Auslieferweg hat dieselbe Tür wie der Szenenstand: Sitzung mit READ STREAM/READ
 * EVENT oder das Token GENAU DIESER Szene im Header.
 */
class StreamCourseImageHttpTest {

    private val pngBytes = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3)

    private fun sceneRequest(name: String) = StreamSceneRequest(name = name, background = StreamBackground.TRANSPARENT)

    private fun TestApplicationComprehensionScope<JEnv>.uploadCourseImage(eventId: UUID, userId: UUID): UUID {
        !EventDocumentService.saveDocuments(eventId, listOf(File("strecke.png", pngBytes)), null, userId)
        return (!EventDocumentRepo.getDownloadsByEvent(eventId).orDie()).single().id!!
    }

    private fun TestApplicationComprehensionScope<JEnv>.sceneWithCourseImage(
        eventId: UUID,
        documentId: UUID?,
    ): UUID {
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Strecke"))).dto.id
        !StreamSceneService.updateGraphics(
            eventId,
            sceneId,
            listOf(
                StreamSceneGraphicDto(
                    type = StreamGraphicType.COURSE_IMAGE,
                    enabled = true,
                    placement = StreamPlacement.FULL_CENTER,
                    size = StreamGraphicSize.NORMAL,
                    settings = StreamGraphicSettings(imageDocument = documentId),
                ),
            ),
        )
        return sceneId
    }

    @Test
    fun theSceneTokenDeliversTheCourseImage() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val documentId = uploadCourseImage(eventId, userId)
        val sceneId = sceneWithCourseImage(eventId, documentId)
        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        val response = client.get("/api/event/$eventId/stream/$sceneId/courseImage") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(
            response.contentType()?.match(ContentType.Image.PNG) == true,
            "Content-Type des Dokuments erwartet, war ${response.contentType()}",
        )
        assertContentEquals(pngBytes, response.readRawBytes())
    }

    /** Die Bühne erfährt die Adresse aus dem Szenenstand - und die muss auf den Token-Weg zeigen. */
    @Test
    fun theSceneViewPointsAtTheTokenReachableAddress() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val documentId = uploadCourseImage(eventId, userId)
        val sceneId = sceneWithCourseImage(eventId, documentId)
        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        val response = client.get("/api/event/$eventId/stream/$sceneId/view") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(
            response.bodyAsText().contains("\"imageUrl\":\"/api/event/$eventId/stream/$sceneId/courseImage\""),
            "imageUrl fehlt oder zeigt woandershin: ${response.bodyAsText()}",
        )
    }

    @Test
    fun aTokenOfAnotherSceneStaysOut() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val documentId = uploadCourseImage(eventId, userId)
        val sceneId = sceneWithCourseImage(eventId, documentId)
        val otherSceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Andere"))).dto.id
        val otherLink = (!StreamSceneService.createShareLink(eventId, otherSceneId, userId)).dto

        val response = client.get("/api/event/$eventId/stream/$sceneId/courseImage") {
            header(TIMING_DEVICE_TOKEN_HEADER, otherLink.token)
        }

        assertEquals(HttpStatusCode.Unauthorized, response.status)
    }

    @Test
    fun withoutTokenAndWithoutSessionTheImageIsClosed() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val documentId = uploadCourseImage(eventId, userId)
        val sceneId = sceneWithCourseImage(eventId, documentId)

        assertEquals(
            HttpStatusCode.Unauthorized,
            client.get("/api/event/$eventId/stream/$sceneId/courseImage").status,
        )
    }

    @Test
    fun aSceneWithoutCourseImageAnswersNotFound() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Ohne Bild"))).dto.id
        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        val response = client.get("/api/event/$eventId/stream/$sceneId/courseImage") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.NotFound, response.status)
    }

    /** Ein Dokument einer fremden Veranstaltung ist über eine eigene Szene nicht erreichbar. */
    @Test
    fun aDocumentOfAnotherEventAnswersNotFound() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val foreignDocumentId = uploadCourseImage(otherEventId, otherUserId)
        val sceneId = sceneWithCourseImage(eventId, foreignDocumentId)
        val link = (!StreamSceneService.createShareLink(eventId, sceneId, userId)).dto

        val response = client.get("/api/event/$eventId/stream/$sceneId/courseImage") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.NotFound, response.status)
    }
}
