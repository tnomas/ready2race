package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
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
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val record = !request.toRecord(userId, eventId)
        val id = !TimingStationRepo.create(record).orDie()
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
    ): App<TimingError, ApiResponse.NoData> =
        TimingStationRepo.update(stationId) {
            name = request.name
            type = request.type.name
            sorting = request.sorting
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { TimingError.StationNotFound }
            .map { ApiResponse.NoData }

    fun deleteStation(
        stationId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        val hasMarks = !TimingTimeMarkRepo.existsByStation(stationId).orDie()
        !KIO.failOn(hasMarks) { TimingError.StationHasTimeMarks }
        !TimingStationRepo.delete(stationId).orDie()
        noData
    }
}
