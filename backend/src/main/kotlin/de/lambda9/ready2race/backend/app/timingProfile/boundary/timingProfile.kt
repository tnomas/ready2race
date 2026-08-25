package de.lambda9.ready2race.backend.app.timingProfile.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.calls.requests.authenticate
import de.lambda9.ready2race.backend.calls.requests.optionalQueryParam
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import io.ktor.server.routing.*

/** Der Zeitnahmeprofil-Baum einer Veranstaltung — unterhalb der Event-Route zu mounten. */
fun Route.timingProfile() {
    route("/timing-profile") {
        get("/tree") {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                TimingProfileService.getTree(eventId)
            }
        }
        put("/assignment") {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                val body = !receiveKIO(TimingProfileAssignmentRequest.example)
                TimingProfileService.upsertAssignment(eventId, user.id!!, body)
            }
        }
        // Gesamtbereinigung: alles UNTERHALB der Ebene erbt wieder. Ohne competition ist das die
        // ganze Veranstaltung, mit competition nur dessen Runden und Partien.
        delete("/assignments") {
            call.respondComprehension {
                !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val competitionId = !optionalQueryParam("competition", uuid)

                TimingProfileService.resetAssignments(eventId, competitionId)
            }
        }
    }
}
