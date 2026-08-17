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
    }
}
