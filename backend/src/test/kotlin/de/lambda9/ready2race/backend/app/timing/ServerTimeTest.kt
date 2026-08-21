package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.timingGlobal
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ServerTimeTest {

    @Test
    fun serverTimeReturnsMillis() = testApplication {
        application {
            routing {
                route("/api") { timingGlobal() }
            }
        }
        val before = System.currentTimeMillis()
        val response = client.post("/api/timing/serverTime")
        val after = System.currentTimeMillis()
        assertEquals(HttpStatusCode.OK, response.status)
        val body = response.bodyAsText()
        val millis = Regex("\\d{13}").find(body)!!.value.toLong()
        assertTrue(millis in before..after)
    }
}
