package de.lambda9.ready2race.backend.app.participantRequirement.control

import de.lambda9.ready2race.backend.app.participantRequirement.entity.ParticipantRequirementForEventSort
import de.lambda9.ready2race.backend.pagination.PaginationParameters
import de.lambda9.ready2race.backend.database.generated.tables.ParticipantRequirementForEvent
import de.lambda9.ready2race.backend.database.generated.tables.records.EventHasParticipantRequirementRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRequirementForEventRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_HAS_PARTICIPANT_REQUIREMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT_REQUIREMENT_FOR_EVENT
import de.lambda9.ready2race.backend.database.metaSearch
import de.lambda9.ready2race.backend.database.page
import de.lambda9.ready2race.backend.database.select
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.*

object ParticipantRequirementForEventRepo {

    private fun ParticipantRequirementForEvent.searchFields() = listOf(PARTICIPANT_REQUIREMENT_FOR_EVENT.NAME)

    fun count(
        search: String?,
        eventId: UUID,
        onlyActive: Boolean = false
    ): JIO<Int> = Jooq.query {
        with(PARTICIPANT_REQUIREMENT_FOR_EVENT)
        {
            fetchCount(
                this, search.metaSearch(searchFields()).and(
                    EVENT.eq(eventId)
                        .and(if (onlyActive) ACTIVE.isTrue else DSL.trueCondition())
                )
            )
        }
    }

    fun page(
        params: PaginationParameters<ParticipantRequirementForEventSort>,
        eventId: UUID,
        onlyActive: Boolean = false
    ): JIO<List<ParticipantRequirementForEventRecord>> = Jooq.query {
        with(PARTICIPANT_REQUIREMENT_FOR_EVENT) {
            selectFrom(this)
                .page(params, searchFields()) {
                    EVENT.eq(eventId)
                        .and(if (onlyActive) ACTIVE.isTrue else DSL.trueCondition())
                }
                .fetch()
        }
    }

    fun get(
        eventId: UUID,
        onlyActive: Boolean = false,
        onlyForApp: Boolean = false,
    ): JIO<List<ParticipantRequirementForEventRecord>> = PARTICIPANT_REQUIREMENT_FOR_EVENT.select {
        EVENT.eq(eventId).and(if (onlyActive) ACTIVE.isTrue else DSL.trueCondition())
            .and(if (onlyForApp) CHECK_IN_APP.isTrue else DSL.trueCondition())
    }


