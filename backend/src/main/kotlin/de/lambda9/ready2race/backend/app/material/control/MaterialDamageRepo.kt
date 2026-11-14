package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageSort
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamageRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialDamageViewRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_DAY
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE_VIEW
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.metaSearch
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.selectOne
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.pagination.Direction
import de.lambda9.ready2race.backend.pagination.Order
import de.lambda9.ready2race.backend.pagination.Page
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.Condition
import org.jooq.DSLContext
import org.jooq.impl.DSL
import java.time.LocalDate
import java.util.UUID

/**
 * Schadensakte (Task 5.1). Liest über `material_damage_view`, die bewusst keinen Join auf die
 * Meldung führt (siehe Migration und die Sicht in `afterMigrate.sql`) - der Verursacher steckt
 * als Momentaufnahme direkt in `material_damage`. [causedByRef] löst eine Meldung für genau diese
 * Momentaufnahme auf, wenn eine Schadensakte angelegt oder geändert wird.
 */
object MaterialDamageRepo {

    fun create(record: MaterialDamageRecord) = MATERIAL_DAMAGE.insertReturning(record) { ID }

    fun get(id: UUID) = MATERIAL_DAMAGE.selectOne { ID.eq(id) }

    fun getView(id: UUID) = MATERIAL_DAMAGE_VIEW.selectOne { ID.eq(id) }

    fun update(id: UUID, f: MaterialDamageRecord.() -> Unit) = MATERIAL_DAMAGE.update(f) { ID.eq(id) }

    private fun searchFields() =
        listOf(MATERIAL_DAMAGE_VIEW.ITEM_LABEL, MATERIAL_DAMAGE_VIEW.MATERIAL_TYPE_NAME, MATERIAL_DAMAGE_VIEW.DESCRIPTION)

    /**
     * `eventId` nimmt einen Schaden auf, wenn wenigstens eins gilt: Verursacher-Meldung gehört zur
     * Veranstaltung (`caused_by_registration` -> Wettkampf -> Veranstaltung), der Schaden ist noch
     * offen (`REPORTED`), `reported_at` liegt in den Veranstaltungstagen oder das Ausfallfenster
     * berührt sie (`event_day`; ohne Tage greifen nur die ersten beiden Kriterien). Ohne generisches `Table.page()`, weil die eventId-Bedingung
     * eine eigene Vorabfrage (Zeitspanne der Veranstaltungstage) braucht.
     */
    fun page(
        providerId: UUID,
        params: PaginationParameters<MaterialDamageSort>,
        eventId: UUID?,
        itemId: UUID?,
    ): JIO<Page<MaterialDamageViewRecord, MaterialDamageSort>> = Jooq.query {
        val timespan = eventId?.let { eventDayTimespan(it) }
        val condition = damageCondition(providerId, eventId, itemId, timespan)

        // Ohne eigene Sortierwahl der Oberfläche zuletzt gemeldete zuerst (Ruling Task 5.1).
        val effectiveParams = if (params.sort.isNullOrEmpty()) {
            params.copy(sort = listOf(Order(MaterialDamageSort.REPORTED_AT, Direction.DESC)))
        } else {
            params
        }

        val total = fetchCount(MATERIAL_DAMAGE_VIEW, DSL.and(effectiveParams.search.metaSearch(searchFields()), condition))
        val data = selectFrom(MATERIAL_DAMAGE_VIEW)
            .page(effectiveParams, searchFields()) { condition }
            .fetch()

        Page(data = data, pagination = effectiveParams.toPagination(total))
    }

    /** Dieselben Schäden wie [page], nur vollständig und unsortiert nach Seite - Grundlage der CSV. */
    fun listForCsv(providerId: UUID, eventId: UUID): JIO<List<MaterialDamageViewRecord>> = Jooq.query {
        val timespan = eventDayTimespan(eventId)
        val condition = damageCondition(providerId, eventId, itemId = null, timespan = timespan)

        selectFrom(MATERIAL_DAMAGE_VIEW)
            .where(condition)
            .orderBy(MATERIAL_DAMAGE_VIEW.REPORTED_AT.desc())
            .fetch()
    }

