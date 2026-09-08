package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialOfferDto
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialOfferRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_TYPE
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object MaterialOfferRepo {

    fun create(record: MaterialOfferRecord) = MATERIAL_OFFER.insertReturning(record) { ID }

    fun get(id: UUID) = MATERIAL_OFFER.selectOne { ID.eq(id) }

    fun update(id: UUID, f: MaterialOfferRecord.() -> Unit) = MATERIAL_OFFER.update(f) { ID.eq(id) }

    fun delete(id: UUID) = MATERIAL_OFFER.delete { ID.eq(id) }

    // Ein Angebot je Anbieter, Veranstaltung und Materialart - Vorprüfung des Unique-Index, damit
    // ein zweites Angebot derselben Art als Domänenfehler auftaucht statt als roher Constraint-Defekt.
    fun existsByType(eventId: UUID, providerId: UUID, materialType: UUID, excludingId: UUID? = null) = MATERIAL_OFFER.exists {
        EVENT.eq(eventId).and(MATERIAL_PROVIDER.eq(providerId)).and(MATERIAL_TYPE.eq(materialType)).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    /** Verhindert das Löschen eines Angebots, für das schon Anfragen bestehen. */
    fun hasRequests(offerId: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(MATERIAL_REQUEST, MATERIAL_REQUEST.MATERIAL_OFFER.eq(offerId))
    }

    fun listForEventAndProvider(eventId: UUID, providerId: UUID): JIO<List<MaterialOfferDto>> = Jooq.query {
        select(MATERIAL_OFFER.asterisk(), MATERIAL_TYPE.NAME, MATERIAL_TYPE.CATEGORY)
            .from(MATERIAL_OFFER)
            .join(MATERIAL_TYPE).on(MATERIAL_TYPE.ID.eq(MATERIAL_OFFER.MATERIAL_TYPE))
            .where(MATERIAL_OFFER.EVENT.eq(eventId).and(MATERIAL_OFFER.MATERIAL_PROVIDER.eq(providerId)))
            .orderBy(MATERIAL_TYPE.NAME)
            .fetch { r ->
                MaterialOfferDto(
                    id = r[MATERIAL_OFFER.ID]!!,
                    event = r[MATERIAL_OFFER.EVENT]!!,
                    materialProvider = r[MATERIAL_OFFER.MATERIAL_PROVIDER]!!,
                    materialType = r[MATERIAL_OFFER.MATERIAL_TYPE]!!,
                    materialTypeName = r[MATERIAL_TYPE.NAME]!!,
                    category = MaterialCategory.valueOf(r[MATERIAL_TYPE.CATEGORY]!!),
                    priceText = r[MATERIAL_OFFER.PRICE_TEXT],
                    plannedCount = r[MATERIAL_OFFER.PLANNED_COUNT]!!,
                    changeoverMinutes = r[MATERIAL_OFFER.CHANGEOVER_MINUTES]!!,
                )
            }
    }
}