    /**
     * Die Läufe einer Person in dieser Veranstaltung - Grundlage dafür, dass die App beim
     * Abhaken den richtigen Wettkampf und Tag vorbelegen kann.
     *
     * Bewusst schlank gehalten und nicht über `MyEventRepo.findMatchesForParticipant`: dort
     * hängen Ergebnisse, Zeiten, Auswechslungen und Abmeldungen mit dran, weil "Mein Event" das
     * alles anzeigt. Hier wird nur gefragt, wann die Person wo an den Start geht.
     *
     * Auswechslungen bleiben deshalb außen vor: Wer eingewechselt wird, ist am Steg der
     * seltenere Fall, und die Auswahl in der App ist ohnehin nur eine Vorbelegung, die sich von
     * Hand ändern lässt. Ein Lauf ohne gesetzte Startzeit kommt mit - er ist terminlich offen,
     * nicht abwesend - und sortiert nach hinten.
     */
    fun getMatchesForParticipant(eventId: UUID, participantId: UUID): JIO<List<org.jooq.Record>> = Jooq.query {
        select(
            COMPETITION.ID.`as`("competition_id"),
            COMPETITION_PROPERTIES.NAME.`as`("competition_name"),
            COMPETITION_PROPERTIES.IDENTIFIER.`as`("competition_identifier"),
            COMPETITION_PROPERTIES.SHORT_NAME.`as`("competition_short_name"),
            COMPETITION_MATCH.START_TIME,
            DSL.coalesce(COMPETITION_MATCH.BYE_NAME, COMPETITION_SETUP_MATCH.NAME).`as`("match_name"),
            COMPETITION_SETUP_ROUND.NAME.`as`("round_name"),
        )
            .from(COMPETITION_MATCH)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(COMPETITION_MATCH_TEAM)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_MATCH.COMPETITION_SETUP_MATCH))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(
                DSL.exists(
                    selectOne()
                        .from(COMPETITION_REGISTRATION_NAMED_PARTICIPANT)
                        .where(
                            COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION
                                .eq(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION)
                        )
                        .and(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT.eq(participantId))
                )
            )
            .orderBy(COMPETITION_MATCH.START_TIME.asc().nullsLast())
            .fetch()
    }

    fun getRequirementsForNamedParticipant(
        eventId: UUID,
        namedParticipantId: UUID
    ): JIO<List<EventHasParticipantRequirementRecord>> =
        getRequirementsForNamedParticipants(eventId, listOf(namedParticipantId))

    /**
     * Dieselbe Regel wie [getRequirementsForNamedParticipant], nur für mehrere Rollen auf einmal:
     * eine Bedingung ohne Rollenbindung gilt für alle, eine rollengebundene nur für die genannten
     * Rollen. Eine Person kann bei einer Veranstaltung in mehreren Rollen gemeldet sein; damit
     * dafür keine zweite, womöglich abweichende Regel entsteht, ruft die Einzelfassung hier durch.
     *
     * Ohne Rolle bleiben die rollenfreien Bedingungen übrig - deshalb wird die leere Liste
     * ausdrücklich zu einer falschen Bedingung und nicht zu einem `in ()`.
     */
    fun getRequirementsForNamedParticipants(
        eventId: UUID,
        namedParticipantIds: List<UUID>
    ): JIO<List<EventHasParticipantRequirementRecord>> = Jooq.query {
        selectFrom(EVENT_HAS_PARTICIPANT_REQUIREMENT)
            .where(
                EVENT_HAS_PARTICIPANT_REQUIREMENT.EVENT.eq(eventId)
                    .and(
                        (if (namedParticipantIds.isEmpty()) DSL.falseCondition()
                        else EVENT_HAS_PARTICIPANT_REQUIREMENT.NAMED_PARTICIPANT.`in`(namedParticipantIds))
                            .or(EVENT_HAS_PARTICIPANT_REQUIREMENT.NAMED_PARTICIPANT.isNull)
                    )
            )
            .fetch()
    }

    fun assignRequirementToNamedParticipant(
        eventId: UUID,
        participantRequirementId: UUID,
        namedParticipantId: UUID?,
        qrCodeRequired: Boolean,
        createdBy: UUID
    ): JIO<EventHasParticipantRequirementRecord> = Jooq.query {
        insertInto(EVENT_HAS_PARTICIPANT_REQUIREMENT)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.EVENT, eventId)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.PARTICIPANT_REQUIREMENT, participantRequirementId)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.NAMED_PARTICIPANT, namedParticipantId)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.QR_CODE_REQUIRED, qrCodeRequired)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.CREATED_AT, DSL.currentLocalDateTime())
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.CREATED_BY, createdBy)
            .onConflictDoNothing()
            .returning()
            .fetchOne()!!
    }

    fun updateQrCodeRequirement(
        eventId: UUID,
        participantRequirementId: UUID,
        namedParticipantId: UUID?,
        qrCodeRequired: Boolean
    ): JIO<Int> = Jooq.query {
        update(EVENT_HAS_PARTICIPANT_REQUIREMENT)
            .set(EVENT_HAS_PARTICIPANT_REQUIREMENT.QR_CODE_REQUIRED, qrCodeRequired)
            .where(
                EVENT_HAS_PARTICIPANT_REQUIREMENT.EVENT.eq(eventId)
                    .and(EVENT_HAS_PARTICIPANT_REQUIREMENT.PARTICIPANT_REQUIREMENT.eq(participantRequirementId))
                    .and(
                        if (namedParticipantId != null)
                            EVENT_HAS_PARTICIPANT_REQUIREMENT.NAMED_PARTICIPANT.eq(namedParticipantId)
                        else
                            EVENT_HAS_PARTICIPANT_REQUIREMENT.NAMED_PARTICIPANT.isNull
                    )
            )
            .execute()
    }

}