package de.lambda9.ready2race.backend.app.material.control

import de.lambda9.ready2race.backend.app.material.entity.MaterialAssignmentDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialDamageStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialItemStatus
import de.lambda9.ready2race.backend.app.material.entity.MaterialOutageDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOverviewItemDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOverviewMatchDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOverviewMatchTeamDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialOverviewRequestDto
import de.lambda9.ready2race.backend.app.material.entity.MaterialRequestStatus
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_SCHEDULE_SLOT
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ASSIGNMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_DAMAGE
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_ITEM
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_OFFER
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_REQUEST_VIEW
import de.lambda9.ready2race.backend.database.generated.tables.references.MATERIAL_TYPE
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.UUID

/**
 * Die drei Bausteine der Anbieter-Übersicht (Task 4.1), die weder in einer Sicht noch in einem
 * vorhandenen Repo stehen: Flotte mit Ausfallfenstern, Anfragen mit Zuteilungen (aus
 * `material_request_view` + `material_assignment`), und die Läufe, in denen die Anfragen dieses
 * Anbieters tatsächlich stehen. `offers` und `requestsClosed` kommen aus [MaterialOfferRepo] bzw.
 * [EventHasMaterialProviderRepo] - keine Dopplung hier.
 */
object MaterialOverviewRepo {

    /** Der ganze Bestand des Anbieters, nicht nur der dieser Veranstaltung - Zuteilung kann jedes eigene Stück treffen. */
    fun itemsForProvider(providerId: UUID): JIO<List<MaterialOverviewItemDto>> = Jooq.query {
        val outages = DSL.select(MATERIAL_DAMAGE.ID, MATERIAL_DAMAGE.OUT_OF_SERVICE_FROM, MATERIAL_DAMAGE.OUT_OF_SERVICE_UNTIL)
            .from(MATERIAL_DAMAGE)
            .where(MATERIAL_DAMAGE.MATERIAL_ITEM.eq(MATERIAL_ITEM.ID))
            .and(MATERIAL_DAMAGE.STATUS.eq(MaterialDamageStatus.REPORTED.name))
            .and(MATERIAL_DAMAGE.OUT_OF_SERVICE_FROM.isNotNull)
            .orderBy(MATERIAL_DAMAGE.OUT_OF_SERVICE_FROM)
            .asMultiset("outages")
            .convertFrom {
                it!!.map { r ->
                    MaterialOutageDto(
                        damageId = r[MATERIAL_DAMAGE.ID]!!,
                        from = r[MATERIAL_DAMAGE.OUT_OF_SERVICE_FROM]!!,
                        until = r[MATERIAL_DAMAGE.OUT_OF_SERVICE_UNTIL],
                    )
                }
            }

        select(
            MATERIAL_ITEM.ID,
            MATERIAL_ITEM.MATERIAL_TYPE,
            MATERIAL_TYPE.NAME,
            MATERIAL_TYPE.CATEGORY,
            MATERIAL_ITEM.NUMBER,
            MATERIAL_ITEM.LABEL,
            MATERIAL_ITEM.STATUS,
            outages,
        )
            .from(MATERIAL_ITEM)
            .join(MATERIAL_TYPE).on(MATERIAL_TYPE.ID.eq(MATERIAL_ITEM.MATERIAL_TYPE))
            .where(MATERIAL_ITEM.MATERIAL_PROVIDER.eq(providerId))
            .orderBy(MATERIAL_TYPE.NAME, MATERIAL_ITEM.NUMBER)
            .fetch { r ->
                MaterialOverviewItemDto(
                    id = r[MATERIAL_ITEM.ID]!!,
                    materialType = r[MATERIAL_ITEM.MATERIAL_TYPE]!!,
                    materialTypeName = r[MATERIAL_TYPE.NAME]!!,
                    category = MaterialCategory.valueOf(r[MATERIAL_TYPE.CATEGORY]!!),
                    number = r[MATERIAL_ITEM.NUMBER],
                    label = r[MATERIAL_ITEM.LABEL]!!,
                    status = MaterialItemStatus.valueOf(r[MATERIAL_ITEM.STATUS]!!),
                    outages = r[outages],
                )
            }
    }

