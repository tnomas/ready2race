package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.EventMaterialProviderDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialProviderEventDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.findOneBy
import de.lambda9.ready2race.backend.database.generated.tables.records.EventHasMaterialProviderRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_HAS_MATERIAL_PROVIDER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_PROVIDER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.update
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.UUID

object EventHasMaterialProviderRepo {

    fun create(record: EventHasMaterialProviderRecord) = EVENT_HAS_MATERIAL_PROVIDER.insert(record)

    fun exists(eventId: UUID, providerId: UUID) = EVENT_HAS_MATERIAL_PROVIDER.exists {
        EVENT.eq(eventId).and(MATERIAL_PROVIDER.eq(providerId))
    }

    fun get(eventId: UUID, providerId: UUID) = EVENT_HAS_MATERIAL_PROVIDER.findOneBy {
        EVENT.eq(eventId).and(MATERIAL_PROVIDER.eq(providerId))
    }

    fun update(eventId: UUID, providerId: UUID, f: EventHasMaterialProviderRecord.() -> Unit) =
        EVENT_HAS_MATERIAL_PROVIDER.update(f) { EVENT.eq(eventId).and(MATERIAL_PROVIDER.eq(providerId)) }

    fun delete(eventId: UUID, providerId: UUID) = EVENT_HAS_MATERIAL_PROVIDER.delete {
        EVENT.eq(eventId).and(MATERIAL_PROVIDER.eq(providerId))
    }

    /** Die Veranstaltungen, zu denen dieser Anbieter eingeladen ist - für den Änderungsmarker. */
    fun eventIdsForProvider(providerId: UUID): JIO<List<UUID>> = Jooq.query {
        select(EVENT_HAS_MATERIAL_PROVIDER.EVENT)
            .from(EVENT_HAS_MATERIAL_PROVIDER)
            .where(EVENT_HAS_MATERIAL_PROVIDER.MATERIAL_PROVIDER.eq(providerId))
            .fetch { it.value1()!! }
    }

    /**
     * Anfragen, die an Angeboten dieses Anbieters für diese Veranstaltung hängen - verhindert das
     * Ausladen, obwohl die Fremdschlüsselkette selbst kaskadiert löschen würde (Anfragen sind
     * fachliche Daten, kein reiner Verweis).
     */
    fun hasRequests(eventId: UUID, providerId: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(
            MATERIAL_REQUEST.join(MATERIAL_OFFER).on(MATERIAL_OFFER.ID.eq(MATERIAL_REQUEST.MATERIAL_OFFER)),
            MATERIAL_OFFER.EVENT.eq(eventId).and(MATERIAL_OFFER.MATERIAL_PROVIDER.eq(providerId))
        )
    }

    /** Eingeladene Anbieter einer Veranstaltung mit den Zählern für die Veranstalter-Übersicht. */
    fun listForEvent(eventId: UUID): JIO<List<EventMaterialProviderDto>> = Jooq.query {
        val openRequests = DSL.field(
            DSL.select(DSL.count())
                .from(MATERIAL_REQUEST)
                .join(MATERIAL_OFFER).on(MATERIAL_OFFER.ID.eq(MATERIAL_REQUEST.MATERIAL_OFFER))
                // Nur Anfragen mit existierender Meldung - dieselbe Menge, die das Dashboard des
                // Anbieters zeigt (material_request_view joint die Meldung).
                .join(COMPETITION_REGISTRATION).on(COMPETITION_REGISTRATION.ID.eq(MATERIAL_REQUEST.COMPETITION_REGISTRATION))
                .where(
                    MATERIAL_OFFER.EVENT.eq(eventId)
                        .and(MATERIAL_OFFER.MATERIAL_PROVIDER.eq(MATERIAL_PROVIDER.ID))
                        .and(MATERIAL_REQUEST.STATUS.eq(MaterialRequestStatus.REQUESTED.name))
                )
        ).`as`("open_requests")

        val openDamages = DSL.field(
            DSL.select(DSL.count())
                .from(MATERIAL_DAMAGE)
                .join(MATERIAL_ITEM).on(MATERIAL_ITEM.ID.eq(MATERIAL_DAMAGE.MATERIAL_ITEM))
                .where(
                    MATERIAL_ITEM.MATERIAL_PROVIDER.eq(MATERIAL_PROVIDER.ID)
                        .and(MATERIAL_DAMAGE.STATUS.eq(MaterialDamageStatus.REPORTED.name))
                )
        ).`as`("open_damages")

        select(MATERIAL_PROVIDER.ID, MATERIAL_PROVIDER.NAME, EVENT_HAS_MATERIAL_PROVIDER.REQUESTS_CLOSED, openRequests, openDamages)
            .from(EVENT_HAS_MATERIAL_PROVIDER)
            .join(MATERIAL_PROVIDER).on(MATERIAL_PROVIDER.ID.eq(EVENT_HAS_MATERIAL_PROVIDER.MATERIAL_PROVIDER))
            .where(EVENT_HAS_MATERIAL_PROVIDER.EVENT.eq(eventId))
            .orderBy(MATERIAL_PROVIDER.NAME)
            .fetch { r ->
                EventMaterialProviderDto(
                    materialProvider = r[MATERIAL_PROVIDER.ID]!!,
                    name = r[MATERIAL_PROVIDER.NAME]!!,
                    requestsClosed = r[EVENT_HAS_MATERIAL_PROVIDER.REQUESTS_CLOSED]!!,
                    openRequests = r[openRequests] ?: 0,
                    openDamages = r[openDamages] ?: 0,
                )
            }
    }

    /** Veranstaltungen, zu denen ein Anbieter eingeladen ist - seine Veranstaltungswahl. */
    fun listForProvider(providerId: UUID): JIO<List<MaterialProviderEventDto>> = Jooq.query {
        select(EVENT.ID, EVENT.NAME, EVENT_HAS_MATERIAL_PROVIDER.REQUESTS_CLOSED)
            .from(EVENT_HAS_MATERIAL_PROVIDER)
            .join(EVENT).on(EVENT.ID.eq(EVENT_HAS_MATERIAL_PROVIDER.EVENT))
            .where(EVENT_HAS_MATERIAL_PROVIDER.MATERIAL_PROVIDER.eq(providerId))
            .orderBy(EVENT.NAME)
            .fetch { r ->
                MaterialProviderEventDto(
                    event = r[EVENT.ID]!!,
                    eventName = r[EVENT.NAME]!!,
                    requestsClosed = r[EVENT_HAS_MATERIAL_PROVIDER.REQUESTS_CLOSED]!!,
                )
            }
    }
}
