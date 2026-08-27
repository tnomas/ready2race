package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService
import de.lambda9.ready2race.backend.app.stream.entity.StreamBackground
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSize
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.plugins.TIMING_WS_SUBPROTOCOL
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.websocket.*
import kotlinx.coroutines.withTimeout
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

/**
 * Routen-Abdeckung für `GET /api/ws/event/{eventId}/stream/{sceneId}` — den Szenen-Kanal, der den
 * aufgelösten Stand pusht (Muster [de.lambda9.ready2race.backend.app.eventInfo.BoardViewSocketTest]).
 *
 * Der wichtigste Fall hier ist der TIMER-WECKER: Eine Einblendung mit Auto-Out läuft ab, ohne dass
 * irgendjemand schreibt. Eine Bühne, die sich mitten in ein solches Fenster verbindet, muss das
 * Ausblenden trotzdem gepusht bekommen - genau daran hing der Kanal, solange die Render-Schleife
 * erst auf einen fremden Auslöser wartete.
 */
class StreamSceneSocketTest {

    // NOTE: nicht `timeout` nennen — DefaultWebSocketSession hat ein gleichnamiges Member.
    private val awaitTimeout = 15.seconds

    private fun sceneRequest(name: String) = StreamSceneRequest(
        name = name,
        background = StreamBackground.TRANSPARENT,
        safeAreaPercent = 0,
    )

    @Test
    fun handshakeWithoutAnyTokenIsRejected() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val wsClient = createClient { install(WebSockets) }

        val session = wsClient.webSocketSession("/api/ws/event/$eventId/stream/$sceneId")
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    @Test
    fun aTokenOfAnotherSceneIsRejected() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val ownScene = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val otherScene = (!StreamSceneService.createScene(eventId, sceneRequest("Tagesprogramm"))).dto.id
        val otherLink = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, otherScene, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.sceneSocketSession(eventId, ownScene, otherLink.token)
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    /**
     * Der Wecker: Die Szene zeigt eine Startliste mit drei Sekunden Einblenddauer, die Bühne
     * verbindet sich mitten im Fenster. Danach passiert NICHTS - kein Schreibzugriff, kein
     * Ereignis. Trotzdem muss das Ausblenden ankommen, allein weil der Resolver den
     * Umschaltpunkt gemeldet hat und die Render-Schleife sich darauf einen Wecker gestellt hat.
     */
    @Test
    fun theAutoOutIsPushedWithoutAnyWrite() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val fixture = !createTestMatchFixture(eventId)
        // Lauf an den Start rufen (activated_at, kein started_at) - das ist „In Vorbereitung".
        !Jooq.query {
            update(COMPETITION_MATCH)
                .set(COMPETITION_MATCH.ACTIVATED_AT, LocalDateTime.now())
                .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(fixture.setupMatchId))
                .execute()
        }

        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        // NUR die Startliste: dann gehört jedes „visible" im Push eindeutig ihr.
        !StreamSceneService.updateGraphics(
            eventId,
            sceneId,
            listOf(
                StreamSceneGraphicDto(
                    type = StreamGraphicType.STARTLIST,
                    enabled = true,
                    placement = StreamPlacement.BOTTOM_CENTER,
                    size = StreamGraphicSize.NORMAL,
                    settings = StreamGraphicSettings(displaySeconds = 3),
                )
            ),
        )
        val link = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.sceneSocketSession(eventId, sceneId, link.token)
        try {
            // Begrüßungsrahmen: die Startliste ist noch an.
            val greeting = session.receiveText()
            assertTrue(greeting.contains("\"type\":\"streamSceneView\""), "unexpected payload: $greeting")
            assertTrue(greeting.contains("\"visible\":true"), "startlist should still be on air: $greeting")

            // Und jetzt: warten. Der einzige, der hier noch etwas schickt, ist der Wecker.
            var faded: String? = null
            while (faded == null) {
                val next = session.receiveText()
                if (next.contains("\"visible\":false")) faded = next
            }
            assertTrue(faded.contains("\"type\":\"streamSceneView\""), "unexpected payload: $faded")
        } finally {
            session.close()
        }
    }

    /** Spiegelt `new WebSocket(url, ["r2r", token])` im Browser. */
    private suspend fun HttpClient.sceneSocketSession(
        eventId: UUID,
        sceneId: UUID,
        token: String,
    ): DefaultClientWebSocketSession =
        webSocketSession("/api/ws/event/$eventId/stream/$sceneId") {
            header(HttpHeaders.SecWebSocketProtocol, "$TIMING_WS_SUBPROTOCOL, $token")
        }

    private suspend fun DefaultClientWebSocketSession.receiveText(): String =
        withTimeout(awaitTimeout) { (incoming.receive() as Frame.Text).readText() }
}
