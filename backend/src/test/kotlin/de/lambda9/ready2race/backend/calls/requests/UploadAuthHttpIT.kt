package de.lambda9.ready2race.backend.calls.requests

import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.request.forms.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Multipart-Uploads werden erst nach der Anmeldung gelesen. Vorher lasen die Routen den ganzen
 * Körper eines anonymen Aufrufers in den Speicher und stürzten an einer Datei ohne Namen oder an
 * kaputtem JSON mit 500 ab, bevor überhaupt jemand nach der Sitzung fragte. Gezielt starten:
 * `./mvnw test -Dtest=UploadAuthHttpIT -DfailIfNoSpecifiedTests=false`
 */
class UploadAuthHttpIT {

    /** Eine Datei ohne Dateinamen - daran scheiterte `originalFileName!!` vor der Anmeldung. */
    private fun namelessFile() = formData {
        append("file", ByteArray(16) { 1 }, Headers.build {
            append(HttpHeaders.ContentDisposition, "form-data; name=\"file\"")
            append(HttpHeaders.ContentType, "application/pdf")
        })
        append("request", "{ kaputt")
        append("documentType", "keine-uuid")
    }

    @Test
    fun eventDocumentUploadAsksForTheSessionFirst() = testApplicationComprehension {
        val response = client.submitFormWithBinaryData("/api/event/${UUID.randomUUID()}/eventDocument", namelessFile())
        assertEquals(HttpStatusCode.Unauthorized, response.status, response.bodyAsText())
    }

    @Test
    fun documentTemplateUploadAsksForTheSessionFirst() = testApplicationComprehension {
        val response = client.submitFormWithBinaryData("/api/documentTemplate", namelessFile())
        assertEquals(HttpStatusCode.Unauthorized, response.status, response.bodyAsText())
    }
}
