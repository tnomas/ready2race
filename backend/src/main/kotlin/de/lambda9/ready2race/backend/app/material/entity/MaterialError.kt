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

    data object EventNotFound : MaterialError

    /** Anbieter ist zu dieser Veranstaltung nicht eingeladen - kein Angebot möglich. */
    data object NotInvited : MaterialError

    data object OfferNotFound : MaterialError

    /** Anbieter hat für diese Materialart an dieser Veranstaltung bereits ein Angebot. */
    data object OfferTypeTaken : MaterialError

    /** Angebot mit Anfragen kann nicht gelöscht werden. */
    data object OfferInUse : MaterialError

    /** Meldung existiert nicht, gehört nicht zur Veranstaltung, oder (bei OWN) nicht zum eigenen Verein. */
    data object RegistrationNotFound : MaterialError

    /** Anbieter hat neue Anfragen für diese Veranstaltung gesperrt - bestehende bleiben unberührt, Rückzug bleibt erlaubt. */
    data object RequestsClosed : MaterialError

    /** Die Materialart des Angebots steht nicht im Bedarf des Wettkampfs dieser Meldung. */
    data object TypeNotDemanded : MaterialError

    /** Zwei Angebote derselben Materialart in einer Anfrage-Liste - höchstens eines je Art. */
    data object DuplicateTypeForRegistration : MaterialError

    /** Anfrage existiert nicht, gehört nicht zu einem Angebot dieses Anbieters an dieser Veranstaltung, oder ist WITHDRAWN. */
    data object RequestNotFound : MaterialError

    /** Zuteilung setzt eine bestätigte Anfrage voraus (Spec Abschnitt 9). */
    data object RequestNotConfirmed : MaterialError

    /** Zugeteiltes Stück gehört nicht der Materialart des Angebots. */
    data object WrongItemType : MaterialError

    /** Die Ausnahme je Lauf verlangt, dass die Meldung in diesem Lauf tatsächlich startet. */
    data object MatchNotOfRegistration : MaterialError

    /** Zugeteiltes Stück gehört nicht dem Anbieter der Anfrage. */
    data object ItemNotOfProvider : MaterialError

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

        EventNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Event not found")
        NotInvited -> ApiError(status = HttpStatusCode.Conflict, message = "Material provider is not invited to this event")
        OfferNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material offer not found")
        OfferTypeTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material offer for this type already exists",
            errorCode = ErrorCode.MATERIAL_OFFER_TYPE_TAKEN,
        )
        OfferInUse -> ApiError(status = HttpStatusCode.Conflict, message = "Material offer is in use")

        RegistrationNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Competition registration not found")
        RequestsClosed -> ApiError(status = HttpStatusCode.Conflict, message = "Material provider has closed requests for this event")
        TypeNotDemanded -> ApiError(status = HttpStatusCode.Conflict, message = "Material type is not demanded by this competition")
        DuplicateTypeForRegistration -> ApiError(status = HttpStatusCode.Conflict, message = "At most one offer per material type is allowed")

        RequestNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material request not found")
        RequestNotConfirmed -> ApiError(status = HttpStatusCode.Conflict, message = "Material request is not confirmed")
        WrongItemType -> ApiError(status = HttpStatusCode.Conflict, message = "Material item does not match the offer's type")
        MatchNotOfRegistration -> ApiError(status = HttpStatusCode.Conflict, message = "Competition match does not contain this registration")
        ItemNotOfProvider -> ApiError(status = HttpStatusCode.Conflict, message = "Material item does not belong to this provider")
    }
}
