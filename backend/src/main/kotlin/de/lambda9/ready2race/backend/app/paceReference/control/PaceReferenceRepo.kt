package de.lambda9.ready2race.backend.app.paceReference.control

import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceMode
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceSort
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.PaceReference
import de.lambda9.ready2race.backend.database.generated.tables.records.PaceReferenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
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

    /**
     * Die Bezugsgröße mehrerer Wettkämpfe auf einen Schlag, gebündelt nach Wettkampf.
     *
     * Die öffentlichen Anzeigen zeigen die Läufe vieler Wettkämpfe nebeneinander; je Lauf einzeln
     * nachzufragen wäre ein Schwarm von Abfragen an jedem Takt. Ein `join` statt `leftJoin`: Ein
     * Wettkampf ohne gepflegte Bezugsgröße fehlt in der Karte, und die Anzeige zeigt dann kein
     * Tempo - genau das ist gemeint.
     */
    fun getByCompetitions(competitionIds: Collection<UUID>): JIO<Map<UUID, PaceReferenceDto>> = Jooq.query {
        select(
            COMPETITION_PROPERTIES.COMPETITION,
            PACE_REFERENCE.ID,
            PACE_REFERENCE.NAME,
            PACE_REFERENCE.MODE,
            PACE_REFERENCE.REFERENCE_METERS,
        )
            .from(COMPETITION_PROPERTIES)
            .join(PACE_REFERENCE)
            .on(PACE_REFERENCE.ID.eq(COMPETITION_PROPERTIES.PACE_REFERENCE))
            .where(COMPETITION_PROPERTIES.COMPETITION.`in`(competitionIds))
            .fetch { r ->
                r[COMPETITION_PROPERTIES.COMPETITION]!! to PaceReferenceDto(
                    id = r[PACE_REFERENCE.ID]!!,
                    name = r[PACE_REFERENCE.NAME]!!,
                    mode = PaceReferenceMode.valueOf(r[PACE_REFERENCE.MODE]!!),
                    referenceMeters = r[PACE_REFERENCE.REFERENCE_METERS]!!,
                )
            }
            .toMap()
    }
}
