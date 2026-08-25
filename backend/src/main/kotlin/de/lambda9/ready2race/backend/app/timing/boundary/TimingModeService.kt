package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.TimingModeRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toRecord
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Zeitnahmetypen ("Timetrial 30s", "Wellenstart", "Massenstart") - die Vorlagen selbst.
 *
 * WO ein Typ gilt, steht hier nicht mehr: Der Geltungsbereich ist eine Zeile des
 * Zeitnahmeprofil-Baums ([TimingProfileService]), der Rennen und Zeitnahmetypen gleich behandelt
 * und über vier Ebenen vererbt. Die Posten-Boards bekommen den aufgelösten Typ über die Startliste
 * ([TimingMatchService]) und nicht über einen eigenen Kanal - es gibt deshalb bewusst keine eigene
 * Nachricht "Typ geändert".
 *
 * Was es seit dem 24.08.2026 gibt: ein [TimingMatchService.broadcastMatchesChanged] nach jedem
 * Schreiben, das den WIRKSAMEN Typ einer Partie verschiebt. Die Annahme "Typen sind Konfiguration,
 * die vor dem Renntag gepflegt wird" hielt am Steg nicht: wird ein vergessener Typ mitten am
 * Renntag nachgetragen, standen die offenen Boards bis zum nächsten Neuladen weiter ohne
 * Startablauf da. Die Nachricht ist ein reiner Auslöser - die Boards holen die Startliste, und
 * damit den aufgelösten Typ, wie bisher selbst.
 */
object TimingModeService {

    fun addMode(
        request: TimingModeRequest,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !TimingModeRepo.existsByEventAndName(eventId, request.name).orDie()
        !KIO.failOn(nameTaken) { TimingError.ModeNameTaken }

        val id = !TimingModeRepo.create(request.toRecord(userId, eventId)).orDie()
        KIO.ok(ApiResponse.Created(id))
    }

    fun getModes(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingModeDto>> = KIO.comprehension {
        val records = !TimingModeRepo.getByEvent(eventId).orDie()
        KIO.ok(ApiResponse.ListDto(records.sortedBy { it.name }.map { it.toDto() }))
    }

    fun updateMode(
        request: TimingModeRequest,
        userId: UUID,
        modeId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mode = !TimingModeRepo.get(modeId).orDie().onNullFail { TimingError.ModeNotFound }
        !KIO.failOn(mode.event != eventId) { TimingError.EventMismatch }

        val nameTaken = !TimingModeRepo.existsByEventAndName(eventId, request.name, excludingId = modeId).orDie()
        !KIO.failOn(nameTaken) { TimingError.ModeNameTaken }

        !TimingModeRepo.update(modeId) {
            name = request.name
            startGrouping = request.startGrouping.name
            intervalSeconds = request.intervalSeconds
            leadInSeconds = request.leadInSeconds
            tonePlan = request.tonePlan?.toJsonb()
            falseStartEnabled = request.falseStartEnabled
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.ModeNotFound }

        // Der Typ steckt aufgelöst in jeder Partie der Startliste (Taktung, Gruppierung, Tonfolge) -
        // ein geänderter Typ ändert also den Startablauf jedes Laufs, für den er gilt.
        TimingMatchService.broadcastMatchesChanged(eventId)
        noData
    }

    fun deleteMode(
        modeId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mode = !TimingModeRepo.get(modeId).orDie().onNullFail { TimingError.ModeNotFound }
        !KIO.failOn(mode.event != eventId) { TimingError.EventMismatch }

        // Vorprüfung des on-delete-restrict-Fremdschlüssels: ein Typ, der noch irgendwo gilt,
        // verschwindet nicht stillschweigend - erst die Zuordnungen lösen, dann löschen. Gefragt
        // wird der Zeitnahmeprofil-Baum, denn dort steht seit V202608242100 jeder Geltungsbereich.
        val assigned = !TimingModeRepo.countAssignments(modeId).orDie()
        !KIO.failOn(assigned > 0) { TimingError.ModeInUse }

        !TimingModeRepo.delete(modeId).orDie()
        noData
    }
}
