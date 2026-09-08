package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.database.generated.tables.records.MaterialRequestRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.insertReturning
import de.lambda9.ready2race.backend.database.select
import de.lambda9.ready2race.backend.database.update
import de.lambda9.ready2race.backend.database.updateMany
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID

/**
 * Materialanfragen je Meldung und Angebot. Task 3.0 legte hier `create`/`forRegistration` fürs
 * Überleben der Meldungs-ID beim erneuten Speichern der Anmeldung an; Task 3.1 ergänzt Rückzug,
 * Ampel-Auslastung und die Prüfungen für [de.lambda9.ready2race.backend.app.material.boundary.MaterialService.setRequestsForRegistration].
 */
object MaterialRequestRepo {

    fun create(record: MaterialRequestRecord) = MATERIAL_REQUEST.insertReturning(record) { ID }

    fun forRegistration(competitionRegistrationId: UUID) =
        MATERIAL_REQUEST.select { COMPETITION_REGISTRATION.eq(competitionRegistrationId) }

    fun update(id: UUID, f: MaterialRequestRecord.() -> Unit) = MATERIAL_REQUEST.update(f) { ID.eq(id) }

    /** Zieht die genannten Anfragen zurück - nicht mehr im Wunschzettel des Vereins enthalten. */
    fun withdraw(ids: Collection<UUID>, now: LocalDateTime): JIO<IntArray> =
        MATERIAL_REQUEST.updateMany({
            status = MaterialRequestStatus.WITHDRAWN.name
            decidedAt = now
        }) { ID.`in`(ids) }

    /**
     * Holt eine zurückgezogene oder abgelehnte Anfrage wieder in den Anfrage-Status - eine neue
     * Zeile kann wegen des Unique-Index (competition_registration, material_offer) nicht angelegt
     * werden, und ein Verein muss nach einem Rückzug erneut anfragen können.
     */
    fun reactivate(id: UUID, now: LocalDateTime, userId: UUID) =
        MATERIAL_REQUEST.update({
            status = MaterialRequestStatus.REQUESTED.name
            requestedAt = now
            decidedAt = null
            decisionNote = null
            updatedAt = now
            updatedBy = userId
        }) { ID.eq(id) }

    /**
     * Angefragte und bestätigte Mengen je Angebot einer Veranstaltung - Grundlage der Ampel
     * (Gegenstück zu den planned_count aus [MaterialOfferRepo.forEvent]).
     */
    fun capacityForOffers(eventId: UUID): JIO<Map<UUID, Int>> = Jooq.query {
        select(MATERIAL_REQUEST.MATERIAL_OFFER, DSL.sum(MATERIAL_REQUEST.COUNT))
            .from(MATERIAL_REQUEST)
            .join(MATERIAL_OFFER).on(MATERIAL_OFFER.ID.eq(MATERIAL_REQUEST.MATERIAL_OFFER))
            .where(MATERIAL_OFFER.EVENT.eq(eventId))
            .and(
                MATERIAL_REQUEST.STATUS.`in`(
                    MaterialRequestStatus.REQUESTED.name,
                    MaterialRequestStatus.CONFIRMED.name,
                )
            )
            .groupBy(MATERIAL_REQUEST.MATERIAL_OFFER)
            .fetch { r -> r[MATERIAL_REQUEST.MATERIAL_OFFER]!! to (r.value2()?.toInt() ?: 0) }
            .toMap()
    }

    /** Veranstaltung und Verein der Meldung - da `material_request` keinen Fremdschlüssel darauf hat, muss der Service die Existenz selbst prüfen. */
    data class RegistrationRef(val event: UUID, val club: UUID, val competition: UUID)

    fun registrationRef(competitionRegistrationId: UUID): JIO<RegistrationRef?> = Jooq.query {
        select(COMPETITION.EVENT, COMPETITION_REGISTRATION.CLUB, COMPETITION_REGISTRATION.COMPETITION)
            .from(COMPETITION_REGISTRATION)
            .join(COMPETITION).on(COMPETITION.ID.eq(COMPETITION_REGISTRATION.COMPETITION))
            .where(COMPETITION_REGISTRATION.ID.eq(competitionRegistrationId))
            .fetchOne { r ->
                RegistrationRef(
                    event = r[COMPETITION.EVENT]!!,
                    club = r[COMPETITION_REGISTRATION.CLUB]!!,
                    competition = r[COMPETITION_REGISTRATION.COMPETITION]!!,
                )
            }
    }

    /** Bedarf (materialType -> Menge) am Wettkampf dieser Meldung - Grundlage für TypeNotDemanded und die Anfrage-Menge. */
    fun demandForRegistration(competitionRegistrationId: UUID): JIO<Map<UUID, Int>> = Jooq.query {
        select(COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.MATERIAL_TYPE, COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.COUNT)
            .from(COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE)
            .join(COMPETITION_PROPERTIES).on(COMPETITION_PROPERTIES.ID.eq(COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.COMPETITION_PROPERTIES))
            .join(COMPETITION_REGISTRATION).on(COMPETITION_REGISTRATION.COMPETITION.eq(COMPETITION_PROPERTIES.COMPETITION))
            .where(COMPETITION_REGISTRATION.ID.eq(competitionRegistrationId))
            .fetch { r -> r[COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.MATERIAL_TYPE]!! to r[COMPETITION_PROPERTIES_HAS_MATERIAL_TYPE.COUNT]!! }
            .toMap()
    }
}