    private fun DSLContext.eventDayTimespan(eventId: UUID): Pair<LocalDate, LocalDate>? =
        select(DSL.min(EVENT_DAY.DATE), DSL.max(EVENT_DAY.DATE))
            .from(EVENT_DAY)
            .where(EVENT_DAY.EVENT.eq(eventId))
            .fetchOne { (min, max) -> if (min != null) min to max!! else null }

    private fun damageCondition(
        providerId: UUID,
        eventId: UUID?,
        itemId: UUID?,
        timespan: Pair<LocalDate, LocalDate>?,
    ): Condition {
        var condition = MATERIAL_DAMAGE_VIEW.MATERIAL_PROVIDER.eq(providerId)

        if (itemId != null) {
            condition = condition.and(MATERIAL_DAMAGE_VIEW.MATERIAL_ITEM.eq(itemId))
        }

        if (eventId != null) {
            val causedByEvent = DSL.exists(
                DSL.selectOne()
                    .from(COMPETITION_REGISTRATION)
                    .join(COMPETITION).on(COMPETITION.ID.eq(COMPETITION_REGISTRATION.COMPETITION))
                    .where(COMPETITION_REGISTRATION.ID.eq(MATERIAL_DAMAGE_VIEW.CAUSED_BY_REGISTRATION))
                    .and(COMPETITION.EVENT.eq(eventId))
            )

            // Offene Schäden der eigenen Stücke gehören immer dazu - ein Schaden, den der Anbieter
            // hier meldet, verschwindet sonst aus der Liste, sobald sein Meldedatum außerhalb der
            // Veranstaltungstage liegt (Aufbau, Abbau, Transport).
            val open = MATERIAL_DAMAGE_VIEW.STATUS.eq(MaterialDamageStatus.REPORTED.name)

            condition = if (timespan != null) {
                val start = timespan.first.atStartOfDay()
                val end = timespan.second.plusDays(1).atStartOfDay()
                val reportedDuringEvent = MATERIAL_DAMAGE_VIEW.REPORTED_AT.between(start, end)
                // Ausfallfenster berührt die Veranstaltungstage (offenes Ende = noch nicht zurück).
                val outageDuringEvent = MATERIAL_DAMAGE_VIEW.OUT_OF_SERVICE_FROM.lt(end)
                    .and(MATERIAL_DAMAGE_VIEW.OUT_OF_SERVICE_UNTIL.isNull.or(MATERIAL_DAMAGE_VIEW.OUT_OF_SERVICE_UNTIL.ge(start)))
                condition.and(DSL.or(causedByEvent, open, reportedDuringEvent, outageDuringEvent))
            } else {
                condition.and(causedByEvent.or(open))
            }
        }

        return condition
    }

    /**
     * Team, Verein und Wettkampf einer Meldung für den Verursacher-Schnappschuss (Ruling Task
     * 5.1), inklusive der Veranstaltung - der Dienst prüft darüber, ob dieser Anbieter zu ihr
     * eingeladen ist.
     */
    data class CausedByRef(val event: UUID, val team: String?, val club: String, val competition: String)

    fun causedByRef(registrationId: UUID): JIO<CausedByRef?> = Jooq.query {
        select(
            COMPETITION.EVENT,
            COMPETITION_REGISTRATION.NAME,
            CLUB.NAME,
            COMPETITION_PROPERTIES.IDENTIFIER,
            COMPETITION_PROPERTIES.NAME,
        )
            .from(COMPETITION_REGISTRATION)
            .join(COMPETITION).on(COMPETITION.ID.eq(COMPETITION_REGISTRATION.COMPETITION))
            .join(COMPETITION_PROPERTIES).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(CLUB).on(CLUB.ID.eq(COMPETITION_REGISTRATION.CLUB))
            .where(COMPETITION_REGISTRATION.ID.eq(registrationId))
            .fetchOne { r ->
                CausedByRef(
                    event = r[COMPETITION.EVENT]!!,
                    team = r[COMPETITION_REGISTRATION.NAME],
                    club = r[CLUB.NAME]!!,
                    competition = "${r[COMPETITION_PROPERTIES.IDENTIFIER]} ${r[COMPETITION_PROPERTIES.NAME]}",
                )
            }
    }
}
