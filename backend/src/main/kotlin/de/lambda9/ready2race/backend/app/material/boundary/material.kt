package de.lambda9.ready2race.backend.app.material.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentsRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialDecisionRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestsUpsertRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeSort
import de.lambda9.ready2race.backend.app.material.entity.SetRequestsClosedRequest
import de.lambda9.ready2race.backend.calls.requests.RequestError
import de.lambda9.ready2race.backend.calls.requests.authenticate
import de.lambda9.ready2race.backend.calls.requests.authenticateAll
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.ready2race.backend.calls.requests.hasPrivilege
import de.lambda9.ready2race.backend.calls.requests.optionalQueryParam
import de.lambda9.ready2race.backend.calls.requests.pagination
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.requests.receiveUploads
import de.lambda9.ready2race.backend.calls.responses.ToApiError
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserWithPrivilegesRecord
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import de.lambda9.tailwind.core.KIO
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route
import java.util.UUID

/**
 * OWN heißt hier: der Anbieter, dem der Benutzer über `app_user.material_provider` zugeordnet ist -
 * dieselbe Mechanik wie beim Verein. Wiederverwendet von den Angebots-/Anfrage-Routen der
 * Folgeaufgaben.
 */
fun ownProviderCheck(
    user: AppUserWithPrivilegesRecord,
    scope: Privilege.Scope,
    providerId: UUID,
): App<AuthError, Unit> =
    if (scope == Privilege.Scope.OWN && providerId != user.materialProvider) {
        KIO.fail(AuthError.PrivilegeMissing)
    } else {
        KIO.unit
    }

