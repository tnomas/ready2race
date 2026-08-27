package de.lambda9.ready2race.backend.app.stream.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.*
import java.util.UUID

sealed interface StreamError : ServiceError {
    data class SceneNotFound(val sceneId: UUID) : StreamError

    /** Kein Konfigurationseintrag für diesen Grafiktyp an dieser Szene — je Szene und Typ existiert höchstens eine Zeile. */
    data class GraphicUnknown(val sceneId: UUID, val type: StreamGraphicType) : StreamError

    /** Der gewählte Platz gehört nicht zu [allowedPlacements] dieses Grafiktyps. */
    data class PlacementNotAllowed(val type: StreamGraphicType, val placement: StreamPlacement) : StreamError

    /**
     * Platzhalter bis Task 8 den Resolver anschließt: die Route von `GET .../view` steht samt
     * Auth (Sitzung ODER Szenen-Token, Zugehörigkeitsprüfung inklusive), liefert aber noch keinen
     * aufgelösten Inhalt.
     */
    data object ViewNotImplemented : StreamError

    override fun respond(): ApiError = when (this) {
        is SceneNotFound -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Scene with id $sceneId not found"
        )

        is GraphicUnknown -> ApiError(
            status = HttpStatusCode.NotFound,
            message = "Graphic type $type not configured for scene $sceneId"
        )

        is PlacementNotAllowed -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Placement $placement is not allowed for graphic type $type",
            errorCode = ErrorCode.STREAM_PLACEMENT_NOT_ALLOWED,
        )

        ViewNotImplemented -> ApiError(
            status = HttpStatusCode.NotImplemented,
            message = "Scene view resolution is not implemented yet",
        )
    }
}
