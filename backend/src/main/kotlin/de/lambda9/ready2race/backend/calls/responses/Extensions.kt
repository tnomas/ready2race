package de.lambda9.ready2race.backend.calls.responses

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.calls.comprehension.CallComprehensionScope
import de.lambda9.ready2race.backend.calls.comprehension.comprehension
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.pagination.Page
import de.lambda9.ready2race.backend.pagination.Sortable
import de.lambda9.ready2race.backend.plugins.kioEnv
import de.lambda9.tailwind.core.Cause
import de.lambda9.tailwind.core.Exit
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
import de.lambda9.tailwind.jooq.transact
import io.github.oshai.kotlinlogging.KotlinLogging
import io.ktor.http.*
import io.ktor.server.application.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.ContentTransformationException
import io.ktor.server.plugins.NotFoundException
import io.ktor.server.plugins.PayloadTooLargeException
import io.ktor.server.plugins.UnsupportedMediaTypeException
import io.ktor.util.cio.ChannelIOException
import io.ktor.utils.io.ClosedByteChannelException
import io.ktor.server.response.*
import java.io.PrintWriter
import java.io.StringWriter
import java.security.MessageDigest
import java.util.UUID

private val logger = KotlinLogging.logger {}

fun <R, E, A> KIO<R, E, A>.noDataResponse(): KIO<R, E, ApiResponse.NoData> =
    map { ApiResponse.NoData }

fun <R, E> KIO<R, E, UUID>.createdResponse(): KIO<R, E, ApiResponse.Created> =
    map { ApiResponse.Created(it) }

fun <R, E, A> KIO<R, E, A>.createdResponse(f: A.() -> UUID): KIO<R, E, ApiResponse.Created> =
    map { ApiResponse.Created(f(it)) }

fun <R, E, A : Any> KIO<R, E, A>.dtoResponse(): KIO<R, E, ApiResponse.Dto<A>> =
    map { ApiResponse.Dto(it) }

fun <R, E, A : Any, B : Any, S : Sortable> KIO<R, E, Page<A, S>>.pageResponse(f: (A) -> B): KIO<R, E, ApiResponse.Page<B, S>> =
    map { ApiResponse.Page(data = it.data.map(f), pagination = it.pagination) }

fun <R, E, A : Any, S : Sortable> KIO<R, E, Page<A, S>>.pageResponse(): KIO<R, E, ApiResponse.Page<A, S>> =
    map { ApiResponse.Page(data = it.data, pagination = it.pagination) }

fun <R, E> KIO<R, E, File>.fileResponse(): KIO<R, E, ApiResponse.File> =
    map { ApiResponse.File(name = it.name, bytes = it.bytes) }

/**
 * Antwortet mit `ETag` und lässt den Rumpf weg, wenn der Client denselben Stand schon hat.
 *
 * Der Fingerabdruck entsteht aus dem serialisierten Datensatz, nicht aus Zeitstempeln: ein
 * `max(updated_at)`-Kriterium müsste jede beteiligte Tabelle erfassen und wäre bei Löschungen
 * still falsch. Gespart wird die Übertragung, nicht die Abfrage — genau darum geht es im
 * Mobilfunknetz.
 */
suspend fun ApplicationCall.respondETagged(
    apiResponse: ApiResponse.ETagged<*>,
) {
    val etag = "\"" + MessageDigest.getInstance("SHA-256")
        .digest(jsonMapper.writeValueAsBytes(apiResponse.dto))
        .joinToString("") { "%02x".format(it) }
        .take(32) + "\""

    response.header(HttpHeaders.ETag, etag)

    val known = request.headers[HttpHeaders.IfNoneMatch]
        ?.split(",")
        ?.map { it.trim() }
        ?: emptyList()

    if (known.contains(etag)) {
        respond(HttpStatusCode.NotModified)
    } else {
        respond(apiResponse.dto)
    }
}

suspend fun ApplicationCall.respondError(
    error: ToApiError,
) = respondError(error.respond())

suspend fun ApplicationCall.respondError(
    error: ApiError,
) {
    error.headers.forEach { entry ->
        response.headers.append(entry.key, entry.value)
    }
    respond(error.status, error)
}

/**
 * Ausnahmen, die ein Client verursacht hat (kaputter Body, zu großer Upload, falscher Content-Type)
 * und die deshalb kein 500 sind. Gesucht wird die Ausnahme selbst und ihre ersten Ursachen, weil
 * KIO.effect oder Multipart-Lesen sie gern einpacken.
 */
internal fun clientFaultStatus(defect: Throwable): HttpStatusCode? =
    generateSequence(defect) { it.cause }.take(5).firstNotNullOfOrNull { t ->
        when (t) {
            is PayloadTooLargeException -> HttpStatusCode.PayloadTooLarge
            is UnsupportedMediaTypeException -> HttpStatusCode.UnsupportedMediaType
            is ContentTransformationException, is BadRequestException -> HttpStatusCode.BadRequest
            is NotFoundException -> HttpStatusCode.NotFound
            else -> null
        }
    }

