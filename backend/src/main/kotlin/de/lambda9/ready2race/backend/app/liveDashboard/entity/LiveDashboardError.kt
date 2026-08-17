package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*
import java.util.UUID

sealed interface LiveDashboardError : ServiceError {
    data class EventNotFound(val eventId: UUID) : LiveDashboardError
    data class TeamNotFound(val teamId: UUID) : LiveDashboardError
    data class NoteNotFound(val noteId: UUID) : LiveDashboardError

    /** Event steht auf chainProgressionMode = REGATTABUERO: Beenden geht dort nur über den Zeitplan. */
    data object FinishReservedForOffice : LiveDashboardError

    /**
     * setMatchClarification - ein beendeter Lauf lässt sich nicht mehr in Klärung setzen. Beenden
     * IST die Freigabe: `finished_at` schlägt die Klärung in
     * [de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardLogic.deriveMatchState],
     * der Lauf bliebe also FINISHED, während beide Spalten still gesetzt wären - und weil beide
     * Oberflächen den Knopf „Klärung aufheben" an den Zustand CLARIFICATION hängen, gäbe es keinen
     * Weg zurück. Wer einen beendeten Lauf wieder streitig stellen will, setzt ihn zurück.
     */
    data class MatchAlreadyFinished(val matchId: UUID) : LiveDashboardError

    override fun respond(): ApiError = when (this) {
        is EventNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Event with id $eventId not found"
        )

        is TeamNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Team with id $teamId not found in this match"
        )

        // Deckt auch den Fall "Notiz existiert, gehört aber zu einem anderen Boot" ab - für den
        // Aufrufer ist beides dasselbe: unter diesem Pfad gibt es die Notiz nicht.
        is NoteNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Note with id $noteId not found for this team"
        )

        // Der häufigste Fehlerfall am Steg: das Steg-Personal drückt "Beenden", die Veranstaltung
        // steht aber auf REGATTABUERO. Bisher las sich das als "Der Lauf konnte nicht geändert
        // werden" - also wie eine Störung, obwohl alles in Ordnung ist und schlicht jemand anderes
        // zuständig ist.
        FinishReservedForOffice -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Finishing is handled by the regatta office for this event",
            errorCode = ErrorCode.LIVE_DASHBOARD_FINISH_RESERVED_FOR_OFFICE,
        )

        is MatchAlreadyFinished -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Match $matchId is already finished and cannot be put into clarification",
            errorCode = ErrorCode.LIVE_DASHBOARD_MATCH_ALREADY_FINISHED,
        )
    }
}
