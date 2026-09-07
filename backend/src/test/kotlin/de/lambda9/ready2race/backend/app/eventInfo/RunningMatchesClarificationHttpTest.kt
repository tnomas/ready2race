package de.lambda9.ready2race.backend.app.eventInfo

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.ready2race.testing.TestApplicationComprehensionScope
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * `includeClarification` an der öffentlichen Route: die Bestellung der strittigen Läufe gilt
 * nur für eine Sitzung mit Board-Leserecht oder ein Board-Token dieser Veranstaltung. Anonym
 * bleibt der Parameter wirkungslos - sonst bekäme jede Zuschauerin am Ufer über den Parameter,
 * was die Anzeigen bewusst zurückhalten (den Lauf samt Klärungsflag).
 *
 * Über die Route geprüft, weil die Entscheidung im Auth-Zweig der Routendatei fällt.
 */
class RunningMatchesClarificationHttpTest {

    private val mapper = ObjectMapper()

    private data class Prepared(val eventId: UUID, val userId: UUID, val disputed: UUID, val plain: UUID)

    private fun TestApplicationComprehensionScope<JEnv>.prepare(): Prepared {
        val (eventId, userId) = !createTestEventWithAdmin()
        !publishEvent(eventId)
        val now = LocalDateTime.now()

        val disputed = !createTestMatchFixture(eventId, 1)
        !CompetitionMatchRepo.update(disputed.setupMatchId) {
            activatedAt = now
            clarificationSince = now
            clarificationReason = "Bojenberührung wird geprüft"
        }.orDie()

        val plain = !createTestMatchFixture(eventId, 1)
        !CompetitionMatchRepo.update(plain.setupMatchId) {
            activatedAt = now
        }.orDie()

        return Prepared(eventId, userId, disputed.setupMatchId, plain.setupMatchId)
    }

    @Test
    fun anonymouslyTheParameterIsIgnored() = testApplicationComprehension {
        val p = prepare()

        val response = client.get("/api/event/${p.eventId}/info/running-matches?limit=10&includeClarification=true")

        assertEquals(HttpStatusCode.OK, response.status)
        val matches = mapper.readTree(response.bodyAsText())
        assertEquals(listOf(p.plain.toString()), matches.map { it["matchId"].asText() })
        assertTrue(matches.all { it.hasNoFlag() }, "ohne Recht kein Flag: $matches")
    }

    @Test
    fun aSessionWithBoardReadRightGetsTheDisputedMatchFlagged() = testApplicationComprehension {
        val p = prepare()
        val sessionHeader = loginAsAdmin()

        val response = client.get("/api/event/${p.eventId}/info/running-matches?limit=10&includeClarification=true") {
            header(SESSION_HEADER, sessionHeader)
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertBothFlagged(mapper.readTree(response.bodyAsText()), p)
    }

    @Test
    fun aBoardTokenOfTheEventGetsTheDisputedMatchFlagged() = testApplicationComprehension {
        val p = prepare()
        val boardId = (!BoardService.createBoard(p.eventId, boardRequest())).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(p.eventId, boardId, p.userId)).dto

        val response = client.get("/api/event/${p.eventId}/info/running-matches?limit=10&includeClarification=true") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        assertEquals(HttpStatusCode.OK, response.status)
        assertBothFlagged(mapper.readTree(response.bodyAsText()), p)
    }

    @Test
    fun aBoardTokenOfAnotherEventCountsAsAnonymous() = testApplicationComprehension {
        val p = prepare()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val otherBoardId = (!BoardService.createBoard(otherEventId, boardRequest())).dto.id
        val link = (!TimingDeviceTokenService.shareLinkForBoard(otherEventId, otherBoardId, otherUserId)).dto

        val response = client.get("/api/event/${p.eventId}/info/running-matches?limit=10&includeClarification=true") {
            header(TIMING_DEVICE_TOKEN_HEADER, link.token)
        }

        // Kein 401 - der Endpunkt bleibt öffentlich; das fremde Token zählt nur nichts.
        assertEquals(HttpStatusCode.OK, response.status)
        val matches = mapper.readTree(response.bodyAsText())
        assertEquals(listOf(p.plain.toString()), matches.map { it["matchId"].asText() })
        assertTrue(matches.all { it.hasNoFlag() }, "fremdes Token, kein Flag: $matches")
    }

    // Null-Felder lässt die Antwort ganz weg - "kein Flag" heißt fehlend oder null.
    private fun JsonNode.hasNoFlag(): Boolean = get("clarification").let { it == null || it.isNull }

    private fun assertBothFlagged(matches: JsonNode, p: Prepared) {
        assertEquals(
            setOf(p.disputed.toString(), p.plain.toString()),
            matches.map { it["matchId"].asText() }.toSet(),
        )
        assertEquals(true, matches.first { it["matchId"].asText() == p.disputed.toString() }["clarification"].asBoolean())
        assertEquals(false, matches.first { it["matchId"].asText() == p.plain.toString() }["clarification"].asBoolean())
    }

    private fun boardRequest() = BoardRequest(
        name = "Anzeige Steg",
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )

    private suspend fun TestApplicationComprehensionScope<JEnv>.loginAsAdmin(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status)
        return login.headers[SESSION_HEADER] ?: error("login did not return a $SESSION_HEADER header")
    }

    companion object {
        private const val SESSION_HEADER = "X-Api-Session"
    }
}
