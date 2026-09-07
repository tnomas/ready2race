package de.lambda9.ready2race.backend.app.webDAV

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.testing.TestApplicationComprehensionScope
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Der Ordnername aus dem Pfad wird Teil der WebDAV-Adresse. Ein kodierter Schrägstrich oder ein
 * Punktverzeichnis muss an der Tür abgewiesen werden - mit 400, bevor irgendeine Adresse gebaut
 * wird.
 *
 * Läuft als `IT` nicht in der normalen Suite mit; gezielt starten:
 *
 * ```
 * ./mvnw test -Dtest=WebDAVImportOptionsHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class WebDAVImportOptionsHttpIT {

    @Test
    fun einOrdnernameMitPunktverzeichnisWirdAbgewiesen() = testApplicationComprehension {
        val session = login()

        val response = client.get("/api/webDAV/import/options/..%2Ffremd") {
            header("X-Api-Session", session)
        }

        assertEquals(HttpStatusCode.BadRequest, response.status, response.bodyAsText())
        assertContains(response.bodyAsText(), "folder name")
    }

    @Test
    fun einZweiPunkteOrdnerWirdAbgewiesen() = testApplicationComprehension {
        val session = login()

        val response = client.get("/api/webDAV/import/options/..") {
            header("X-Api-Session", session)
        }

        assertEquals(HttpStatusCode.BadRequest, response.status, response.bodyAsText())
        assertContains(response.bodyAsText(), "folder name")
    }

    private suspend fun TestApplicationComprehensionScope<JEnv>.login(): String {
        val login = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"admin","password":"admin"}""")
        }
        assertEquals(HttpStatusCode.OK, login.status, "Anmeldung als Fixture-Admin")
        val session = login.headers["X-Api-Session"]
        assertNotNull(session, "Login muss eine Sitzung ausgeben")
        return session
    }
}
