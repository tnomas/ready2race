package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.material.boundary.MaterialService
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialError
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferRequest
import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeRequest
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.testing.testComprehension
import kotlin.test.Test
import kotlin.test.assertEquals

class MaterialServiceTest {

    @Test
    fun providerTypeItemRoundTrip() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        val itemId = (!MaterialService.addItem(providerId, MaterialItemRequest(typeId, 7, "Boot 7", null, MaterialItemStatus.ACTIVE), userId) as ApiResponse.Created).id

        val page = !MaterialService.pageItems(providerId, PaginationParameters(null, null, null, null))
        val item = page.data.single { it.id == itemId }
        assertEquals("C4x+", item.materialTypeName)
        assertEquals(MaterialCategory.BOAT, item.category)
        assertEquals(7, item.number)
        assertEquals(0, item.openDamages)
    }

    @Test
    fun duplicateNumberPerTypeIsRejected() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.ItemNumberTaken) {
            MaterialService.addItem(providerId, MaterialItemRequest(typeId, 3, "Boot 3b", null, MaterialItemStatus.ACTIVE), userId)
        }
    }

    @Test
    fun typeInUseCannotBeDeleted() = testComprehension {
        val userId = !createTestUser()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.addItem(providerId, MaterialItemRequest(typeId, null, "Zweier", null, MaterialItemStatus.ACTIVE), userId)
        assertKIOFails(MaterialError.TypeInUse) { MaterialService.deleteType(typeId) }
    }

    @Test
    fun providerNameMustBeUnique() = testComprehension {
        val userId = !createTestUser()
        !MaterialService.addProvider(provider(), userId)
        assertKIOFails(MaterialError.ProviderNameTaken) { MaterialService.addProvider(provider(), userId) }
    }

    @Test
    fun offerRequiresInvitation() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C4x+", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id

        assertKIOFails(MaterialError.NotInvited) {
            MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), userId)
        }

        !MaterialService.inviteProvider(eventId, providerId, userId)
        !MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "45 €", 5, 30), userId)
        assertKIOFails(MaterialError.OfferTypeTaken) {
            MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, "50 €", 1, 30), userId)
        }

        val offers = (!MaterialService.listOffers(eventId, providerId)).data
        assertEquals(1, offers.size)
        assertEquals("C4x+", offers.single().materialTypeName)

        val events = (!MaterialService.getProviderEvents(providerId)).data
        assertEquals(listOf(eventId), events.map { it.event })
    }

    @Test
    fun uninvitingWithOpenOffersSucceedsButWithRequestsIsBlocked() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C1x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id

        // Einladen ist idempotent - ein zweites Mal einladen ändert nichts.
        !MaterialService.inviteProvider(eventId, providerId, userId)
        !MaterialService.inviteProvider(eventId, providerId, userId)

        !MaterialService.addOffer(eventId, providerId, MaterialOfferRequest(typeId, null, 2, 30), userId)

        // Ausladen löscht Angebote per Kaskade, solange keine Anfragen bestehen.
        !MaterialService.uninviteProvider(eventId, providerId)
        assertEquals(emptyList(), (!MaterialService.getProviderEvents(providerId)).data)
    }

    @Test
    fun offerTypeCannotBeUsedTwice() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val providerId = (!MaterialService.addProvider(provider(), userId) as ApiResponse.Created).id
        val typeId = (!MaterialService.addType(MaterialTypeRequest("C2x", MaterialCategory.BOAT, null), userId) as ApiResponse.Created).id
        !MaterialService.inviteProvider(eventId, providerId, userId)

        val offerId = (!MaterialService.addOffer(
            eventId, providerId, MaterialOfferRequest(typeId, "20 €", 3, 15), userId
        ) as ApiResponse.Created).id

        !MaterialService.updateOffer(eventId, providerId, offerId, MaterialOfferRequest(typeId, "25 €", 4, 20), userId)
        val offer = (!MaterialService.listOffers(eventId, providerId)).data.single()
        assertEquals("25 €", offer.priceText)
        assertEquals(4, offer.plannedCount)

        !MaterialService.deleteOffer(eventId, providerId, offerId)
        assertEquals(emptyList(), (!MaterialService.listOffers(eventId, providerId)).data)
    }
}
