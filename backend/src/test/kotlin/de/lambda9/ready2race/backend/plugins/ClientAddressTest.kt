package de.lambda9.ready2race.backend.plugins

import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals

class ClientAddressTest {

    @Test
    fun `ohne vertrauenswuerdigen Proxy zaehlt nur die Verbindungsadresse`() {
        assertEquals("10.0.0.2", forwardedClientAddress(listOf("1.2.3.4"), "10.0.0.2", 0))
    }

    @Test
    fun `ein Proxy - der letzte Eintrag ist der Client, davor Geschriebenes zaehlt nicht`() {
        assertEquals("203.0.113.7", forwardedClientAddress(listOf("203.0.113.7"), "10.0.0.2", 1))
        // Der Client hat selbst "1.1.1.1" vorangestellt; nginx hängt die echte Adresse hinten an.
        assertEquals("203.0.113.7", forwardedClientAddress(listOf("1.1.1.1, 203.0.113.7"), "10.0.0.2", 1))
        // Mehrere Kopfzeilen werden wie eine Liste gelesen.
        assertEquals("203.0.113.7", forwardedClientAddress(listOf("1.1.1.1", "203.0.113.7"), "10.0.0.2", 1))
    }

    @Test
    fun `zwei Proxys - der vorletzte Eintrag ist der Client`() {
        assertEquals("203.0.113.7", forwardedClientAddress(listOf("9.9.9.9, 203.0.113.7, 172.16.0.5"), "10.0.0.2", 2))
    }

    @Test
    fun `fehlt der Kopf oder ist er zu kurz, zaehlt die Verbindungsadresse`() {
        assertEquals("10.0.0.2", forwardedClientAddress(null, "10.0.0.2", 1))
        assertEquals("10.0.0.2", forwardedClientAddress(listOf("203.0.113.7"), "10.0.0.2", 2))
    }

    private fun ApplicationTestBuilder.limited(hops: Int) {
        application {
            install(RateLimit) {
                register(RateLimitName("probe")) {
                    rateLimiter(limit = 2, refillPeriod = kotlin.time.Duration.parse("1h"))
                    requestKey { call -> call.clientAddress(hops) }
                }
            }
            routing { rateLimit(RateLimitName("probe")) { get("/p") { call.respondText("ok") } } }
        }
    }

    @Test
    fun `hinter einem Proxy haben zwei Clients getrennte Kontingente`() = testApplication {
        limited(hops = 1)
        repeat(2) { client.get("/p") { header(HttpHeaders.XForwardedFor, "203.0.113.1") } }
        assertEquals(HttpStatusCode.TooManyRequests, client.get("/p") { header(HttpHeaders.XForwardedFor, "203.0.113.1") }.status)
        assertEquals(HttpStatusCode.OK, client.get("/p") { header(HttpHeaders.XForwardedFor, "203.0.113.2") }.status)
    }

    @Test
    fun `ohne Proxy-Vertrauen hilft ein gefaelschter Kopf nicht`() = testApplication {
        limited(hops = 0)
        repeat(2) { client.get("/p") { header(HttpHeaders.XForwardedFor, "203.0.113.1") } }
        assertEquals(HttpStatusCode.TooManyRequests, client.get("/p") { header(HttpHeaders.XForwardedFor, "203.0.113.99") }.status)
    }
}
