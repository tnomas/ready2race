package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialTypeSort
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.MaterialType
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialTypeRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_TYPE
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object MaterialTypeRepo {

    private fun MaterialType.searchFields() = listOf(NAME)

    fun create(record: MaterialTypeRecord) = MATERIAL_TYPE.insertReturning(record) { ID }

    fun update(id: UUID, f: MaterialTypeRecord.() -> Unit) = MATERIAL_TYPE.update(f) { ID.eq(id) }

    fun delete(id: UUID) = MATERIAL_TYPE.delete { ID.eq(id) }

    fun page(params: PaginationParameters<MaterialTypeSort>) =
        MATERIAL_TYPE.page(params, { searchFields() })

    fun existsByName(name: String, excludingId: UUID? = null) = MATERIAL_TYPE.exists {
        NAME.eq(name).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    /** Materialart mit Stücken im Bestand eines beliebigen Anbieters kann nicht gelöscht werden. */
    fun hasItems(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(MATERIAL_ITEM, MATERIAL_ITEM.MATERIAL_TYPE.eq(id))
    }

    /** Materialart, die als Bedarf an einem Wettkampf oder einer Vorlage hängt. */
    fun hasCompetitionDemand(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE, COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.MATERIAL_TYPE.eq(id))
    }

    /** Materialart, die in einem Angebot eines Anbieters für eine Veranstaltung steht. */
    fun hasOffers(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(MATERIAL_OFFER, MATERIAL_OFFER.MATERIAL_TYPE.eq(id))
    }
}
