package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.*

sealed interface TimingError : ServiceError {
    data object StationNotFound : TimingError
    data object StationHasTimeMarks : TimingError
    data object StationNameTaken : TimingError
    data object StationSortingTaken : TimingError
    data object RaceTypeNotFound : TimingError
    data object RaceTypeNameTaken : TimingError
    data object TimeMarkNotFound : TimingError
    data object TeamNotFound : TimingError
    data object WrongTimingSystem : TimingError
    data object EventMismatch : TimingError
    data object SequenceNotFound : TimingError
    data object SequenceEntryNotFound : TimingError
    data object SequenceAlreadyActive : TimingError
    data object SequenceStateConflict : TimingError
    data object StationNotStartType : TimingError
    data object DeviceTokenNotFound : TimingError
    data object DeviceTokenInvalid : TimingError

    /**
     * At least one team of a push could not be written. All or nothing: the whole call fails with
     * the per-team reasons attached, so an operator never ends up with half a round pushed.
     */
    data class PushConflict(val conflicts: List<TimingResultPushConflictDto>) : TimingError

    override fun respond(): ApiError = when (this) {
        StationNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing station not found")
        StationHasTimeMarks -> ApiError(
            HttpStatusCode.Conflict,
            message = "Timing station has captured time marks and cannot be deleted"
        )
        StationNameTaken -> ApiError(
            HttpStatusCode.Conflict,
            message = "A timing station with this name already exists for this event"
        )
        // The sorting of a SPLIT station IS the `position` of the lap rows its marks write, and that
        // position is unique per boat. Two split stations sharing a sorting would silently drop one
        // of the two laps (see TimingLapService.lapRecords), so the collision is refused where it is
        // still visible - in the station admin.
        StationSortingTaken -> ApiError(
            HttpStatusCode.Conflict,
            message = "Another split timing station of this event already uses this sorting"
        )
        // Also the answer when a competition setup assigns a race type of another event: the id is
        // not a race type OF THIS EVENT, and saying more would leak another event's configuration.
        RaceTypeNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing race type not found")
        RaceTypeNameTaken -> ApiError(
            HttpStatusCode.Conflict,
            message = "A timing race type with this name already exists for this event"
        )
        TimeMarkNotFound -> ApiError(HttpStatusCode.NotFound, message = "Time mark not found")
        TeamNotFound -> ApiError(HttpStatusCode.NotFound, message = "Competition match team not found")
        // Structural protection for teams that are timed elsewhere: a RaceClocker boat must never
        // receive an internal mark, because the lap sync would rewrite the laps its feed just wrote.
        WrongTimingSystem -> ApiError(
            HttpStatusCode.Conflict,
            message = "This team's competition is not timed with the internal timing system"
        )
        EventMismatch -> ApiError(HttpStatusCode.BadRequest, message = "Resource does not belong to this event")
        SequenceNotFound -> ApiError(HttpStatusCode.NotFound, message = "Start sequence not found")
        SequenceEntryNotFound -> ApiError(HttpStatusCode.NotFound, message = "Start sequence entry not found")
        SequenceAlreadyActive -> ApiError(
            HttpStatusCode.Conflict,
            message = "This timing station already has an armed or running start sequence"
        )
        SequenceStateConflict -> ApiError(
            HttpStatusCode.Conflict,
            message = "The start sequence is not in a state that allows this operation"
        )
        StationNotStartType -> ApiError(
            HttpStatusCode.BadRequest,
            message = "Start sequences require a timing station of type START"
        )
        is PushConflict -> ApiError(
            HttpStatusCode.Conflict,
            message = "Timing results could not be written for all requested teams",
            details = mapOf("conflicts" to conflicts)
        )
        DeviceTokenNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing device token not found")
        // Never echoes anything about the presented token - an invalid token is invalid, whether it
        // is unknown, revoked, or scoped to another event or station.
        DeviceTokenInvalid -> ApiError(HttpStatusCode.Unauthorized, message = "Invalid timing device token")
    }
}
