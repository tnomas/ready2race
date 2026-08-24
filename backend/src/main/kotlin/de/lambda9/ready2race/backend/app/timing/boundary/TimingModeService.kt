package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.competition.entity.CompetitionError
import de.lambda9.ready2race.backend.app.competitionProperties.control.CompetitionPropertiesRepo
import de.lambda9.ready2race.backend.app.competitionSetup.control.CompetitionSetupRoundRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingModeAssignmentRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingModeRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.control.toRecord
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingModeAssignmentRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Zeitnahmetypen ("Timetrial 30s", "Wellenstart", "Massenstart") und ihre Zuordnung zu
 * Wettkämpfen und Runden.
 *
 * Der Typ ist die Vorlage, die Zuordnung der Geltungsbereich, und `TimingModeResolveLogic` die
 * eine Stelle, die daraus den wirksamen Typ eines Laufs bestimmt. Bewusst KEINE
 * Websocket-Broadcasts: Typen und Zuordnungen sind Konfiguration, die vor dem Renntag gepflegt
 * wird - die Posten-Boards bekommen den aufgelösten Typ über die Startliste
 * (`TimingMatchService`), nicht über einen eigenen Kanal.
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
            withLaps = request.withLaps
            startGrouping = request.startGrouping.name
            intervalSeconds = request.intervalSeconds
            leadInSeconds = request.leadInSeconds
            tonePlan = request.tonePlan?.toJsonb()
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie().onNullFail { TimingError.ModeNotFound }
        noData
    }

    fun deleteMode(
        modeId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mode = !TimingModeRepo.get(modeId).orDie().onNullFail { TimingError.ModeNotFound }
        !KIO.failOn(mode.event != eventId) { TimingError.EventMismatch }

        // Vorprüfung des on-delete-restrict-Fremdschlüssels: ein Typ, der noch irgendwo gilt,
        // verschwindet nicht stillschweigend - erst die Zuordnungen lösen, dann löschen.
        val inUse = !TimingModeAssignmentRepo.existsByMode(modeId).orDie()
        !KIO.failOn(inUse) { TimingError.ModeInUse }

        !TimingModeRepo.delete(modeId).orDie()
        noData
    }

    fun getModeAssignments(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingModeAssignmentDto>> = KIO.comprehension {
        val records = !TimingModeAssignmentRepo.getByEvent(eventId).orDie()
        KIO.ok(ApiResponse.ListDto(records.map { it.toDto() }))
    }

    /**
     * Setzt oder räumt die Typ-Zuordnung der (Wettkampf, Runde)-Kombination - siehe
     * [TimingModeAssignmentRequest] zur PUT-Semantik.
     */
    fun upsertModeAssignment(
        request: TimingModeAssignmentRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val competition = !CompetitionRepo.getRecordById(request.competition).orDie()
            .onNullFail { CompetitionError.CompetitionNotFound }
        !KIO.failOn(competition.event != eventId) { TimingError.EventMismatch }

        // Die Runde muss zum Setup genau dieses Wettkampfs gehören. Der Fremdschlüssel allein
        // hindert niemanden, die Runde eines FREMDEN Wettkampfs anzuwählen - dann gälte der Typ
        // für eine Kombination, die es fachlich nicht gibt, und die Auflösung fände ihn nie.
        val roundId = request.competitionSetupRound
        if (roundId != null) {
            val round = !CompetitionSetupRoundRepo.get(roundId).orDie()
                .onNullFail { TimingError.RoundNotOfCompetition }
            val propertiesId = !CompetitionPropertiesRepo.getIdByCompetitionOrTemplateId(request.competition).orDie()
            !KIO.failOn(propertiesId == null || round.competitionSetup != propertiesId) {
                TimingError.RoundNotOfCompetition
            }
        }

        val existing = !TimingModeAssignmentRepo.getByCompetitionAndRound(request.competition, roundId).orDie()
        val modeId = request.timingMode

        if (modeId == null) {
            // Abräumen: kein Eintrag mehr für diese Kombination. Idempotent - "war nie gesetzt"
            // und "ist jetzt weg" sind für den Aufrufer dasselbe Ergebnis.
            if (existing != null) {
                !TimingModeAssignmentRepo.delete(existing.id).orDie()
            }
        } else {
            val mode = !TimingModeRepo.get(modeId).orDie().onNullFail { TimingError.ModeNotFound }
            !KIO.failOn(mode.event != eventId) { TimingError.EventMismatch }

            val now = LocalDateTime.now()
            if (existing == null) {
                !TimingModeAssignmentRepo.create(
                    TimingModeAssignmentRecord(
                        id = UUID.randomUUID(),
                        competition = request.competition,
                        competitionSetupRound = roundId,
                        timingMode = modeId,
                        createdAt = now,
                        createdBy = userId,
                        updatedAt = now,
                        updatedBy = userId,
                    )
                ).orDie()
            } else {
                !TimingModeAssignmentRepo.update(existing.id) {
                    timingMode = modeId
                    updatedAt = now
                    updatedBy = userId
                }.orDie()
            }
        }
        noData
    }
}
