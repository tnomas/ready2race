package de.lambda9.ready2race.backend.app.webDAV

import de.lambda9.ready2race.backend.app.webDAV.entity.WebDAVExportRequest
import de.lambda9.ready2race.backend.app.webDAV.entity.WebDAVExportType
import de.lambda9.ready2race.backend.validation.ValidationResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Der Exportname wird zum Ordnernamen auf dem WebDAV-Server und steht am Anfang jedes Zielpfads.
 * Ein Name mit Trennzeichen oder Punktverzeichnis verließe den vorgesehenen Zielordner - deshalb
 * lehnt die Validierung ihn ab, bevor irgendetwas gesendet wird.
 */
class WebDAVExportRequestTest {

    private fun request(name: String) = WebDAVExportRequest(
        name = name,
        events = emptyList(),
        selectedDatabaseExports = listOf(WebDAVExportType.DB_USERS),
    )

    @Test
    fun einGewoehnlicherNameIstGueltig() {
        assertEquals(ValidationResult.Valid, request("2026-FördeRACE Export").validate())
    }

    @Test
    fun schraegstricheSindKeinOrdnername() {
        assertTrue(request("2026/Export").validate() is ValidationResult.Invalid)
        assertTrue(request("2026\\Export").validate() is ValidationResult.Invalid)
    }

    @Test
    fun punktverzeichnisseSindKeinOrdnername() {
        assertTrue(request(".").validate() is ValidationResult.Invalid)
        assertTrue(request("..").validate() is ValidationResult.Invalid)
        assertTrue(request("../2026").validate() is ValidationResult.Invalid)
    }

    /** Ein Punkt IM Namen bleibt erlaubt - "v1.2" ist ein Name, kein Verzeichnisverweis. */
    @Test
    fun punkteImNamenBleibenErlaubt() {
        assertEquals(ValidationResult.Valid, request("Export v1.2").validate())
    }
}
