package de.lambda9.ready2race.backend.health

import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals

class HealthEndpointTest {

    @Test
    fun `Lebenszeichen ohne Anmeldung, solange die Datenbank antwortet`() = testApplicationComprehension {
        val response = client.get("/api/health")
        assertEquals(HttpStatusCode.NoContent, response.status)
    }
}
