package de.lambda9.ready2race.backend.calls.requests

import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.testing.loginWith
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Unbrauchbare Eingaben an öffentlichen oder allgemein erreichbaren Routen sind Client-Fehler,
 * keine 500er. Gezielt starten: `./mvnw test -Dtest=InvalidInputHttpIT -DfailIfNoSpecifiedTests=false`
 */
class InvalidInputHttpIT {

    @Test
    fun unknownGenderIsABadRequest() = testApplicationComprehension {
        val eventId = seedEvent(published = true)
        val response = client.get("/api/event/$eventId/competition/registration?birthYear=1990&gender=X")
        assertEquals(HttpStatusCode.BadRequest, response.status, response.bodyAsText())
    }

    @Test
    fun registrationTemplateWithoutClubIsNoServerError() = testApplicationComprehension {
        val eventId = seedEvent(published = true)
        val session = loginWith(emptyList())
        val response = client.get("/api/event/$eventId/registrationTemplate") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.Forbidden, response.status, response.bodyAsText())
    }
}
