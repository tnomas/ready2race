package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

// No existing view (competition_match_team_with_registration, startlist_view, ...) carries event id,
// competition name and match name alongside a flat per-team row, so this joins the chain explicitly,
// mirroring the flat-row + group-in-Kotlin style used by CompetitionMatchTeamRepo/EventInfoService
// (one row per participant, grouped by competitionMatchTeam id in TimingService.getTeams).
object TimingTeamRepo {

    fun getByEvent(eventId: UUID) = Jooq.query {
        select(
            COMPETITION_MATCH_TEAM.ID,
            COMPETITION_MATCH_TEAM.START_NUMBER,
            COMPETITION_REGISTRATION.NAME.`as`("team_name"),
            CLUB.NAME.`as`("club_name"),
            COMPETITION_PROPERTIES.NAME.`as`("competition_name"),
            COMPETITION_SETUP_MATCH.NAME.`as`("match_name"),
            PARTICIPANT.FIRSTNAME,
            PARTICIPANT.LASTNAME,
        )
            .from(COMPETITION_MATCH_TEAM)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .leftJoin(COMPETITION_REGISTRATION)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION.eq(COMPETITION_REGISTRATION.ID))
            .leftJoin(CLUB).on(CLUB.ID.eq(COMPETITION_REGISTRATION.CLUB))
            .leftJoin(COMPETITION_REGISTRATION_NAMED_PARTICIPANT)
            .on(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION.eq(COMPETITION_REGISTRATION.ID))
            .leftJoin(PARTICIPANT).on(PARTICIPANT.ID.eq(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT))
            .where(COMPETITION.EVENT.eq(eventId))
            .fetch()
    }
}