fun Route.material() {
    route("/materialProvider") {

        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadMaterialGlobal)
                val params = !pagination<MaterialProviderSort>()
                MaterialService.pageProviders(params)
            }
        }

        post {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateMaterialGlobal)
                val body = !receiveKIO(MaterialProviderRequest.example)
                MaterialService.addProvider(body, user.id!!)
            }
        }

        route("/{providerId}") {

            get {
                call.respondComprehension {
                    val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                    val id = !pathParam("providerId", uuid)
                    !ownProviderCheck(user, scope, id)
                    MaterialService.getProvider(id)
                }
            }

            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateMaterialGlobal)
                    val id = !pathParam("providerId", uuid)
                    val body = !receiveKIO(MaterialProviderRequest.example)
                    MaterialService.updateProvider(id, body, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateMaterialGlobal)
                    val id = !pathParam("providerId", uuid)
                    MaterialService.deleteProvider(id)
                }
            }

            route("/item") {

                get {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val params = !pagination<MaterialItemSort>()
                        MaterialService.pageItems(providerId, params)
                    }
                }

                post {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val body = !receiveKIO(MaterialItemRequest.example)
                        MaterialService.addItem(providerId, body, user.id!!)
                    }
                }

                route("/{itemId}") {

                    put {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val itemId = !pathParam("itemId", uuid)
                            val body = !receiveKIO(MaterialItemRequest.example)
                            MaterialService.updateItem(providerId, itemId, body, user.id!!)
                        }
                    }

                    delete {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val itemId = !pathParam("itemId", uuid)
                            MaterialService.deleteItem(providerId, itemId)
                        }
                    }
                }
            }

            // Veranstaltungswahl des Anbieters - zu welchen Veranstaltungen ist er eingeladen.
            route("/event") {

                get {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        MaterialService.getProviderEvents(providerId)
                    }
                }
            }

            // Schadensakte des Anbieters, veranstaltungsübergreifend (Task 5.1).
            route("/damage") {

                get {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val params = !pagination<MaterialDamageSort>()
                        val eventId = !optionalQueryParam("eventId", uuid)
                        val itemId = !optionalQueryParam("itemId", uuid)
                        MaterialService.pageDamages(providerId, params, eventId, itemId)
                    }
                }

                post {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val body = !receiveKIO(MaterialDamageRequest.example)
                        MaterialService.addDamage(providerId, body, user.id!!)
                    }
                }

                route("/{damageId}") {

                    get {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val damageId = !pathParam("damageId", uuid)
                            MaterialService.getDamage(providerId, damageId)
                        }
                    }

                    put {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val damageId = !pathParam("damageId", uuid)
                            val body = !receiveKIO(MaterialDamageRequest.example)
                            MaterialService.updateDamage(providerId, damageId, body, user.id!!)
                        }
                    }

                    // Erst anmelden und die Zuständigkeit prüfen, dann lesen (`receiveUploads`):
                    // sonst landet der Körper eines anonymen oder fremden Aufrufers komplett im
                    // Speicher, bevor er abgewiesen wird.
                    post("/photo") {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val damageId = !pathParam("damageId", uuid)
                            // Grenzen schon beim Lesen (je Datei 10 MB, je Anfrage
                            // MATERIAL_PHOTOS_MAX_TOTAL_BYTES): Darüber endet das Lesen sofort, und
                            // der Fehler ist derselbe wie bei der Prüfung im Service.
                            val upload = !receiveUploads(
                                maxFiles = MATERIAL_PHOTOS_PER_UPLOAD,
                                maxFileBytes = MATERIAL_PHOTO_MAX_BYTES,
                                maxTotalBytes = MATERIAL_PHOTOS_MAX_TOTAL_BYTES,
                            ).mapError<ToApiError> { if (it == RequestError.File.TooLarge) MaterialError.PhotoTooLarge else it }
                            MaterialService.addPhotos(providerId, damageId, upload.files)
                        }
                    }
                }
            }

            route("/photo/{photoId}") {

                get {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val photoId = !pathParam("photoId", uuid)
                        MaterialService.getPhoto(providerId, photoId)
                    }
                }

                delete {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val photoId = !pathParam("photoId", uuid)
                        MaterialService.deletePhoto(providerId, photoId)
                    }
                }
            }
        }
    }

    route("/materialType") {

        get {
            call.respondComprehension {
                !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                val params = !pagination<MaterialTypeSort>()
                MaterialService.pageTypes(params)
            }
        }

        post {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateMaterialGlobal)
                val body = !receiveKIO(MaterialTypeRequest.example)
                MaterialService.addType(body, user.id!!)
            }
        }

        route("/{typeId}") {

            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateMaterialGlobal)
                    val id = !pathParam("typeId", uuid)
                    val body = !receiveKIO(MaterialTypeRequest.example)
                    MaterialService.updateType(id, body, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateMaterialGlobal)
                    val id = !pathParam("typeId", uuid)
                    MaterialService.deleteType(id)
                }
            }
        }
    }
}

/**
 * Einladung, Freigabe und Angebote je Veranstaltung - eingehängt in `event.kt` unter
 * `route("/{eventId}")`, Muster `eventDocument()`.
 */
