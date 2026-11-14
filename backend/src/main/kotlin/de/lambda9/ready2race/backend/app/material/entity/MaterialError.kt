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

    /**
     * Dem Anbieter sind noch Konten zugeordnet - erst die Zuordnung über die Nutzerverwaltung
     * lösen (dort greifen die Vergaberegeln für die Materialanbieter-Rolle), dann löschen.
     */
    data object ProviderHasUsers : MaterialError

    data object TypeNotFound : MaterialError
    data object TypeNameTaken : MaterialError

    /** Materialart mit Stücken, Wettkampf-Bedarf oder Angeboten kann nicht gelöscht werden. */
    data object TypeInUse : MaterialError

    data object ItemNotFound : MaterialError

    /** Nummer ist innerhalb desselben Anbieters und derselben Materialart bereits vergeben. */
    data object ItemNumberTaken : MaterialError

    /** Materialstück mit Zuteilungen kann nicht gelöscht werden. */
    data object ItemInUse : MaterialError

    /**
     * Materialstück mit Schadensakte kann nicht gelöscht werden - die Akte ist historisch
     * (Verursacher-Momentaufnahme, Fotos). Ausgemustert wird über den Status RETIRED.
     */
    data object ItemHasDamages : MaterialError

    /** Die Materialart eines Stücks mit Zuteilungen bleibt fest - sonst hinge ein Stück falscher Art an der Anfrage. */
    data object ItemTypeLocked : MaterialError

    /** Ein ausgemustertes Stück (RETIRED) kann nicht neu zugeteilt werden. */
    data object ItemRetired : MaterialError

    data object EventNotFound : MaterialError

    /** Anbieter ist zu dieser Veranstaltung nicht eingeladen - kein Angebot möglich. */
    data object NotInvited : MaterialError

    data object OfferNotFound : MaterialError

    /** Anbieter hat für diese Materialart an dieser Veranstaltung bereits ein Angebot. */
    data object OfferTypeTaken : MaterialError

    /** Angebot mit Anfragen kann nicht gelöscht werden. */
    data object OfferInUse : MaterialError

    /**
     * Die Materialart eines Angebots mit Anfragen bleibt fest - sonst hingen Anfragen an einer
     * Art, die der Wettkampf nicht verlangt, mit Menge und Zuteilungen der alten Art.
     */
    data object OfferTypeLocked : MaterialError

    /** Meldung existiert nicht, gehört nicht zur Veranstaltung, oder (bei OWN) nicht zum eigenen Verein. */
    data object RegistrationNotFound : MaterialError

    /** Anbieter hat neue Anfragen für diese Veranstaltung gesperrt - bestehende bleiben unberührt, Rückzug bleibt erlaubt. */
    data object RequestsClosed : MaterialError

    /**
     * Eine Meldung mit aktiver Materialanfrage soll verschwinden (Team entfernt, Wettkampf
     * abgewählt), aber der Anbieter hat die Vergabe geschlossen - wie beim Rückzug gesperrt.
     */
    data object RemovalRequestsClosed : MaterialError

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

    /** Dasselbe Paar aus Stück und Lauf steht zweimal in einer Zuteilungsliste. */
    data object DuplicateAssignment : MaterialError

    data object DamageNotFound : MaterialError

    data object PhotoNotFound : MaterialError

    /** Ein einzelnes Foto überschreitet MATERIAL_PHOTO_MAX_BYTES. */
    data object PhotoTooLarge : MaterialError

    /** Die Datei ist keines der erlaubten Bildformate (JPEG, PNG, WebP, GIF, HEIC/HEIF). */
    data object PhotoInvalidType : MaterialError

    /** Ausfallende liegt vor Ausfallbeginn. */
    data object InvalidOutageWindow : MaterialError

    override fun respond(): ApiError = when (this) {
        ProviderNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material provider not found")
        ProviderNameTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider name already taken",
            errorCode = ErrorCode.MATERIAL_PROVIDER_NAME_TAKEN,
        )
        ProviderInUse -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider is in use",
            errorCode = ErrorCode.MATERIAL_PROVIDER_IN_USE,
        )
        ProviderHasUsers -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider still has assigned users",
            errorCode = ErrorCode.MATERIAL_PROVIDER_HAS_USERS,
        )

        TypeNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material type not found")
        TypeNameTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type name already taken",
            errorCode = ErrorCode.MATERIAL_TYPE_NAME_TAKEN,
        )
        TypeInUse -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type is in use",
            errorCode = ErrorCode.MATERIAL_TYPE_IN_USE,
        )

        ItemNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material item not found")
        ItemNumberTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material item number already taken",
            errorCode = ErrorCode.MATERIAL_ITEM_NUMBER_TAKEN,
        )
        ItemInUse -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material item is in use",
            errorCode = ErrorCode.MATERIAL_ITEM_IN_USE,
        )
        ItemHasDamages -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material item has damage records - retire it instead",
            errorCode = ErrorCode.MATERIAL_ITEM_HAS_DAMAGES,
        )
        ItemTypeLocked -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type of an assigned item cannot change",
            errorCode = ErrorCode.MATERIAL_ITEM_TYPE_LOCKED,
        )
        ItemRetired -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Retired material item cannot be assigned",
            errorCode = ErrorCode.MATERIAL_ITEM_RETIRED,
        )

        EventNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Event not found")
        NotInvited -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider is not invited to this event",
            errorCode = ErrorCode.MATERIAL_PROVIDER_NOT_INVITED,
        )
        OfferNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material offer not found")
        OfferTypeTaken -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material offer for this type already exists",
            errorCode = ErrorCode.MATERIAL_OFFER_TYPE_TAKEN,
        )
        OfferInUse -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material offer is in use",
            errorCode = ErrorCode.MATERIAL_OFFER_IN_USE,
        )
        OfferTypeLocked -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type of an offer with requests cannot change",
            errorCode = ErrorCode.MATERIAL_OFFER_TYPE_LOCKED,
        )

        RegistrationNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Competition registration not found")
        RequestsClosed -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material provider has closed requests for this event",
            errorCode = ErrorCode.MATERIAL_REQUESTS_CLOSED,
        )
        RemovalRequestsClosed -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Registration has a material request and the provider has closed requests",
            errorCode = ErrorCode.MATERIAL_REMOVAL_REQUESTS_CLOSED,
        )
        TypeNotDemanded -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material type is not demanded by this competition",
            errorCode = ErrorCode.MATERIAL_TYPE_NOT_DEMANDED,
        )
        DuplicateTypeForRegistration -> ApiError(status = HttpStatusCode.Conflict, message = "At most one offer per material type is allowed")

        RequestNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material request not found")
        RequestNotConfirmed -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Material request is not confirmed",
            errorCode = ErrorCode.MATERIAL_REQUEST_NOT_CONFIRMED,
        )
        WrongItemType -> ApiError(status = HttpStatusCode.Conflict, message = "Material item does not match the offer's type")
        MatchNotOfRegistration -> ApiError(
            status = HttpStatusCode.Conflict,
            message = "Competition match does not contain this registration",
            errorCode = ErrorCode.MATERIAL_MATCH_NOT_OF_REGISTRATION,
        )
        ItemNotOfProvider -> ApiError(status = HttpStatusCode.Conflict, message = "Material item does not belong to this provider")
        DuplicateAssignment -> ApiError(
            status = HttpStatusCode.UnprocessableEntity,
            message = "The same item and match appear twice in the assignments",
            errorCode = ErrorCode.MATERIAL_DUPLICATE_ASSIGNMENT,
        )

        DamageNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material damage not found")
        PhotoNotFound -> ApiError(status = HttpStatusCode.NotFound, message = "Material damage photo not found")
        PhotoTooLarge -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Material damage photo is too large",
            errorCode = ErrorCode.MATERIAL_PHOTO_TOO_LARGE,
        )
        PhotoInvalidType -> ApiError(
            status = HttpStatusCode.UnsupportedMediaType,
            message = "Material damage photo must be a JPEG, PNG, WebP, GIF or HEIC image",
            errorCode = ErrorCode.MATERIAL_PHOTO_INVALID_TYPE,
        )
        InvalidOutageWindow -> ApiError(
            status = HttpStatusCode.BadRequest,
            message = "Outage window end lies before its start",
            errorCode = ErrorCode.MATERIAL_INVALID_OUTAGE_WINDOW,
        )
    }
}
