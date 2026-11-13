package de.lambda9.ready2race.backend.app.competitionRegistration.control

import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRegistrationNamedParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_REGISTRATION_NAMED_PARTICIPANT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.tailwind.jooq.Jooq
import java.util.*

object CompetitionRegistrationNamedParticipantRepo {

    fun create(record: CompetitionRegistrationNamedParticipantRecord) = COMPETITION_REGISTRATION_NAMED_PARTICIPANT.insert(record)

    fun existsByParticipantId(participantId: UUID) = COMPETITION_REGISTRATION_NAMED_PARTICIPANT.exists {
        PARTICIPANT.eq(participantId)
    }

    fun existsByParticipantIdAndCompetitionId(participantId: UUID?, competitionId: UUID?) = Jooq.query {
       fetchExists(
           COMPETITION_REGISTRATION_NAMED_PARTICIPANT
           .join(COMPETITION_REGISTRATION).on(COMPETITION_REGISTRATION.ID.eq(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION))
           .where(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT.eq(participantId)
           .and(COMPETITION_REGISTRATION.COMPETITION.eq(competitionId)))
       )
    }

    /**
     * Steht die Person in dieser Meldung, und gehört die Meldung zu dieser Veranstaltung? Grundlage
     * für alles, was ein Challenge-Zugangstoken (Veranstaltung × Person) an einer Meldung darf.
     */
    fun isParticipantOfRegistrationInEvent(participantId: UUID, registrationId: UUID, eventId: UUID) = Jooq.query {
        fetchExists(
            COMPETITION_REGISTRATION_NAMED_PARTICIPANT
                .join(COMPETITION_REGISTRATION)
                .on(COMPETITION_REGISTRATION.ID.eq(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION))
                .join(COMPETITION).on(COMPETITION.ID.eq(COMPETITION_REGISTRATION.COMPETITION))
                .where(
                    COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT.eq(participantId)
                        .and(COMPETITION_REGISTRATION.ID.eq(registrationId))
                        .and(COMPETITION.EVENT.eq(eventId))
                )
        )
    }

    /** Die Meldung hinter einem Ergebnisbeleg (über die Mannschaft im Lauf). */
    fun registrationOfMatchTeam(matchTeamId: UUID) = Jooq.query {
        select(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION)
            .from(COMPETITION_MATCH_TEAM)
            .where(COMPETITION_MATCH_TEAM.ID.eq(matchTeamId))
            .fetchOne(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION)
    }

    fun deleteAllByRegistrationId(registrationId: UUID) =
        COMPETITION_REGISTRATION_NAMED_PARTICIPANT.delete { COMPETITION_REGISTRATION.eq(registrationId) }
}