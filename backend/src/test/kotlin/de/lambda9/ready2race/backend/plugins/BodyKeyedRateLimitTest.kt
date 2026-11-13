package de.lambda9.ready2race.backend.plugins

import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.testing.TEST_PASSWORD
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.ratelimit.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * DoubleReceive nur noch auf den Routen, deren Rate-Limit-Schlüssel aus dem Body kommt. Dort muss
 * der Handler den Body nach dem Limiter weiter lesen können.
 */
class BodyKeyedRateLimitTest {

    @Test
    fun `Anmeldung ueber beide Login-Routen liest den Body nach dem Limiter`() = testApplicationComprehension {
        val id = UUID.randomUUID()
        val email = "body-$id@example.org"
        val now = LocalDateTime.now()
        !AppUserRepo.create(
            AppUserRecord(
                id = id, email = email, firstname = "Body", lastname = "Key",
                password = !PasswordUtilities.hash(TEST_PASSWORD), language = EmailLanguage.DE.name,
                createdAt = now, createdBy = SYSTEM_USER, updatedAt = now, updatedBy = SYSTEM_USER,
            )
        )
        listOf("/api/login", "/api/app/login").forEach { path ->
            val ok = client.post(path) {
                contentType(ContentType.Application.Json)
                setBody("""{"email":"$email","password":"$TEST_PASSWORD"}""")
            }
            assertEquals(HttpStatusCode.OK, ok.status, path)
            val wrong = client.post(path) {
                contentType(ContentType.Application.Json)
                setBody("""{"email":"$email","password":"falsch-falsch"}""")
            }
            assertEquals(HttpStatusCode.Unauthorized, wrong.status, path)
        }
    }

    @Test
    fun `andere Routen puffern den Body nicht mehr`() = testApplication {
        application {
            configureSerialization()
            configureRequests()
            routing {
                post("/upload") {
                    call.receiveText()
                    val second = runCatching { call.receiveText() }
                    call.respondText(if (second.isFailure) "einmal" else "doppelt")
                }
                route("/limited") {
                    rateLimitWithBodyKey(RateLimitName("login")) {
                        post {
                            call.receiveText()
                            call.respondText(call.receiveText())
                        }
                    }
                }
            }
        }
        val upload = client.post("/upload") { setBody("x".repeat(1024)) }
        assertEquals("einmal", upload.bodyAsText())
        val limited = client.post("/limited") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"a@example.org","password":"p"}""")
        }
        assertEquals(HttpStatusCode.OK, limited.status)
    }
}
