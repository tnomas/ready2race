package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*

sealed interface TimingProfileError : ServiceError {

    /** Das angewählte Profil gehört zu einer anderen Veranstaltung oder existiert nicht. */
    data object ProfileNotFound : TimingProfileError

    /**
     * Ein Rennen an einer Veranstaltung mit interner Zeitnahme (oder umgekehrt). Die Art des
     * Profils folgt zwingend `event.timing_system` — sonst stünde in der Datenbank eine Zuordnung,
     * die niemand mehr auflösen kann.
     */
    data object KindMismatch : TimingProfileError

    /** Runde gehört nicht zum Wettkampf, Partie nicht zur Runde, oder der Pfad hat eine Lücke. */
    data object ScopeInvalid : TimingProfileError

    override fun respond(): ApiError = when (this) {
        ProfileNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Timing profile not found for this event",
        )

        KindMismatch -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "The timing profile does not match the timing system of this event",
            errorCode = ErrorCode.TIMING_PROFILE_KIND_MISMATCH,
        )

        ScopeInvalid -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "The assignment scope is not a valid competition/round/match path",
            errorCode = ErrorCode.TIMING_PROFILE_SCOPE_INVALID,
        )
    }
}
