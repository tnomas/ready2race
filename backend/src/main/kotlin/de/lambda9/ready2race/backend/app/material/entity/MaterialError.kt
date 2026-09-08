package de.lambda9.ready2race.backend.app.material.entity

import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.calls.responses.ApiError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import io.ktor.http.HttpStatusCode

sealed interface MaterialError : ServiceError {

    data object ProviderNotFound : MaterialError
    data object ProviderNameTaken : MaterialError

    /** Anbieter mit Stücken oder Einladungen zu Veranstaltungen kann nicht gelöscht werden. */
    data object ProviderInUse : MaterialError

    data object TypeNotFound : MaterialError
    data object TypeNameTaken : MaterialError

    /** Materialart mit Stücken, Wettkampf-Bedarf oder Angeboten kann nicht gelöscht werden. */
    data object TypeInUse : MaterialError

    data object ItemNotFound : MaterialError

    /** Nummer ist innerhalb desselben Anbieters und derselben Materialart bereits vergeben. */
    data object ItemNumberTaken : MaterialError

    /** Materialstück mit Zuteilungen kann nicht gelöscht werden. */
    data object ItemInUse : MaterialError

    override fun respond(): ApiError = when (this) {
        ProviderNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material provider not found")
        ProviderNameTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider name already taken",
            errorCode = ErrorCode.MATERIAL_PROVIDER_NAME_TAKEN,
        )
        ProviderInUse -> ApiError(status = HttpStatusCode.Conflict, message = "Material provider is in use")

        TypeNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material type not found")
        TypeNameTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type name already taken",
            errorCode = ErrorCode.MATERIAL_TYPE_NAME_TAKEN,
        )
        TypeInUse -> ApiError(status = HttpStatusCode.Conflict, message = "Material type is in use")

        ItemNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material item not found")
        ItemNumberTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material item number already taken",
            errorCode = ErrorCode.MATERIAL_ITEM_NUMBER_TAKEN,
        )
        ItemInUse -> ApiError(status = HttpStatusCode.Conflict, message = "Material item is in use")
    }
}
