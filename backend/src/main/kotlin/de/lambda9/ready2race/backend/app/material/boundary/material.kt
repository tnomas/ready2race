package de.lambda9.ready2race.backend.app.material.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderSort
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestsUpsertRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeSort
import de.lambda9.ready2race.backend.app.material.entity.SetRequestsClosedRequest
import de.lambda9.ready2race.backend.calls.requests.authenticate
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.ready2race.backend.calls.requests.hasPrivilege
import de.lambda9.ready2race.backend.calls.requests.pagination
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
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
                    val user = !authenticate(Privilege.UpdateEventGlobal)
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
