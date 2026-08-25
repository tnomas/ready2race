package de.lambda9.ready2race.backend.app.paceReference.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceRequest
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceSort
import de.lambda9.ready2race.backend.calls.requests.authenticate
import de.lambda9.ready2race.backend.calls.requests.pagination
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.paceReference() {
    route("/pace-reference") {

        post {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateEventGlobal)

                val body = !receiveKIO(PaceReferenceRequest.example)
                PaceReferenceService.addPaceReference(body, user.id!!)
            }
        }

        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val params = !pagination<PaceReferenceSort>()
                PaceReferenceService.page(params)
            }
        }

        route("/{paceReferenceId}") {

            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val id = !pathParam("paceReferenceId", uuid)

                    val body = !receiveKIO(PaceReferenceRequest.example)
                    PaceReferenceService.updatePaceReference(id, body, user.id!!)
                }
            }

            delete {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val id = !pathParam("paceReferenceId", uuid)
                    PaceReferenceService.deletePaceReference(id)
                }
            }
        }
    }
}
