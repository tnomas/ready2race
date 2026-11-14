package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.calls.responses.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Welche Materialfehler das Frontend erklären muss: Jeder Fall, den eine Person über die
 * Oberfläche auslösen kann (Meldeformular, Anbieter-Dashboard, Verwaltung), trägt einen eigenen
 * Code. Ohne Code bleiben nur die 404-Fälle und die Schutzprüfungen, die die Oberfläche gar nicht
 * erst anbietet (fremdes Stück, falsche Art, zwei Angebote derselben Art in einer Liste) - dort
 * ist „unerwarteter Fehler“ die ehrliche Antwort.
 */
class MaterialErrorTest {

    private val explained = mapOf(
        MaterialError.ProviderNameTaken to ErrorCode.MATERIAL_PROVIDER_NAME_TAKEN,
        MaterialError.ProviderInUse to ErrorCode.MATERIAL_PROVIDER_IN_USE,
        MaterialError.ProviderHasUsers to ErrorCode.MATERIAL_PROVIDER_HAS_USERS,
        MaterialError.TypeNameTaken to ErrorCode.MATERIAL_TYPE_NAME_TAKEN,
        MaterialError.TypeInUse to ErrorCode.MATERIAL_TYPE_IN_USE,
        MaterialError.ItemNumberTaken to ErrorCode.MATERIAL_ITEM_NUMBER_TAKEN,
        MaterialError.ItemInUse to ErrorCode.MATERIAL_ITEM_IN_USE,
        MaterialError.NotInvited to ErrorCode.MATERIAL_PROVIDER_NOT_INVITED,
        MaterialError.OfferTypeTaken to ErrorCode.MATERIAL_OFFER_TYPE_TAKEN,
        MaterialError.OfferInUse to ErrorCode.MATERIAL_OFFER_IN_USE,
        MaterialError.RequestsClosed to ErrorCode.MATERIAL_REQUESTS_CLOSED,
        MaterialError.TypeNotDemanded to ErrorCode.MATERIAL_TYPE_NOT_DEMANDED,
        MaterialError.RequestNotConfirmed to ErrorCode.MATERIAL_REQUEST_NOT_CONFIRMED,
        MaterialError.MatchNotOfRegistration to ErrorCode.MATERIAL_MATCH_NOT_OF_REGISTRATION,
        MaterialError.PhotoTooLarge to ErrorCode.MATERIAL_PHOTO_TOO_LARGE,
        MaterialError.PhotoInvalidType to ErrorCode.MATERIAL_PHOTO_INVALID_TYPE,
        MaterialError.InvalidOutageWindow to ErrorCode.MATERIAL_INVALID_OUTAGE_WINDOW,
    )

    private val unexplained = listOf(
        MaterialError.ProviderNotFound,
        MaterialError.TypeNotFound,
        MaterialError.ItemNotFound,
        MaterialError.EventNotFound,
        MaterialError.OfferNotFound,
        MaterialError.RegistrationNotFound,
        MaterialError.RequestNotFound,
        MaterialError.DamageNotFound,
        MaterialError.PhotoNotFound,
        MaterialError.DuplicateTypeForRegistration,
        MaterialError.WrongItemType,
        MaterialError.ItemNotOfProvider,
    )

    @Test
    fun everyUserFacingReasonHasItsOwnCode() {
        explained.forEach { (error, code) -> assertEquals(code, error.respond().errorCode, error.toString()) }
        assertEquals(explained.size, explained.values.toSet().size, "Codes müssen eindeutig sein")
    }

    @Test
    fun theRestStaysWithoutCode() {
        unexplained.forEach { assertNull(it.respond().errorCode, it.toString()) }
    }

    /** Neue Fälle müssen in eine der beiden Listen - sonst fällt die Entscheidung still weg. */
    @Test
    fun everyCaseIsDecided() {
        val all = MaterialError::class.sealedSubclasses.mapNotNull { it.objectInstance }.toSet()
        assertEquals(all, explained.keys + unexplained.toSet())
    }
}
