package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderSort
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.MaterialProvider
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialProviderRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_HAS_MATERIAL_PROVIDER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_PROVIDER
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object MaterialProviderRepo {

    private fun MaterialProvider.searchFields() = listOf(NAME)

    fun create(record: MaterialProviderRecord) = MATERIAL_PROVIDER.insertReturning(record) { ID }

    fun get(id: UUID) = MATERIAL_PROVIDER.selectOne { ID.eq(id) }

    fun update(id: UUID, f: MaterialProviderRecord.() -> Unit) = MATERIAL_PROVIDER.update(f) { ID.eq(id) }

    fun delete(id: UUID) = MATERIAL_PROVIDER.delete { ID.eq(id) }

    fun page(params: PaginationParameters<MaterialProviderSort>) =
        MATERIAL_PROVIDER.page(params, { searchFields() })

    // Vorprüfung des Unique-Index auf dem Namen, damit ein Doppelname als Domänenfehler auftaucht
    // statt als roher Constraint-Defekt - dasselbe Muster wie bei den Bezugsgrößen.
    fun existsByName(name: String, excludingId: UUID? = null) = MATERIAL_PROVIDER.exists {
        NAME.eq(name).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    /** Verhindert das Löschen eines Anbieters, der noch Stücke im Bestand hat. */
    fun hasItems(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(MATERIAL_ITEM, MATERIAL_ITEM.MATERIAL_PROVIDER.eq(id))
    }

    /**
     * Verhindert das Löschen eines Anbieters, dem noch Konten zugeordnet sind - `on delete set
     * null` ließe an ihnen die Materialanbieter-Rolle ohne Anbieter stehen.
     */
    fun hasUsers(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(APP_USER, APP_USER.MATERIAL_PROVIDER.eq(id))
    }

    /** Verhindert das Löschen eines Anbieters, der noch zu einer Veranstaltung eingeladen ist. */
    fun hasEventInvitations(id: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(EVENT_HAS_MATERIAL_PROVIDER, EVENT_HAS_MATERIAL_PROVIDER.MATERIAL_PROVIDER.eq(id))
    }
}
