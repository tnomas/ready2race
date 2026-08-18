package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.*

sealed interface TimingError : ServiceError {
    data object StationNotFound : TimingError
    data object StationHasTimeMarks : TimingError
    data object StationNameTaken : TimingError
    data object TimeMarkNotFound : TimingError
    data object TeamNotFound : TimingError
    data object EventMismatch : TimingError
    data object SequenceNotFound : TimingError
    data object SequenceEntryNotFound : TimingError
    data object SequenceAlreadyActive : TimingError
    data object SequenceStateConflict : TimingError
    data object StationNotStartType : TimingError
    data object DeviceTokenNotFound : TimingError
    data object DeviceTokenInvalid : TimingError

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
        TimeMarkNotFound -> ApiError(HttpStatusCode.NotFound, message = "Time mark not found")
        TeamNotFound -> ApiError(HttpStatusCode.NotFound, message = "Competition match team not found")
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
        DeviceTokenNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing device token not found")
        // Never echoes anything about the presented token - an invalid token is invalid, whether it
        // is unknown, revoked, or scoped to another event or station.
        DeviceTokenInvalid -> ApiError(HttpStatusCode.Unauthorized, message = "Invalid timing device token")
    }
}
