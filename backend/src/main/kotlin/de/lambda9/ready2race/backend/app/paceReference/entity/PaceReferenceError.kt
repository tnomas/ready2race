package de.lambda9.ready2race.backend.app.paceReference.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.HttpStatusCode

enum class PaceReferenceError : ServiceError {
    NotFound,

    /**
     * Über den Namen wird die Bezugsgröße am Wettkampf ausgewählt — zwei gleiche wären dort nicht
     * mehr auseinanderzuhalten. Der Unique-Index allein liefert nur einen rohen Datenbankfehler,
     * deshalb der eigene Code.
     */
    NameTaken;

    override fun respond(): ApiError = when (this) {
        NotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Pace reference not found"
        )

        NameTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Pace reference name already taken",
            errorCode = ErrorCode.PACE_REFERENCE_NAME_TAKEN,
        )
    }
}
