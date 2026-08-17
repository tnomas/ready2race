package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.*

sealed interface TimingError : ServiceError {
    data object StationNotFound : TimingError
    data object StationHasTimeMarks : TimingError
    data object TimeMarkNotFound : TimingError
    data object EventMismatch : TimingError

    override fun respond(): ApiError = when (this) {
        StationNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing station not found")
        StationHasTimeMarks -> ApiError(
            HttpStatusCode.Conflict,
            message = "Timing station has captured time marks and cannot be deleted"
        )
        TimeMarkNotFound -> ApiError(HttpStatusCode.NotFound, message = "Time mark not found")
        EventMismatch -> ApiError(HttpStatusCode.BadRequest, message = "Resource does not belong to this event")
    }
}
