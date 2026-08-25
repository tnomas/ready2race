package de.lambda9.ready2race.backend.app.paceReference.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.paceReference.control.PaceReferenceRepo
import de.lambda9.ready2race.backend.app.paceReference.control.toDto
import de.lambda9.ready2race.backend.app.paceReference.control.toRecord
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceError
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceRequest
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceSort
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.calls.responses.createdResponse
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

/**
 * Der Katalog der Bezugsgrößen: womit eine Sportart Tempo ausdrückt (Rudern /500 m, Laufen /km,
 * Radsport km/h). Veranstaltungsübergreifend wie die übrigen Wettkampf-Komponenten, weil eine
 * Sportart sich nicht je Regatta ändert.
 */
object PaceReferenceService {

    fun addPaceReference(
        request: PaceReferenceRequest,
        userId: UUID,
    ): App<PaceReferenceError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !PaceReferenceRepo.existsByName(request.name).orDie()
        !KIO.failOn(nameTaken) { PaceReferenceError.NameTaken }

        val record = !request.toRecord(userId)
        PaceReferenceRepo.create(record).orDie().createdResponse()
    }

    fun page(
        params: PaginationParameters<PaceReferenceSort>,
    ): App<Nothing, ApiResponse.Page<PaceReferenceDto, PaceReferenceSort>> = KIO.comprehension {
        val total = !PaceReferenceRepo.count(params.search).orDie()
        val page = !PaceReferenceRepo.page(params).orDie()

        page.traverse { it.toDto() }.map {
            ApiResponse.Page(
                data = it,
                pagination = params.toPagination(total)
            )
        }
    }

    fun updatePaceReference(
        id: UUID,
        request: PaceReferenceRequest,
        userId: UUID,
    ): App<PaceReferenceError, ApiResponse.NoData> = KIO.comprehension {
        val nameTaken = !PaceReferenceRepo.existsByName(request.name, excludingId = id).orDie()
        !KIO.failOn(nameTaken) { PaceReferenceError.NameTaken }

        !PaceReferenceRepo.update(id) {
            name = request.name
            mode = request.mode.name
            referenceMeters = request.referenceMeters
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { PaceReferenceError.NotFound }
        noData
    }

    /**
     * Löschen ist immer erlaubt. Anders als bei Rennen und Zeitnahmetypen gibt es keine Sperre: die
     * Bezugsgröße ist reine Anzeige und verfälscht keine Messung, und der Fremdschlüssel am
     * Wettkampf steht auf `on delete set null`.
     */
    fun deletePaceReference(
        id: UUID,
    ): App<PaceReferenceError, ApiResponse.NoData> = KIO.comprehension {
        val deleted = !PaceReferenceRepo.delete(id).orDie()

        if (deleted < 1) {
            KIO.fail(PaceReferenceError.NotFound)
        } else {
            noData
        }
    }
}
