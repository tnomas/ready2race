package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * `limit=-1` auf den öffentlichen Laufliste-Endpunkten lief als `LIMIT -1` in Postgres und kam
 * als 500 zurück. Gezielt starten: `./mvnw test -Dtest=PublicListLimitHttpIT -DfailIfNoSpecifiedTests=false`
 */
class PublicListLimitHttpIT {

    @Test
    fun negativeLimitIsNoServerError() = testApplicationComprehension {
        val eventId = seedEvent(published = true)
        listOf("upcoming-matches", "latest-match-results", "running-matches", "live-matches").forEach { path ->
            val response = client.get("/api/event/$eventId/info/$path?limit=-1")
            assertEquals(HttpStatusCode.OK, response.status, "$path: ${response.bodyAsText()}")
        }
    }
}
