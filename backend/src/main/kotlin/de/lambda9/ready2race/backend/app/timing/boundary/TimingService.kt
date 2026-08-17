package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

object TimingService {

    fun addStation(
        request: TimingStationRequest,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !TimingStationRepo.existsByEventAndName(eventId, request.name).orDie()
        !KIO.failOn(nameTaken) { TimingError.StationNameTaken }

        val record = !request.toRecord(userId, eventId)
        val id = !TimingStationRepo.create(record).orDie()
        broadcastAsync(eventId, TimingWsMessage.StationsChanged)
        KIO.ok(ApiResponse.Created(id))
    }

    fun getStations(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { ApiResponse.ListDto(it) }
    }

    fun updateStation(
        request: TimingStationRequest,
        userId: UUID,
        stationId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val nameTaken = !TimingStationRepo.existsByEventAndName(eventId, request.name, excludingId = stationId).orDie()
        !KIO.failOn(nameTaken) { TimingError.StationNameTaken }

        !TimingStationRepo.update(stationId) {
            name = request.name
            type = request.type.name
            sorting = request.sorting
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { TimingError.StationNotFound }
        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    fun deleteStation(
        stationId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val hasMarks = !TimingTimeMarkRepo.existsByStation(stationId).orDie()
        !KIO.failOn(hasMarks) { TimingError.StationHasTimeMarks }
        !TimingStationRepo.delete(stationId).orDie()
        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    fun createTimeMark(
        request: CreateTimeMarkRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val exists = !TimingTimeMarkRepo.exists(request.id).orDie()
        if (exists) {
            KIO.ok(ApiResponse.Created(request.id))
        } else {
            val station = !TimingStationRepo.get(request.station).orDie()
                .onNullFail { TimingError.StationNotFound }
            !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

            val record = TimingTimeMarkRecord(
                id = request.id,
                event = eventId,
                station = request.station,
                timestampMillis = request.timestampMillis,
                source = "APP_USER",
                status = "ACTIVE",
                createdAt = LocalDateTime.now(),
                createdBy = userId,
            )
            val inserted = !TimingTimeMarkRepo.createIfAbsent(record).orDie()
            if (inserted > 0) {
                broadcastAsync(eventId, TimingWsMessage.TimeMarkCreated(timeMarkDto(record, null)))
            }
            KIO.ok(ApiResponse.Created(request.id))
        }
    }

    fun retractTimeMark(
        timeMarkId: UUID,
        eventId: UUID,
        userId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }
        !TimingTimeMarkRepo.update(timeMarkId) {
            status = "RETRACTED"
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie()
            .onNullFail { TimingError.TimeMarkNotFound }
        broadcastAsync(eventId, TimingWsMessage.TimeMarkRetracted(timeMarkId))
        noData
    }

    fun assignTimeMark(
        request: AssignTimeMarkRequest,
        userId: UUID,
        timeMarkId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }

        val team = request.competitionMatchTeam
        if (team == null) {
            !TimingAssignmentRepo.deleteByTimeMark(timeMarkId).orDie()
        } else {
            val teamEvent = !CompetitionMatchTeamRepo.getEventId(team).orDie()
                .onNullFail { TimingError.TeamNotFound }
            !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }

            val existing = !TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie()
            if (existing == null) {
                !TimingAssignmentRepo.create(
                    TimingAssignmentRecord(
                        id = UUID.randomUUID(),
                        timeMark = timeMarkId,
                        competitionMatchTeam = team,
                        createdAt = LocalDateTime.now(),
                        createdBy = userId,
                        updatedAt = LocalDateTime.now(),
                        updatedBy = userId,
                    )
                ).orDie()
            } else {
                !TimingAssignmentRepo.update(existing.id) {
                    competitionMatchTeam = team
                    updatedAt = LocalDateTime.now()
                    updatedBy = userId
                }.orDie()
            }
        }
        broadcastAsync(eventId, TimingWsMessage.AssignmentChanged(timeMarkId, request.competitionMatchTeam))
        noData
    }

    fun getState(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        val marks = !TimingTimeMarkRepo.getByEvent(eventId).orDie()
        val assignments = !TimingAssignmentRepo.getByTimeMarks(marks.map { it.id }).orDie()
        val assignmentByMark = assignments.associateBy({ it.timeMark }, { it.competitionMatchTeam })

        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { stationDtos ->
            ApiResponse.Dto(
                TimingStateDto(
                    stations = stationDtos,
                    timeMarks = marks.sortedBy { it.timestampMillis }
                        .map { timeMarkDto(it, assignmentByMark[it.id]) },
                )
            )
        }
    }

    // Broadcasts must never be visible before the surrounding transaction committed - a client that
    // refetches `/timing/state` on another connection would otherwise see pre-commit data, and a
    // rollback would emit a phantom event. AfterCommit buffers the enqueue until respondKIO has
    // committed and responded (and runs it immediately for non-HTTP callers).
    private fun broadcastAsync(eventId: UUID, message: TimingWsMessage) {
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, message)
        }
    }
}
