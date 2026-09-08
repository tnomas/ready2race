package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialItemSort
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.MaterialItemView
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialItemRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM_VIEW
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object MaterialItemRepo {

    private fun MaterialItemView.searchFields() = listOf(LABEL, MATERIAL_TYPE_NAME)

    fun create(record: MaterialItemRecord) = MATERIAL_ITEM.insertReturning(record) { ID }

    fun get(id: UUID) = MATERIAL_ITEM.selectOne { ID.eq(id) }

    fun update(id: UUID, f: MaterialItemRecord.() -> Unit) = MATERIAL_ITEM.update(f) { ID.eq(id) }

    fun delete(id: UUID) = MATERIAL_ITEM.delete { ID.eq(id) }

    fun page(providerId: UUID, params: PaginationParameters<MaterialItemSort>) =
        MATERIAL_ITEM_VIEW.page(params, { searchFields() }) { MATERIAL_PROVIDER.eq(providerId) }

    /** Nummer je Anbieter und Materialart eindeutig (Spiegel des partiellen Unique-Index). */
    fun existsByNumber(providerId: UUID, typeId: UUID, number: Int, excludingId: UUID? = null) = MATERIAL_ITEM.exists {
        MATERIAL_PROVIDER.eq(providerId)
            .and(MATERIAL_TYPE.eq(typeId))
            .and(NUMBER.eq(number))
            .let { cond ->
                excludingId?.let { cond.and(ID.ne(it)) } ?: cond
            }
    }

    /** Materialstück mit Zuteilungen kann nicht gelöscht werden. */
    fun hasAssignments(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(MATERIAL_ASSIGNMENT, MATERIAL_ASSIGNMENT.MATERIAL_ITEM.eq(id))
    }
}
