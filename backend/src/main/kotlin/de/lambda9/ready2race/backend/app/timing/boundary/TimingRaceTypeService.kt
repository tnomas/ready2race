package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.TimingRaceTypeRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingRaceTypeResolution
import de.lambda9.ready2race.backend.app.timing.control.TimingStationRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.control.toRecord
import de.lambda9.ready2race.backend.app.timing.entity.CurrentRaceTypeDto
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingRaceTypeRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.LocalDateTime
import java.util.UUID

/**
 * Race types ("Renntypen"): the reusable answer to "how is this run started, and is it measured at
 * all". Configured once per event, assigned to setup rounds, and read back by the boards - so a
 * timekeeper does not have to be told the mode for every heat.
 */
object TimingRaceTypeService {

    fun addRaceType(
        request: TimingRaceTypeRequest,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !TimingRaceTypeRepo.existsByEventAndName(eventId, request.name).orDie()
        !KIO.failOn(nameTaken) { TimingError.RaceTypeNameTaken }

        val id = !TimingRaceTypeRepo.create(request.toRecord(userId, eventId)).orDie()
        KIO.ok(ApiResponse.Created(id))
    }

    fun getRaceTypes(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val raceTypes = !TimingRaceTypeRepo.getByEvent(eventId).orDie()
        // Sorted by the operator's own order first; the name only breaks ties, so a list that was
        // never sorted by hand still reads sensibly.
        KIO.ok(ApiResponse.ListDto(raceTypes.sortedWith(compareBy({ it.sorting ?: 0 }, { it.name })).map { it.toDto() }))
    }

    fun updateRaceType(
        request: TimingRaceTypeRequest,
        userId: UUID,
        raceTypeId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val raceType = !TimingRaceTypeRepo.get(raceTypeId).orDie().onNullFail { TimingError.RaceTypeNotFound }
        !KIO.failOn(raceType.event != eventId) { TimingError.EventMismatch }

        val nameTaken = !TimingRaceTypeRepo.existsByEventAndName(eventId, request.name, excludingId = raceTypeId).orDie()
        !KIO.failOn(nameTaken) { TimingError.RaceTypeNameTaken }

        !TimingRaceTypeRepo.update(raceTypeId) {
            name = request.name
            timed = request.timed
            startMode = request.startMode.name
            intervalMillis = request.intervalMillis.takeIf { request.startMode == SequenceMode.INTERVAL }
            leadInMillis = request.leadInMillis
            sorting = request.sorting
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie().onNullFail { TimingError.RaceTypeNotFound }
        noData
    }

    /**
     * Deleting a race type does not touch the rounds that used it: the FK is `on delete set null`,
     * so they simply lose their preset. A race type is a convenience, never a structural part of a
     * setup - refusing the delete because some round still points at it would make it one.
     */
    fun deleteRaceType(
        raceTypeId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val raceType = !TimingRaceTypeRepo.get(raceTypeId).orDie().onNullFail { TimingError.RaceTypeNotFound }
        !KIO.failOn(raceType.event != eventId) { TimingError.EventMismatch }

        !TimingRaceTypeRepo.delete(raceTypeId).orDie()
        noData
    }

    /**
     * The race type that applies to what [stationId]'s board is about to do, resolved from the
     * event's schedule ([TimingRaceTypeResolution]).
     *
     * [stationId] is validated but does not narrow the search: stations are not tied to rounds, so
     * the "next thing to happen" is an event-level question. Passing the station keeps the endpoint
     * honest about who is asking (and leaves room to narrow it later without a contract change).
     */
    fun getCurrentRaceType(
        eventId: UUID,
        stationId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val matches = !TimingRaceTypeRepo.getScheduledMatches(eventId).orDie()
        val raceTypeId = TimingRaceTypeResolution.resolve(matches)
        val raceType = if (raceTypeId == null) null else !TimingRaceTypeRepo.get(raceTypeId).orDie()
        KIO.ok(ApiResponse.Dto(CurrentRaceTypeDto(raceType?.toDto())))
    }
}
