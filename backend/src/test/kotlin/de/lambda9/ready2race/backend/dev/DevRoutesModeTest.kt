package de.lambda9.ready2race.backend.dev

import de.lambda9.ready2race.backend.config.Config
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.routing.*
import io.ktor.server.testing.*
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Mailansicht gibt Passwort-Reset- und Einladungslinks ohne Anmeldung heraus. Auf einem
 * erreichbaren Server (STAGING) wäre das eine Kontoübernahme; sie gibt es deshalb nur in DEV.
 */
class DevRoutesModeTest {

    private fun config(mode: Config.Mode) = Config(
        mode = mode,
        http = Config.Http(host = "localhost", port = -1),
        database = Config.Database(url = "jdbc:postgresql://localhost/none", user = "u", password = "p", logQueries = false),
        smtp = null,
        mailReceiverWhitelist = null,
        security = Config.Security(pepper = "pepper"),
        admin = Config.Admin(email = "admin", password = "admin"),
        staticFilesPath = "teststatic",
        webDAV = null,
    )

    private fun statusOfDevEmails(mode: Config.Mode): HttpStatusCode {
        var status: HttpStatusCode? = null
        testApplication {
            application { routing { devRoutes(config(mode)) } }
            status = client.get("/api/dev/emails").status
        }
        return status!!
    }

    @Test
    fun `STAGING registriert die Mailansicht nicht`() {
        assertEquals(HttpStatusCode.NotFound, statusOfDevEmails(Config.Mode.STAGING))
    }

    @Test
    fun `PROD und TEST registrieren die Mailansicht nicht`() {
        assertEquals(HttpStatusCode.NotFound, statusOfDevEmails(Config.Mode.PROD))
        assertEquals(HttpStatusCode.NotFound, statusOfDevEmails(Config.Mode.TEST))
    }

    @Test
    fun `nur DEV schaltet Entwicklerrouten ein`() {
        assertEquals(listOf(Config.Mode.DEV), Config.Mode.entries.filter { it.devRoutesEnabled })
    }

    @Test
    fun `Stacktraces in Antworten nur in DEV und TEST`() {
        assertEquals(
            setOf(Config.Mode.DEV, Config.Mode.TEST),
            Config.Mode.entries.filter { it.exposesDefectDetails }.toSet(),
        )
    }
}
