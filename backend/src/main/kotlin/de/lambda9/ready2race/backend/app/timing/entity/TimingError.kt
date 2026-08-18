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
    data object OfficialTimeNotFound : TimingError
    data class PushConflict(val conflicts: List<OfficialTimePushConflictDto>) : TimingError

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
        OfficialTimeNotFound -> ApiError(HttpStatusCode.NotFound, message = "Official time not found")
        // Per-team detail so the Leitstand can name the teams it has to ask about (and offer the
        // force option for the ones that are merely frozen).
        is PushConflict -> ApiError(
            HttpStatusCode.Conflict,
            message = "Official times could not be written to the results of all requested teams",
            details = mapOf("conflicts" to conflicts)
        )
    }
}