    /** Anfragen an diesen Anbieter für diese Veranstaltung, mit ihren Zuteilungen. */
    fun requestsForEventAndProvider(eventId: UUID, providerId: UUID): JIO<List<MaterialOverviewRequestDto>> = Jooq.query {
        val assignments = DSL.select(MATERIAL_ASSIGNMENT.ID, MATERIAL_ASSIGNMENT.MATERIAL_ITEM, MATERIAL_ASSIGNMENT.COMPETITION_MATCH)
            .from(MATERIAL_ASSIGNMENT)
            .where(MATERIAL_ASSIGNMENT.MATERIAL_REQUEST.eq(MATERIAL_REQUEST_VIEW.ID))
            .asMultiset("assignments")
            .convertFrom {
                it!!.map { r ->
                    MaterialAssignmentDto(
                        id = r[MATERIAL_ASSIGNMENT.ID]!!,
                        materialItem = r[MATERIAL_ASSIGNMENT.MATERIAL_ITEM]!!,
                        competitionMatch = r[MATERIAL_ASSIGNMENT.COMPETITION_MATCH],
                    )
                }
            }

        select(
            MATERIAL_REQUEST_VIEW.ID,
            MATERIAL_REQUEST_VIEW.MATERIAL_OFFER,
            MATERIAL_REQUEST_VIEW.MATERIAL_TYPE,
            MATERIAL_REQUEST_VIEW.MATERIAL_TYPE_NAME,
            MATERIAL_REQUEST_VIEW.CATEGORY,
            MATERIAL_REQUEST_VIEW.COUNT,
            MATERIAL_REQUEST_VIEW.STATUS,
            MATERIAL_REQUEST_VIEW.DECISION_NOTE,
            MATERIAL_REQUEST_VIEW.REQUESTED_AT,
            MATERIAL_REQUEST_VIEW.DECIDED_AT,
            MATERIAL_REQUEST_VIEW.COMPETITION_REGISTRATION,
            MATERIAL_REQUEST_VIEW.COMPETITION,
            MATERIAL_REQUEST_VIEW.COMPETITION_IDENTIFIER,
            MATERIAL_REQUEST_VIEW.COMPETITION_NAME,
            MATERIAL_REQUEST_VIEW.TEAM_NAME,
            MATERIAL_REQUEST_VIEW.TEAM_NUMBER,
            MATERIAL_REQUEST_VIEW.START_NUMBER,
            MATERIAL_REQUEST_VIEW.CLUB_ID,
            MATERIAL_REQUEST_VIEW.CLUB_NAME,
            MATERIAL_REQUEST_VIEW.CLUB_CONTACT_EMAIL,
            assignments,
        )
            .from(MATERIAL_REQUEST_VIEW)
            .where(MATERIAL_REQUEST_VIEW.EVENT.eq(eventId))
            .and(MATERIAL_REQUEST_VIEW.MATERIAL_PROVIDER.eq(providerId))
            .orderBy(MATERIAL_REQUEST_VIEW.REQUESTED_AT)
            .fetch { r ->
                MaterialOverviewRequestDto(
                    id = r[MATERIAL_REQUEST_VIEW.ID]!!,
                    materialOffer = r[MATERIAL_REQUEST_VIEW.MATERIAL_OFFER]!!,
                    materialType = r[MATERIAL_REQUEST_VIEW.MATERIAL_TYPE]!!,
                    materialTypeName = r[MATERIAL_REQUEST_VIEW.MATERIAL_TYPE_NAME]!!,
                    category = MaterialCategory.valueOf(r[MATERIAL_REQUEST_VIEW.CATEGORY]!!),
                    count = r[MATERIAL_REQUEST_VIEW.COUNT]!!,
                    status = MaterialRequestStatus.valueOf(r[MATERIAL_REQUEST_VIEW.STATUS]!!),
                    decisionNote = r[MATERIAL_REQUEST_VIEW.DECISION_NOTE],
                    requestedAt = r[MATERIAL_REQUEST_VIEW.REQUESTED_AT]!!,
                    decidedAt = r[MATERIAL_REQUEST_VIEW.DECIDED_AT],
                    competitionRegistration = r[MATERIAL_REQUEST_VIEW.COMPETITION_REGISTRATION]!!,
                    competition = r[MATERIAL_REQUEST_VIEW.COMPETITION]!!,
                    competitionIdentifier = r[MATERIAL_REQUEST_VIEW.COMPETITION_IDENTIFIER]!!,
                    competitionName = r[MATERIAL_REQUEST_VIEW.COMPETITION_NAME]!!,
                    teamName = r[MATERIAL_REQUEST_VIEW.TEAM_NAME],
                    teamNumber = r[MATERIAL_REQUEST_VIEW.TEAM_NUMBER],
                    startNumber = r[MATERIAL_REQUEST_VIEW.START_NUMBER],
                    clubId = r[MATERIAL_REQUEST_VIEW.CLUB_ID]!!,
                    clubName = r[MATERIAL_REQUEST_VIEW.CLUB_NAME]!!,
                    clubContactEmail = r[MATERIAL_REQUEST_VIEW.CLUB_CONTACT_EMAIL],
                    assignments = r[assignments],
                )
            }
    }

