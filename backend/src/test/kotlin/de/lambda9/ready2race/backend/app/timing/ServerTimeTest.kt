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

    @Test
    fun serverTimeCarriesTheWallClockOfTheSameInstant() = testApplication {
        application {
            routing {
                route("/api") { timingGlobal() }
            }
        }
        val body = client.post("/api/timing/serverTime").bodyAsText()
        val millis = Regex("\"serverTimeMillis\":(\\d+)").find(body)!!.groupValues[1].toLong()
        val wallClock = Regex("\"serverLocalTime\":\"([^\"]+)\"").find(body)!!.groupValues[1]
        val parsed = java.time.LocalDateTime.parse(wallClock)
        val expected = java.time.LocalDateTime.ofInstant(
            java.time.Instant.ofEpochMilli(millis),
            java.time.ZoneId.systemDefault(),
        )
        assertEquals(expected, parsed)
    }
}