/** Der Client hat die Verbindung abgebrochen; eine Antwort erreicht ihn nicht mehr. */
internal fun isClientAbort(defect: Throwable): Boolean =
    generateSequence(defect) { it.cause }.take(5).any { t ->
        // Bewusst ohne CancellationException: auch ein withTimeout in einem Service wirft eine,
        // und die muss weiter als Defekt sichtbar bleiben.
        t is ChannelIOException || t is ClosedByteChannelException
    }

suspend fun ApplicationCall.respondDefect(
    defect: Throwable,
) {
    if (isClientAbort(defect)) {
        logger.debug { "Client closed the connection: ${defect::class.simpleName}: ${defect.message}" }
        return
    }
    clientFaultStatus(defect)?.let { status ->
        logger.info { "Rejected request with ${status.value}: ${defect::class.simpleName}: ${defect.message}" }
        respondError(ApiError(status = status, message = status.description))
        return
    }

    logger.error(defect) { "An internal error occurred" }
    val details = when {
        kioEnv.env.config.mode.exposesDefectDetails -> {
            try {
                val sw = StringWriter()
                val pw = PrintWriter(sw)
                defect.printStackTrace(pw)
                mapOf("error" to sw.toString())
            } catch (t: Throwable) {
                null
            }
        }

        else ->
            null
    }

    respondError(
        ApiError(
            status = HttpStatusCode.InternalServerError,
            message = "An unexpected error has occurred.",
            details = details
        )
    )
}

suspend fun ApplicationCall.respondCause(
    cause: Cause<ToApiError>,
) = cause.fold(
    onExpected = { respondError(it) },
    onPanic = { respondDefect(it) },
)

suspend fun ApplicationCall.respondKIO(
    app: KIO<JEnv, ToApiError, ApiResponse>,
) {
    // Side effects that must not be visible before the transaction committed (e.g. websocket
    // broadcasts) are buffered while the KIO runs and flushed right after the commit.
    //
    // Die Transaktion blockiert ihren Thread (JDBC, Argon2, PDF). Unter Netty läuft der Handler auf
    // dem Event-Loop, der zugleich alle anderen Verbindungen bedient - deshalb auf Dispatchers.IO.
    // collect und transact laufen darin synchron auf EINEM Thread, der ThreadLocal-Puffer von
    // AfterCommit bleibt also gültig.
    //
    // Die Nachwirkungen laufen im selben Block direkt nach dem Commit, nicht erst nach dem
    // Antworten: withContext verwirft bei einem Abbruch der Anfrage (Client weg, Netty bricht den
    // Handler ab) das Ergebnis des Blocks und wirft CancellationException - der blockierende Block
    // selbst läuft aber zu Ende und committet. Ein flush hinter withContext ginge dann verloren,
    // der Änderungsmarker bliebe stehen und kein Push erreichte Boards und Stream. Blockieren
    // können die Nachwirkungen nicht unbegrenzt: Es sind kurze, synchrone Aufrufe (Marker,
    // Broadcast-Anstoß), Fehler fängt flush einzeln ab. Zurückgerollt (Fehler, Defekt) wird nichts
    // ausgelöst.
    val exit = withContext(Dispatchers.IO) {
        val (exit, afterCommit) = AfterCommit.collect { app.transact().unsafeRunSync(kioEnv) }
        if (exit is Exit.Success) {
            AfterCommit.flush(afterCommit)
        }
        exit
    }
    respondExit(exit)
}

private suspend fun ApplicationCall.respondExit(
    exit: Exit<ToApiError, ApiResponse>,
) {
    exit.fold(
        onError = { respondError(it) },
        onDefect = { respondDefect(it) },
        onSuccess = { apiResponse ->
            when (apiResponse) {
                ApiResponse.NoData -> {
                    response.status(HttpStatusCode.NoContent)
                }

                is ApiResponse.Dto<*> -> {
                    respond(apiResponse.dto)
                }

                is ApiResponse.ETagged<*> -> {
                    respondETagged(apiResponse)
                }

                is ApiResponse.ListDto<*> -> {
                    respond(apiResponse.data)
                }

                is ApiResponse.Page<*, *> -> {
                    respond(apiResponse)
                }

                is ApiResponse.File -> {

                    val contentType = contentTypeForFileName(apiResponse.name)

                    response.header(
                        HttpHeaders.ContentDisposition,
                        ContentDisposition.Attachment.withParameter(
                            ContentDisposition.Parameters.FileName,
                            apiResponse.name
                        ).toString()
                    )

                    respondBytes(apiResponse.bytes, contentType)
                }

                is ApiResponse.Created -> {
                    respondText(apiResponse.id.toString(), status = HttpStatusCode.Created)
                }
            }
        }
    )
}

suspend fun ApplicationCall.respondComprehension(
    block: suspend CallComprehensionScope.() -> KIO<JEnv, ToApiError, ApiResponse>
) {
    // Auch die Comprehension selbst führt jedes `!` sofort aus (authenticate, Repos): mit auf
    // Dispatchers.IO, nicht auf den Netty-Event-Loop.
    val app = withContext(Dispatchers.IO) { comprehension(block) }
    respondKIO(app)
}