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
    data object DeviceTokenNotFound : TimingError
    data object DeviceTokenInvalid : TimingError
    data object ModeNotFound : TimingError
    data object ModeNameTaken : TimingError
    data object ModeInUse : TimingError
    data object ToneSetNotFound : TimingError
    data object ToneSetNameTaken : TimingError

    /**
     * Eine Veranstaltung mit Ton-Sätzen hat immer genau EINEN Vorgabesatz - der partielle Index
     * verhindert zwei, diese Regel verhindert keinen. Ohne Vorgabe fielen alle Typen, die keinen
     * eigenen Satz gewählt haben, still auf die eingebauten Töne zurück; die Regatta klänge anders,
     * ohne dass jemand einen Ton verstellt hätte. Wer die Vorgabe loswerden will, macht deshalb
     * einen anderen Satz zur Vorgabe, statt diesen zu entwerten oder zu löschen. Nur der LETZTE
     * Satz einer Veranstaltung darf gehen - dann gibt es wieder gar keine Sätze, und der Rückfall
     * auf die eingebauten Töne ist die richtige Antwort.
     */
    data object ToneSetDefaultRequired : TimingError
    data object RoundNotOfCompetition : TimingError
    data object LinkedStationInvalid : TimingError
    data object StationNotCapturing : TimingError

    /**
     * Fehlstart auf einer Partie, deren Zeitnahmetyp ihn abschaltet (oder die gar keinen Typ hat).
     * Kein 404 und kein 400: die Partie gibt es, der Aufruf ist wohlgeformt - er ist an DIESER
     * Partie fachlich nicht zulässig, und das ist ein Konflikt.
     */
    data object FalseStartDisabled : TimingError

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
        DeviceTokenNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing device token not found")
        // Never echoes anything about the presented token - an invalid token is invalid, whether it
        // is unknown, revoked, or scoped to another event or station. Deliberately also the answer
        // when a token is presented on an operation it is not scoped for (a display station's token
        // on a write, an assignment for a mark of another station): the caller learns "this token
        // does not do that", nothing more.
        DeviceTokenInvalid -> ApiError(HttpStatusCode.Unauthorized, message = "Invalid timing device token")
        ModeNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing mode not found")
        ModeNameTaken -> ApiError(
            HttpStatusCode.Conflict,
            message = "A timing mode with this name already exists for this event"
        )
        ModeInUse -> ApiError(
            HttpStatusCode.Conflict,
            message = "This timing mode is still assigned to competitions or rounds"
        )
        ToneSetNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing tone set not found")
        ToneSetNameTaken -> ApiError(
            HttpStatusCode.Conflict,
            message = "A timing tone set with this name already exists for this event"
        )
        ToneSetDefaultRequired -> ApiError(
            HttpStatusCode.Conflict,
            message = "An event with tone sets needs exactly one default - make another tone set the default first"
        )
        RoundNotOfCompetition -> ApiError(
            HttpStatusCode.BadRequest,
            message = "The round does not belong to this competition"
        )
        LinkedStationInvalid -> ApiError(
            HttpStatusCode.BadRequest,
            message = "A display station can only mirror a START station of the same event"
        )
        StationNotCapturing -> ApiError(
            HttpStatusCode.BadRequest,
            message = "Time marks cannot be captured on a display station"
        )
        FalseStartDisabled -> ApiError(
            HttpStatusCode.Conflict,
            message = "The timing mode of this match does not allow a false start"
        )
    }
}
