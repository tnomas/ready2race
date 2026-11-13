package de.lambda9.ready2race.backend.health

import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.server.routing.*

/**
 * Billiger Lebenszeichen-Endpunkt für Container-Healthchecks und Load-Balancer: ein `select 1` über
 * den Verbindungspool, ohne Anmeldung, ohne Rate-Limit. Antwortet 204, solange die Datenbank
 * erreichbar ist, sonst 500.
 *
 * Bisher pollte der Docker-Healthcheck `GET /api/event` - eine paginierte Abfrage auf event_view.
 * Bewusst nicht in documentation.yaml: Betriebsschnittstelle, kein Teil des Frontend-Clients.
 */
fun Route.health() {
    get("/health") {
        call.respondComprehension {
            !Jooq.query { selectOne().fetch() }.orDie()
            noData
        }
    }
}
