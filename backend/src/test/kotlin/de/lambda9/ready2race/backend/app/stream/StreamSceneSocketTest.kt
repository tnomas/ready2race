package de.lambda9.ready2race.backend.app.stream

import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneBroadcaster
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
import io.ktor.server.testing.ClientProvider
import io.ktor.websocket.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
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

    /**
     * Der Herzschlag: eine Szene ohne jede Änderung (kein Start, keine Zwischenzeit, kein
     * Regie-Eingriff) muss trotzdem in festem Takt ein Lebenszeichen schicken - sonst hält eine
     * ruhige, aber gesunde Szene die Veraltet-Erkennung von Bühne und Panel für gestört (siehe
     * KDoc an `StreamSceneBroadcaster.heartbeatLoop`). Der Takt wird für die Dauer dieses Tests
     * auf 600 ms gesenkt, echte 20 Sekunden Wartezeit wären hier nur verschenkte Testlaufzeit.
     *
     * Ein neu entstehender Kanal baut sich absichtlich EIN zweites Mal auf, sobald der erste
     * Abonnent kommt (`subscribe()`: "Ein Aufbau SOFORT beim Entstehen des Kanals") - derselbe
     * Stand, kein echtes Ereignis, nur wegen des Timer-Weckers. Der Test toleriert diese eine
     * zusätzliche `streamSceneView`-Nachricht VOR dem Herzschlag, statt sie als Fehlschlag zu
     * werten - alles danach darf nur noch der Herzschlag sein.
     */
    @Test
    fun theHeartbeatArrivesWithoutAnyStateChange() = testApplicationComprehension {
        val previousInterval = StreamSceneBroadcaster.HEARTBEAT_INTERVAL_MILLIS
        StreamSceneBroadcaster.HEARTBEAT_INTERVAL_MILLIS = 600L
        try {
            val (eventId, userId) = !createTestEventWithAdmin()
            val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
            val link = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

            val wsClient = createClient { install(WebSockets) }
            val session = wsClient.sceneSocketSession(eventId, sceneId, link.token)
            try {
                // Begrüßungsrahmen: der volle Stand, kein Herzschlag.
                val greeting = session.receiveText()
                assertTrue(greeting.contains("\"type\":\"streamSceneView\""), "unexpected payload: $greeting")

                // Bis zu einer weiteren (erwarteten) Zustandsnachricht überlesen, dann muss der
                // Herzschlag kommen - exakt die Nutzlast, die heartbeatMessage() selbst baut.
                var next = session.receiveText()
                if (next.contains("\"type\":\"streamSceneView\"")) {
                    next = session.receiveText()
                }
                assertEquals(StreamSceneBroadcaster.heartbeatMessage(), next)
            } finally {
                session.close()
            }
        } finally {
            StreamSceneBroadcaster.HEARTBEAT_INTERVAL_MILLIS = previousInterval
        }
    }

    /**
     * Lebensdauer-Disziplin: mit dem letzten Abonnenten verschwindet der GANZE Kanal, Render-
     * UND Herzschlag-Coroutine eingeschlossen (`unsubscribe` bricht beide im selben Zweig ab -
     * siehe dort). Spiegelt `BoardViewSocketTest.twoDisplaysShareOneChannelAndBothGetThePush`.
     */
    @Test
    fun theChannelAndItsHeartbeatVanishWithTheLastSubscriber() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.sceneSocketSession(eventId, sceneId, link.token)
        session.receiveText()
        // Der Handler abonniert, BEVOR er den Stand schickt (Sockets.kt): Mit dem ersten Text steht
        // das Abonnement schon - eine Änderung direkt nach dem Handshake geht nicht verloren.
        assertEquals(1, StreamSceneBroadcaster.subscriptionCount(sceneId))
        session.close()

        // Das Schließen läuft nebenläufig (unsubscribe hängt am finally des Socket-Handlers),
        // deshalb kurz nachfassen statt sofort zu prüfen.
        var remaining: Int? = StreamSceneBroadcaster.subscriptionCount(sceneId)
        repeat(50) {
            if (remaining == null) return@repeat
            delay(100)
            remaining = StreamSceneBroadcaster.subscriptionCount(sceneId)
        }
        assertNull(remaining, "the scene channel (and its heartbeat) must vanish with its last subscriber")
    }

    /**
     * Der Widerruf wirkt sofort: Die Autorisierung fällt beim Handshake, danach hielte die
     * Verbindung von selbst - eine Bühne mit einem soeben widerrufenen Token bliebe on air, bis
     * sie irgendwann von sich aus neu verbindet. Stattdessen schließt der Server den Kanal mit
     * VIOLATED_POLICY, genau wie er den Handshake mit diesem Token ablehnen würde.
     */
    @Test
    fun revokingTheTokenClosesTheOpenChannel() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, sceneId, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.sceneSocketSession(eventId, sceneId, link.token)
        session.receiveText()

        !TimingDeviceTokenService.revoke(eventId, link.deviceTokenId)

        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }
        assertNotNull(closeReason, "the channel must be closed by the server after the revocation")
        assertEquals(CloseReason.Codes.VIOLATED_POLICY.code, closeReason.code)
    }

    /** Der Widerruf trifft nur die Verbindungen SEINES Tokens - die Nachbarszene bleibt on air. */
    @Test
    fun revokingOneTokenLeavesOtherChannelsOpen() = testApplicationComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val revokedScene = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val otherScene = (!StreamSceneService.createScene(eventId, sceneRequest("Tagesprogramm"))).dto.id
        val revokedLink = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, revokedScene, userId)).dto
        val otherLink = (!TimingDeviceTokenService.shareLinkForStreamScene(eventId, otherScene, userId)).dto

        val wsClient = createClient { install(WebSockets) }
        val revokedSession = wsClient.sceneSocketSession(eventId, revokedScene, revokedLink.token)
        val otherSession = wsClient.sceneSocketSession(eventId, otherScene, otherLink.token)
        revokedSession.receiveText()
        otherSession.receiveText()
        try {
            !TimingDeviceTokenService.revoke(eventId, revokedLink.deviceTokenId)

            withTimeout(awaitTimeout) { revokedSession.closeReason.await() }
            // Die andere Verbindung lebt: ein Regie-Eingriff an ihrer Szene kommt weiter an.
            !StreamSceneService.setTrialMode(eventId, otherScene, true)
            val pushed = otherSession.receiveText()
            assertTrue(pushed.contains("\"trialMode\":true"), "the untouched channel must still push: $pushed")
            assertFalse(otherSession.closeReason.isCompleted, "the untouched channel must stay open")
        } finally {
            otherSession.close()
        }
    }

    /**
     * Auch der Sitzungsweg prüft die Zugehörigkeit: eine Szene unter einer FREMDEN Veranstaltung
     * im Pfad bekommt keinen Kanal. Spiegelt `requireOwnedScene` am HTTP-Zwilling.
     */
    @Test
    fun aSessionMayNotOpenASceneUnderAnotherEvent() = testApplicationComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val sceneId = (!StreamSceneService.createScene(eventId, sceneRequest("Rennen"))).dto.id
        val sessionHeader = loginAsAdmin()

        val wsClient = createClient { install(WebSockets) }
        val session = wsClient.webSocketSession("/api/ws/event/$otherEventId/stream/$sceneId") {
            header(SESSION_HEADER, sessionHeader)
        }
        val closeReason = withTimeout(awaitTimeout) { session.closeReason.await() }

        assertNotNull(closeReason)
        assertEquals(CloseReason.Codes.CANNOT_ACCEPT.code, closeReason.code)
    }

    private suspend fun ClientProvider.loginAsAdmin(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
        return login.headers[SESSION_HEADER] ?: error("login did not return a $SESSION_HEADER header")
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

    companion object {
        private const val SESSION_HEADER = "X-Api-Session"
    }
}