    /**
     * Läufe, in denen wenigstens eine Anfrage dieses Anbieters an dieser Veranstaltung steht -
     * Grundlage für die Ausnahme je Lauf. `registrationIds` zeigt alle Meldungen dieses Laufs, nicht
     * nur die mit Anfrage an diesen Anbieter (Konvention aus dem Interface).
     */
    fun matchesForEventAndProvider(eventId: UUID, providerId: UUID): JIO<List<MaterialOverviewMatchDto>> = Jooq.query {
        val registrationIds = DSL.select(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION)
            .from(COMPETITION_MATCH_TEAM)
            .where(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_MATCH.COMPETITION_SETUP_MATCH))
            .asMultiset("registration_ids")
            .convertFrom { it!!.map { r -> r.value1()!! } }

        val teams = DSL.select(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION, COMPETITION_MATCH_TEAM.START_NUMBER)
            .from(COMPETITION_MATCH_TEAM)
            .where(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_MATCH.COMPETITION_SETUP_MATCH))
            .orderBy(COMPETITION_MATCH_TEAM.START_NUMBER)
            .asMultiset("teams")
            .convertFrom {
                it!!.map { r -> MaterialOverviewMatchTeamDto(competitionRegistration = r.value1()!!, startNumber = r.value2()!!) }
            }

        select(
            COMPETITION_MATCH.COMPETITION_SETUP_MATCH,
            COMPETITION.ID,
            COMPETITION_SETUP_MATCH.NAME,
            COMPETITION_SETUP_ROUND.NAME,
            COMPETITION_MATCH.START_TIME,
            EVENT_SCHEDULE_SLOT.DURATION_MINUTES,
            registrationIds,
            teams,
        )
            .from(COMPETITION_MATCH)
            .join(COMPETITION_SETUP_MATCH).on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND).on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_SETUP).on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_SETUP.COMPETITION_PROPERTIES))
            .join(COMPETITION_PROPERTIES).on(COMPETITION_SETUP.COMPETITION_PROPERTIES.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .leftJoin(EVENT_SCHEDULE_SLOT).on(EVENT_SCHEDULE_SLOT.COMPETITION_SETUP_MATCH.eq(COMPETITION_MATCH.COMPETITION_SETUP_MATCH))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(
                DSL.exists(
                    DSL.selectOne()
                        .from(MATERIAL_REQUEST)
                        .join(MATERIAL_OFFER).on(MATERIAL_OFFER.ID.eq(MATERIAL_REQUEST.MATERIAL_OFFER))
                        .join(COMPETITION_REGISTRATION).on(COMPETITION_REGISTRATION.ID.eq(MATERIAL_REQUEST.COMPETITION_REGISTRATION))
                        .where(MATERIAL_OFFER.MATERIAL_PROVIDER.eq(providerId))
                        .and(MATERIAL_OFFER.EVENT.eq(eventId))
                        .and(COMPETITION_REGISTRATION.COMPETITION.eq(COMPETITION.ID))
                )
            )
            .orderBy(COMPETITION_MATCH.START_TIME)
            .fetch { r ->
                val startTime = r[COMPETITION_MATCH.START_TIME]
                val durationMinutes = r[EVENT_SCHEDULE_SLOT.DURATION_MINUTES]
                MaterialOverviewMatchDto(
                    id = r[COMPETITION_MATCH.COMPETITION_SETUP_MATCH]!!,
                    competition = r[COMPETITION.ID]!!,
                    name = r[COMPETITION_SETUP_MATCH.NAME],
                    roundName = r[COMPETITION_SETUP_ROUND.NAME],
                    startTime = startTime,
                    endTime = if (startTime != null && durationMinutes != null) startTime.plusMinutes(durationMinutes.toLong()) else null,
                    registrationIds = r[registrationIds],
                    teams = r[teams],
                )
            }
    }
}
