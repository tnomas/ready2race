package de.lambda9.ready2race.backend.app.eventDocument.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.eventDocument.entity.EventDocumentRequest
import de.lambda9.ready2race.backend.app.eventDocument.entity.EventDocumentViewSort
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.calls.requests.*
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.file.File
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import de.lambda9.tailwind.core.KIO
import io.ktor.http.content.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.utils.io.*
import java.util.*

/** Obergrenze je Upload-Anfrage; der Dialog lädt mehrere Dokumente auf einmal hoch. */
private const val MAX_EVENT_DOCUMENTS_PER_UPLOAD = 50

fun Route.eventDocument() {

    get("/registrationDocuments") {
        call.respondComprehension {
            val eventId = !pathParam("eventId", uuid)
            EventRegistrationService.getEventRegistrationDocuments(eventId)
        }
    }

    route("/eventDocument") {

        post {
            call.respondComprehension {
                // Erst anmelden, dann lesen: sonst landet der Körper eines anonymen Aufrufers
                // komplett im Speicher, bevor er mit 401 abgewiesen wird.
                val user = !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val upload = !receiveUploads(maxFiles = MAX_EVENT_DOCUMENTS_PER_UPLOAD)
                val type = !KIO.effect {
                    upload.fields["documentType"]?.let { UUID.fromString(it) }
                }
                    .mapError { RequestError.Other(Exception("Expected UUID or null as 'documentType'")) } // todo: @improve: specific Error type
                EventDocumentService.saveDocuments(eventId, upload.files, type, user.id!!)
            }

        }

        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val params = !pagination<EventDocumentViewSort>()
                EventDocumentService.pageForEvent(eventId, params)
            }
        }

        route("/{eventDocumentId}") {

            get {
                call.respondComprehension {
                    val (_, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.EVENT)
                    val id = !pathParam("eventDocumentId", uuid)

                    EventDocumentService.downloadDocument(id, scope)
                }
            }

            put {
                val payload = call.receiveKIO(EventDocumentRequest.example)
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val id = !pathParam("eventDocumentId", uuid)

                    val body = !payload
                    EventDocumentService.updateDocument(id, body, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val id = !pathParam("eventDocumentId", uuid)
                    EventDocumentService.deleteDocument(id)
                }
            }

        }
    }
}