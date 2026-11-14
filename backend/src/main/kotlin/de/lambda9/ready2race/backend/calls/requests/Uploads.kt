package de.lambda9.ready2race.backend.calls.requests

import com.fasterxml.jackson.module.kotlin.readValue
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.tailwind.core.IO
import de.lambda9.tailwind.core.KIO
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.utils.io.*
import de.lambda9.ready2race.backend.calls.responses.clientFaultStatus
import de.lambda9.ready2race.backend.calls.responses.isClientAbort
import kotlinx.coroutines.CancellationException

/** Dateien und Formularfelder einer Multipart-Anfrage. */
data class MultipartUpload(
    val files: List<File>,
    val fields: Map<String, String>,
)

/**
 * Liest eine Multipart-Anfrage mit höchstens [maxFiles] Dateien. Gehört in
 * `respondComprehension` NACH die Anmeldung - sonst liest der Server den ganzen Körper eines
 * anonymen Aufrufers in den Speicher, bevor er ihn mit 401 abweist.
 *
 * Mehr Dateien als erlaubt beenden das Lesen sofort ([RequestError.File.Multiple]), eine Datei
 * ohne Namen gilt als fehlend ([RequestError.File.Missing]) statt als 500.
 */
suspend fun ApplicationCall.receiveUploads(maxFiles: Int): IO<RequestError, MultipartUpload> {
    val files = mutableListOf<File>()
    val fields = mutableMapOf<String, String>()
    return try {
        val data = receiveMultipart()
        var error: RequestError? = null
        while (error == null) {
            val part = data.readPart() ?: break
            try {
                when (part) {
                    is PartData.FileItem -> {
                        val name = part.originalFileName
                        error = when {
                            files.size >= maxFiles -> RequestError.File.Multiple
                            name == null -> RequestError.File.Missing
                            else -> {
                                files.add(File(name, part.provider().toByteArray()))
                                null
                            }
                        }
                    }

                    is PartData.FormItem -> part.name?.let { fields[it] = part.value }
                    else -> {}
                }
            } finally {
                part.dispose()
            }
        }
        error?.let { KIO.fail(it) } ?: KIO.ok(MultipartUpload(files, fields))
    } catch (ex: Exception) {
        KIO.fail(uploadReadFailure(ex))
    }
}

/**
 * Ordnet einen Fehler beim Lesen des Multipart-Körpers ein. Nur echte Formatfehler werden zu
 * [RequestError.Other] (400, ohne interne Ausnahmetexte). Alles andere fliegt weiter bis
 * `respondDefect`, das es schon richtig einordnet: Upload zu groß (413), falscher Inhaltstyp
 * (415), Abbruch des Clients (kein Antwortversuch, kein WARN mit Stacktrace) - und ein Abbruch
 * der Coroutine bleibt ein Abbruch.
 */
internal fun uploadReadFailure(ex: Exception): RequestError {
    if (ex is CancellationException || clientFaultStatus(ex) != null || isClientAbort(ex)) {
        throw ex
    }
    logger.info { "Malformed multipart body: ${ex::class.simpleName}: ${ex.message}" }
    return RequestError.Other(Exception("Malformed multipart body"))
}

/**
 * Ein JSON-Formularfeld einer Multipart-Anfrage, geparst und validiert. Kaputtes JSON ist ein
 * 400 ([RequestError.BodyUnparsable]), kein 500.
 */
inline fun <reified V : Validatable> MultipartUpload.jsonField(name: String, example: V): IO<RequestError, V?> {
    val raw = fields[name] ?: return KIO.ok(null)
    val value = try {
        jsonMapper.readValue<V>(raw)
    } catch (_: Exception) {
        return KIO.fail(RequestError.BodyUnparsable(example))
    }
    return when (val result = value.validate()) {
        is ValidationResult.Invalid ->
            KIO.fail(RequestError.BodyValidationFailed(result))
        else -> KIO.ok(value)
    }
}
