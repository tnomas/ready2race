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
     * Eine ANZEIGE steht nie auf der Strecke. Jede Zeile dieser Tabelle IST ein Punkt, an dem eine
     * Zwischenzeit entsteht - eine Anzeige erfasst aber nie selbst (siehe [TimingStationType], und
     * ebenso weisen die Zeitmarken-Erfassung und die Geräte-Tokens sie ab). Ein Anzeige-Posten bei
     * 500 m wäre eine Zwischenzeit, die am Renntag dauerhaft leer bleibt.
     */
    data object StationNotCapturing : CompetitionTimingStationError

    /**
     * Derselbe Posten zweimal in einem PUT. Zwei Zeilen kann es dafür nicht geben (Unique-Index),
     * das Schreiben würde den zweiten Meter also still über den ersten legen — welcher der beiden
     * gemeint war, weiß niemand. Also fragen statt raten.
     */
    data object DuplicateStation : CompetitionTimingStationError

    override fun respond(): ApiError = when (this) {
        CompetitionNotFound -> ApiError(HttpStatusCode.NotFound, message = "Competition not found for this event")
        StationNotFound -> ApiError(HttpStatusCode.NotFound, message = "Timing station not found for this event")
        StationNotCapturing -> ApiError(
            HttpStatusCode.BadRequest,
            message = "A display station cannot stand on the course - it never captures a time mark"
        )
        DuplicateStation -> ApiError(
            HttpStatusCode.Conflict,
            message = "The same timing station was listed twice for this competition"
        )
    }
}
