package de.lambda9.ready2race.backend.calls.requests

import io.ktor.server.plugins.PayloadTooLargeException
import io.ktor.utils.io.ClosedByteChannelException
import kotlinx.coroutines.CancellationException
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertSame

/**
 * Fehler beim Lesen eines Multipart-Uploads: Nur Formatfehler werden zum 400, alles andere
 * erreicht `respondDefect` (413 bei Übergröße, kein Antwortversuch bei Abbruch des Clients).
 */
class UploadReadFailureTest {

    @Test
    fun `zu grosser Upload fliegt weiter, damit respondDefect 413 antwortet`() {
        val tooLarge = PayloadTooLargeException(1024)
        assertSame(tooLarge, assertFailsWith<PayloadTooLargeException> { uploadReadFailure(tooLarge) })
    }

    @Test
    fun `Abbruch des Clients und der Coroutine fliegen weiter`() {
        assertFailsWith<ClosedByteChannelException> {
            uploadReadFailure(ClosedByteChannelException(IOException("Verbindung weg")))
        }
        assertFailsWith<CancellationException> { uploadReadFailure(CancellationException("abgebrochen")) }
    }

    @Test
    fun `Formatfehler wird 400 ohne internen Ausnahmetext`() {
        val error = uploadReadFailure(IllegalStateException("io.ktor.http.cio.internals.Irgendwas: kaputt"))

        assertIs<RequestError.Other>(error)
        val api = error.respond()
        assertEquals(400, api.status.value)
        assertEquals("Malformed multipart body", api.message)
    }
}