fun Route.eventMaterial() {
    route("/materialProvider") {

        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                MaterialService.getEventProviders(eventId)
            }
        }

        route("/{providerId}") {

            put {
                call.respondComprehension {
                    // Einladen braucht beide Rechte: die Veranstaltung ändern und die Anbieter lesen
                    // (die Auswahl stammt aus der Anbieterliste). Ausladen bleibt Veranstalter-Sache.
                    val user = !authenticateAll(Privilege.UpdateEventGlobal, Privilege.ReadMaterialGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val providerId = !pathParam("providerId", uuid)
                    MaterialService.inviteProvider(eventId, providerId, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val providerId = !pathParam("providerId", uuid)
                    MaterialService.uninviteProvider(eventId, providerId)
                }
            }

            put("/requestsClosed") {
                call.respondComprehension {
                    val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                    val eventId = !pathParam("eventId", uuid)
                    val providerId = !pathParam("providerId", uuid)
                    !ownProviderCheck(user, scope, providerId)
                    val body = !receiveKIO(SetRequestsClosedRequest.example)
                    MaterialService.setRequestsClosed(eventId, providerId, body.requestsClosed, user.id!!)
                }
            }

            route("/offer") {

                get {
                    call.respondComprehension {
                        // "ODER zweier Rechte": Veranstalter (READ EVENT GLOBAL) oder der eigene
                        // Anbieter (READ MATERIAL OWN) dürfen die Angebote sehen - die OWN-Prüfung
                        // greift nur, wenn das globale Recht fehlt.
                        val user = !authenticateAny(Privilege.ReadMaterialOwn, Privilege.ReadEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val providerId = !pathParam("providerId", uuid)
                        if (!user.hasPrivilege(Privilege.ReadEventGlobal)) {
                            !ownProviderCheck(user, Privilege.Scope.OWN, providerId)
                        }
                        MaterialService.listOffers(eventId, providerId)
                    }
                }

                post {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val eventId = !pathParam("eventId", uuid)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val body = !receiveKIO(MaterialOfferRequest.example)
                        MaterialService.addOffer(eventId, providerId, body, user.id!!)
                    }
                }

                route("/{offerId}") {

                    put {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val eventId = !pathParam("eventId", uuid)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val offerId = !pathParam("offerId", uuid)
                            val body = !receiveKIO(MaterialOfferRequest.example)
                            MaterialService.updateOffer(eventId, providerId, offerId, body, user.id!!)
                        }
                    }

                    delete {
                        call.respondComprehension {
                            val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                            val eventId = !pathParam("eventId", uuid)
                            val providerId = !pathParam("providerId", uuid)
                            !ownProviderCheck(user, scope, providerId)
                            val offerId = !pathParam("offerId", uuid)
                            MaterialService.deleteOffer(eventId, providerId, offerId)
                        }
                    }
                }
            }

            // Übersicht, Entscheidung und Zuteilung - das Anbieter-Dashboard für diese Veranstaltung.
            get("/overview") {
                call.respondComprehension {
                    val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                    val eventId = !pathParam("eventId", uuid)
                    val providerId = !pathParam("providerId", uuid)
                    !ownProviderCheck(user, scope, providerId)
                    MaterialService.getOverview(eventId, providerId)
                }
            }

            route("/request/{requestId}") {

                put("/decision") {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val eventId = !pathParam("eventId", uuid)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val requestId = !pathParam("requestId", uuid)
                        val body = !receiveKIO(MaterialDecisionRequest.example)
                        MaterialService.decideRequest(eventId, providerId, requestId, body, user.id!!)
                    }
                }

                put("/assignments") {
                    call.respondComprehension {
                        val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.MATERIAL)
                        val eventId = !pathParam("eventId", uuid)
                        val providerId = !pathParam("providerId", uuid)
                        !ownProviderCheck(user, scope, providerId)
                        val requestId = !pathParam("requestId", uuid)
                        val body = !receiveKIO(MaterialAssignmentsRequest.example)
                        MaterialService.setAssignments(eventId, providerId, requestId, body, user.id!!)
                    }
                }
            }

            // Schadensakte dieser Veranstaltung als CSV (Task 5.1).
            get("/damage/csv") {
                call.respondComprehension {
                    val (user, scope) = !authenticate(Privilege.Action.READ, Privilege.Resource.MATERIAL)
                    val eventId = !pathParam("eventId", uuid)
                    val providerId = !pathParam("providerId", uuid)
                    !ownProviderCheck(user, scope, providerId)
                    MaterialService.damagesCsv(eventId, providerId)
                }
            }
        }
    }

    // Anfragen einer Meldung - nicht unter /materialProvider, weil OWN hier den Verein des
    // Nutzers meint (wie bei competitionRegistration), nicht dessen Materialanbieter.
    route("/competitionRegistration/{competitionRegistrationId}/materialRequests") {

        put {
            call.respondComprehension {
                val (user, scope) = !authenticate(Privilege.Action.UPDATE, Privilege.Resource.REGISTRATION)
                val eventId = !pathParam("eventId", uuid)
                val competitionRegistrationId = !pathParam("competitionRegistrationId", uuid)
                val body = !receiveKIO(MaterialRequestsUpsertRequest.example)
                MaterialService.setRequestsForRegistration(eventId, competitionRegistrationId, scope to user.club, body.offerIds, user.id!!)
            }
        }
    }
}
