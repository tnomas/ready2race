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
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
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
        !checkSortingFree(eventId, request)

        val record = !request.toRecord(userId, eventId)
        val id = !TimingStationRepo.create(record).orDie()
        broadcastAsync(eventId, TimingWsMessage.StationsChanged)
        KIO.ok(ApiResponse.Created(id))
    }

    /**
     * Refuses a SPLIT station whose sorting another split station of the event already holds.
     *
     * The sorting of a split station is not cosmetic: it becomes the `position` of the lap rows its
     * marks write, and that position is unique per boat. Two split stations sorted alike therefore
     * lose one of the two laps without a trace ([TimingLapService] can only keep the first). Refusing
     * it here puts the conflict where it can be fixed - in front of the person editing the stations.
     */
    private fun checkSortingFree(
        eventId: UUID,
        request: TimingStationRequest,
        excludingId: UUID? = null,
    ): App<TimingError, Unit> = KIO.comprehension {
        if (request.type != TimingStationType.SPLIT) return@comprehension KIO.unit
        val taken = !TimingStationRepo.existsByEventAndSplitSorting(eventId, request.sorting, excludingId).orDie()
        !KIO.failOn(taken) { TimingError.StationSortingTaken }
        KIO.unit
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
        !checkSortingFree(eventId, request, excludingId = stationId)

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
    ): App<ServiceError, ApiResponse.Created> =
        createMark(request, eventId, source = "APP_USER", createdBy = userId)

    /**
     * Capture path for timing hardware authenticated by a device token instead of a session.
     *
     * The mark is recorded as [source] `HARDWARE` with no `created_by`: there is no app user behind
     * it, and the station the token is bound to has already been verified by
     * [TimingDeviceTokenService.validate] before this is called.
     */
    fun createHardwareTimeMark(
        request: CreateTimeMarkRequest,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> =
        createMark(request, eventId, source = "HARDWARE", createdBy = null)

    private fun createMark(
        request: CreateTimeMarkRequest,
        eventId: UUID,
        source: String,
        createdBy: UUID?,
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
                source = source,
                status = "ACTIVE",
                createdAt = LocalDateTime.now(),
                createdBy = createdBy,
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
        val assignment = !TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie()
        !TimingTimeMarkRepo.update(timeMarkId) {
            status = "RETRACTED"
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie()
            .onNullFail { TimingError.TimeMarkNotFound }
        // A retracted mark stops counting, so the boat's laps have to be rewritten without it.
        !TimingLapService.syncLaps(eventId, listOfNotNull(assignment?.competitionMatchTeam), userId)
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

        val existing = !TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie()

        val team = request.competitionMatchTeam
        if (team == null) {
            !TimingAssignmentRepo.deleteByTimeMark(timeMarkId).orDie()
        } else {
            val teamEvent = !CompetitionMatchTeamRepo.getEventId(team).orDie()
                .onNullFail { TimingError.TeamNotFound }
            !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }

            // Structural protection, not a nicety: assigning a mark runs the lap sync, and that
            // rewrites the boat's laps from the internal marks alone. On a RaceClocker boat - whose
            // laps come from its feed - a single mis-tap would therefore wipe them. Refusing the
            // assignment is the only place that can prevent it, because by the time syncLaps runs the
            // damage is already the requested state.
            val ready2race = !TimingTeamRepo.isReady2RaceTeam(team).orDie()
            !KIO.failOn(!ready2race) { TimingError.WrongTimingSystem }

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
        // Both sides of a re-assignment are affected: the boat that loses the mark and the one that
        // gains it. A split mark becomes (or stops being) one of their laps, and a start mark shifts
        // all of them.
        !TimingLapService.syncLaps(eventId, listOfNotNull(existing?.competitionMatchTeam, team), userId)
        broadcastAsync(eventId, TimingWsMessage.AssignmentChanged(timeMarkId, request.competitionMatchTeam))
        noData
    }

    /**
     * The explicit "Zeiten löschen" action: physically removes RETRACTED marks of the event, or of
     * [stationId] alone.
     *
     * This is the only path that ever deletes a time mark (core principle: no timestamp is lost by
     * accident). ACTIVE marks are never touched, whatever is requested - retracting a mark first is
     * the deliberate step that makes it deletable.
     */
    fun deleteRetractedMarks(
        eventId: UUID,
        stationId: UUID?,
    ): App<ServiceError, ApiResponse.Dto<DeletedTimeMarksDto>> = KIO.comprehension {
        if (stationId != null) {
            val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
            !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }
        }

        val ids = !TimingTimeMarkRepo.getRetractedIds(eventId, stationId).orDie()
        if (ids.isNotEmpty()) {
            !TimingTimeMarkRepo.deleteByIds(ids).orDie()
            broadcastAsync(eventId, TimingWsMessage.TimesDeleted(ids))
        }
        KIO.ok(ApiResponse.Dto(DeletedTimeMarksDto(ids)))
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

    fun getTeams(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val records = !TimingTeamRepo.getByEvent(eventId).orDie()

        val teams = records.groupBy { it[COMPETITION_MATCH_TEAM.ID] }
            .mapNotNull { (teamId, groupedRecords) ->
                if (teamId == null) return@mapNotNull null
                val first = groupedRecords.first()
                TimingTeamDto(
                    competitionMatchTeam = teamId,
                    startNumber = first[COMPETITION_MATCH_TEAM.START_NUMBER],
                    teamName = first.get("team_name", String::class.java),
                    clubName = first.get("club_name", String::class.java),
                    participantNames = groupedRecords.mapNotNull { record ->
                        val firstname = record[PARTICIPANT.FIRSTNAME]
                        val lastname = record[PARTICIPANT.LASTNAME]
                        if (firstname == null && lastname == null) {
                            null
                        } else {
                            listOfNotNull(firstname, lastname).joinToString(" ")
                        }
                    },
                    competitionName = first.get("competition_name", String::class.java),
                    matchName = first.get("match_name", String::class.java),
                )
            }

        KIO.ok(ApiResponse.ListDto(teams))
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
