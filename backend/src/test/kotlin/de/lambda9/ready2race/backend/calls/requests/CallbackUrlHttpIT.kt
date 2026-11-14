package de.lambda9.ready2race.backend.calls.requests

import de.lambda9.ready2race.backend.database.generated.tables.references.EMAIL
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Die Prüfung der `callbackUrl` hängt an der Route. Geprüft über die öffentliche, captcha-freie
 * Bestätigung einer Registrierung, die dieselbe Prüfung durchläuft wie Passwort-Reset und
 * Einladung. Gezielt starten:
 *
 * ```
 * ./mvnw test -Dtest=CallbackUrlHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class CallbackUrlHttpIT {

    @Test
    fun foreignCallbackHostIsRejectedBeforeAnythingHappens() = testApplicationComprehension {
        val response = client.post("/api/user/registration/verify") {
            contentType(ContentType.Application.Json)
            setBody("""{"token":"unbekannt","callbackUrl":"https://evil.example/r?t="}""")
        }
        assertEquals(HttpStatusCode.UnprocessableEntity, response.status, response.bodyAsText())
        // Eigener Code, damit das Frontend erklären kann, dass die aufgerufene Adresse nicht
        // freigegeben ist (statt „unerwarteter Fehler").
        assertTrue(response.bodyAsText().contains("\"CALLBACK_URL_NOT_ALLOWED\""), response.bodyAsText())
        assertEquals(0, !Jooq.query { fetchCount(EMAIL) })
    }

    @Test
    fun ownHostPassesTheCheck() = testApplicationComprehension {
        // Der Testclient spricht "localhost" an - derselbe Host in der callbackUrl ist erlaubt;
        // danach scheitert die Anfrage fachlich am unbekannten Token, nicht an der Adresse.
        val response = client.post("/api/user/registration/verify") {
            contentType(ContentType.Application.Json)
            setBody("""{"token":"unbekannt","callbackUrl":"http://localhost:5123/challenge/"}""")
        }
        assertNotEquals(HttpStatusCode.UnprocessableEntity, response.status, response.bodyAsText())
    }
}
