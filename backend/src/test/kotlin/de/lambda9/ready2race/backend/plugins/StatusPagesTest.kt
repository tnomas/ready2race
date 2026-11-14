package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.calls.responses.isClientAbort
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import io.ktor.util.cio.ChannelWriteException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Ausnahmen, die ein Client verursacht, sind kein 500 und kein ERROR mit Stacktrace.
 */
class StatusPagesTest {

    data class Body(val name: String)

    private fun ApplicationTestBuilder.setup() {
        application {
            configureSerialization()
            configureResponses()
            routing {
                post("/json") { call.receive<Body>() }
                get("/too-large") { throw PayloadTooLargeException(10) }
                get("/media") { throw UnsupportedMediaTypeException(ContentType.Text.Plain) }
                get("/missing") { throw NotFoundException("weg") }
                get("/bad") { throw BadRequestException("kaputt") }
                get("/wrapped") { throw IllegalStateException("eingepackt", PayloadTooLargeException(10)) }
            }
        }
    }

    @Test
    fun `kaputtes JSON ist 400`() = testApplication {
        setup()
        val response = client.post("/json") {
            contentType(ContentType.Application.Json)
            setBody("{ kein json")
        }
        assertEquals(HttpStatusCode.BadRequest, response.status)
        assertTrue("error" !in response.bodyAsText(), "keine Stacktrace-Details")
    }

    @Test
    fun `Client-Ausnahmen bekommen ihren Statuscode`() = testApplication {
        setup()
        assertEquals(HttpStatusCode.PayloadTooLarge, client.get("/too-large").status)
        assertEquals(HttpStatusCode.UnsupportedMediaType, client.get("/media").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/missing").status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/bad").status)
        assertEquals(HttpStatusCode.PayloadTooLarge, client.get("/wrapped").status)
    }

    @Test
    fun `abgebrochene Verbindung gilt als Client-Abbruch`() {
        assertTrue(isClientAbort(ChannelWriteException("weg", RuntimeException())))
        assertTrue(!isClientAbort(IllegalStateException("echter Fehler")))
    }
}
