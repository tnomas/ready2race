package de.lambda9.ready2race.backend.calls.responses

import de.lambda9.ready2race.backend.app.Env
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.plugins.configureKIO
import de.lambda9.ready2race.backend.plugins.configureSerialization
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.routing.*
import kotlinx.coroutines.runBlocking
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import org.jooq.tools.jdbc.MockConnection
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlin.test.Test
import kotlin.test.assertFalse

/**
 * Die Datenbankarbeit einer Anfrage (jedes `!` der Comprehension, die Transaktion, Argon2 beim
 * Login, PDF-Erzeugung) blockiert ihren Thread. Unter Netty darf das nicht der Event-Loop sein,
 * der zugleich alle anderen Verbindungen bedient. Geprüft mit echtem Netty, weil die
 * Test-Engine von Ktor andere Threads benutzt.
 */
class BlockingWorkThreadTest {

    private val env: JEnv = Jooq(
        // Keine Datenbank nötig: transact() braucht nur eine Verbindung, die commit() versteht.
        dsl = DSL.using(MockConnection { emptyArray() }, SQLDialect.POSTGRES),
        env = Env(
            Config(
                mode = Config.Mode.TEST,
                http = Config.Http(host = "127.0.0.1", port = 0),
                database = Config.Database(url = "jdbc:none", user = "u", password = "p", logQueries = false),
                smtp = null,
                mailReceiverWhitelist = null,
                security = Config.Security(pepper = "pepper"),
                admin = Config.Admin(email = "admin", password = "admin"),
                staticFilesPath = "teststatic",
                webDAV = null,
            )
        ),
    )

    @Test
    fun `Comprehension und Transaktion laufen nicht auf dem Netty-Event-Loop`() {
        val server = embeddedServer(Netty, port = 0, host = "127.0.0.1") {
            configureKIO(env)
            configureSerialization()
            routing {
                get("/thread") {
                    call.respondComprehension {
                        val inBlock = Thread.currentThread().name
                        KIO.effect { Thread.currentThread().name }
                            .map { inTransaction -> ApiResponse.Dto(listOf(inBlock, inTransaction)) }
                            .mapError { error("unerwartet") }
                    }
                }
            }
        }.start(wait = false)
        try {
            val port = runBlocking { server.engine.resolvedConnectors().first().port }
            val body = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI("http://127.0.0.1:$port/thread")).GET().build(),
                HttpResponse.BodyHandlers.ofString(),
            ).body()
            println("Threads der Anfrage: $body")
            assertFalse("eventLoopGroup" in body, body)
            assertFalse("nioEventLoop" in body, body)
        } finally {
            server.stop(0, 0)
        }
    }
}
