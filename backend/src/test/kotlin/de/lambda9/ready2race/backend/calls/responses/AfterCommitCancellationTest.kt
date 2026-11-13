package de.lambda9.ready2race.backend.calls.responses

import de.lambda9.ready2race.backend.app.Env
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.config.Config
import de.lambda9.ready2race.backend.plugins.configureKIO
import de.lambda9.ready2race.backend.plugins.configureSerialization
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import org.jooq.tools.jdbc.MockConnection
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Bricht der Client ab, während die Transaktion einer Anfrage noch läuft, läuft der blockierende
 * Block trotzdem zu Ende und committet. Die gepufferten Nachwirkungen (Änderungsmarker, Pushes an
 * Boards und Stream) müssen dann trotzdem feuern - sonst zeigen die Anzeigen bis zum nächsten
 * Ereignis den alten Stand.
 */
class AfterCommitCancellationTest {

    private val env: JEnv = Jooq(
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
    fun `Nachwirkungen laufen auch nach Abbruch der Anfrage waehrend der Transaktion`() = testApplication {
        val inTransaction = CountDownLatch(1)
        val release = CountDownLatch(1)
        val flushed = AtomicInteger(0)
        val respondedFromKio = AtomicInteger(0)

        application {
            configureKIO(env)
            configureSerialization()
            routing {
                get("/mutation") {
                    val app = KIO.effect {
                        AfterCommit.register { flushed.incrementAndGet() }
                        inTransaction.countDown()
                        // Die Transaktion blockiert, während der Client abbricht.
                        release.await(5, TimeUnit.SECONDS)
                        ApiResponse.NoData
                    }.mapError { error("unerwartet") }

                    coroutineScope {
                        // Der Abbruch der Anfrage-Coroutine, wie ihn Netty bei einem
                        // Verbindungsabbruch auslöst.
                        val request = launch {
                            call.respondKIO(app)
                            respondedFromKio.incrementAndGet()
                        }
                        inTransaction.await(5, TimeUnit.SECONDS)
                        request.cancel()
                        release.countDown()
                        request.join()
                    }
                    call.respondText("abgebrochen")
                }
            }
        }

        val body = client.get("/mutation").bodyAsText()

        assertEquals("abgebrochen", body)
        assertEquals(0, respondedFromKio.get(), "die abgebrochene Anfrage antwortet nicht mehr")
        assertEquals(1, flushed.get(), "die Nachwirkung der committeten Transaktion ist gelaufen")
    }

    @Test
    fun `ohne Abbruch laufen die Nachwirkungen genau einmal`() = testApplication {
        val flushed = AtomicInteger(0)
        application {
            configureKIO(env)
            configureSerialization()
            routing {
                get("/mutation") {
                    call.respondKIO(
                        KIO.effect {
                            AfterCommit.register { flushed.incrementAndGet() }
                            ApiResponse.NoData
                        }.mapError { error("unerwartet") }
                    )
                }
            }
        }

        val status = client.get("/mutation").status.value

        assertEquals(204, status)
        assertTrue(flushed.get() == 1, "flushed=${flushed.get()}")
    }
}
