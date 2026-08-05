package de.lambda9.ready2race.backend.app.documentTemplate.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import io.ktor.http.HttpStatusCode

enum class GapDocumentTemplateError : ServiceError {
    NotFound,
    InvalidFont,
    PlaceholderPageNotSupported;

    override fun respond(): ApiError = when(this) {
        NotFound ->
            ApiError(
                status = HttpStatusCode.NotFound,
                message = "Template not found"
            )

        InvalidFont ->
            ApiError(
                status = HttpStatusCode.BadRequest,
                message = "Font file could not be read"
            )

        PlaceholderPageNotSupported ->
            ApiError(
                status = HttpStatusCode.BadRequest,
                message = "Award certificates have a single page, placeholders must be on page 1"
            )
    }
}