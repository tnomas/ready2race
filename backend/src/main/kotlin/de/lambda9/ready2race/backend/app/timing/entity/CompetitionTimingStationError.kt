package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.*

/** Die Fehler der Posten-auf-der-Strecke-Zuordnung eines Wettkampfs. */
sealed interface CompetitionTimingStationError : ServiceError {

    /** Der Wettkampf gehört nicht zu dieser Veranstaltung (oder es gibt ihn gar nicht). */
    data object CompetitionNotFound : CompetitionTimingStationError

    /**
     * Mindestens ein Posten gehört nicht zu dieser Veranstaltung. Der Fremdschlüssel allein
     * hindert nicht daran, den Posten einer fremden Regatta anzuhängen — er kennt die
     * Veranstaltung nicht.
     */
    data object StationNotFound : CompetitionTimingStationError

    /**
     * Derselbe Posten zweimal in einem PUT. Zwei Zeilen kann es dafür nicht geben (Unique-Index),
     * das Schreiben würde den zweiten Meter also still über den ersten legen — welcher der beiden
     * gemeint war, weiß niemand. Also fragen statt raten.
     */
    data object DuplicateStation : CompetitionTimingStationError

    override fun respond(): ApiError = when (this) {
        CompetitionNotFound -> ApiError(HttpStatusCode.NotFound, message = "Competition not found for this event")
        StationNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing station not found for this event")
        DuplicateStation -> ApiError(
            HttpStatusCode.Conflict,
            message = "The same timing station was listed twice for this competition"
        )
    }
}
