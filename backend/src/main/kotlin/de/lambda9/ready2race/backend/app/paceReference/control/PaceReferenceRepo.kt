package de.lambda9.ready2race.backend.app.paceReference.control

import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceSort
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.PaceReference
import de.lambda9.ready2race.backend.database.generated.tables.records.PaceReferenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.PACE_REFERENCE
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.metaSearch
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object PaceReferenceRepo {

    private fun PaceReference.searchFields() = listOf(NAME)

    fun get(id: UUID) = PACE_REFERENCE.selectOne { ID.eq(id) }

    // Vorprüfung des Unique-Index auf dem Namen, damit ein Doppelname als Domänenfehler
    // auftaucht statt als roher Constraint-Defekt - dasselbe Muster wie TimingModeRepo.
    fun existsByName(name: String, excludingId: UUID? = null) = PACE_REFERENCE.exists {
        NAME.eq(name).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    fun count(
        search: String?,
    ): JIO<Int> = Jooq.query {
        with(PACE_REFERENCE) {
            fetchCount(
                this,
                search.metaSearch(searchFields())
            )
        }
    }

    fun page(
        params: PaginationParameters<PaceReferenceSort>,
    ): JIO<List<PaceReferenceRecord>> = Jooq.query {
        with(PACE_REFERENCE) {
            selectFrom(this)
                .page(params, searchFields())
                .fetch()
        }
    }

    fun create(record: PaceReferenceRecord) = PACE_REFERENCE.insertReturning(record) { ID }

    fun update(id: UUID, f: PaceReferenceRecord.() -> Unit) = PACE_REFERENCE.update(f) { ID.eq(id) }

    fun delete(id: UUID) = PACE_REFERENCE.delete { ID.eq(id) }
}
