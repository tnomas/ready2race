package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.Condition
import org.jooq.impl.DSL
import java.util.UUID

// No existing view (competition_match_team_with_registration, startlist_view, ...) carries event id,
// competition name and match name alongside a flat per-team row, so this joins the chain explicitly,
// mirroring the flat-row + group-in-Kotlin style used by CompetitionMatchTeamRepo/EventInfoService
// (one row per participant, grouped by competitionMatchTeam id in TimingService.getTeams).
object TimingTeamRepo {

    /**
     * The effective timing system of a team's competition: the competition's own choice, else the
     * event's default.
     *
     * The inverse of the RaceClocker side (`RaceClockerPollRepo.getCandidates`, which coalesces the
     * same two columns and keeps RACECLOCKER) - one rule, read from both ends, so a competition can
     * never be served by both timing sources at once. Built as a bare expression without an alias for
     * the same reason as there: jOOQ renders a reused aliased field in the WHERE clause as the mere
     * alias identifier, which Postgres rejects.
     */
    private val effectiveTimingSystem = DSL.coalesce(COMPETITION.TIMING_SYSTEM, EVENT.TIMING_SYSTEM)

    private val isReady2Race: Condition = effectiveTimingSystem.eq(TimingSystem.READY2RACE.name)

    /**
     * Of [eventId]'s teams (optionally narrowed to [teams]), those whose competition is timed with
     * this application.
     *
     * Joined over the MATCH chain rather than over the registration: a bye team carries no
     * `competition_registration`, and taking the registration route would silently drop it.
     */
    fun getReady2RaceTeamIds(eventId: UUID, teams: Collection<UUID>? = null): JIO<Set<UUID>> = Jooq.query {
        if (teams != null && teams.isEmpty()) return@query emptySet()
        select(COMPETITION_MATCH_TEAM.ID)
            .from(COMPETITION_MATCH_TEAM)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(isReady2Race)
            .let { step -> if (teams == null) step else step.and(COMPETITION_MATCH_TEAM.ID.`in`(teams)) }
            .fetchSet(COMPETITION_MATCH_TEAM.ID)
            .filterNotNull()
            .toSet()
    }

    /** Whether this single team's competition is timed with this application. */
    fun isReady2RaceTeam(teamId: UUID): JIO<Boolean> = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION_MATCH_TEAM)
                .join(COMPETITION_SETUP_MATCH)
                .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
                .join(COMPETITION_SETUP_ROUND)
                .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
                .join(COMPETITION_PROPERTIES)
                .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
                .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
                .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
                .where(COMPETITION_MATCH_TEAM.ID.eq(teamId))
                .and(isReady2Race)
        )
    }

    // Only the boats this application actually times: a RaceClocker competition's teams must not
    // even be offerable in the assignment UI, or an operator can wipe the laps its feed just wrote.
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
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .leftJoin(COMPETITION_REGISTRATION)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_REGISTRATION.eq(COMPETITION_REGISTRATION.ID))
            .leftJoin(CLUB).on(CLUB.ID.eq(COMPETITION_REGISTRATION.CLUB))
            .leftJoin(COMPETITION_REGISTRATION_NAMED_PARTICIPANT)
            .on(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.COMPETITION_REGISTRATION.eq(COMPETITION_REGISTRATION.ID))
            .leftJoin(PARTICIPANT).on(PARTICIPANT.ID.eq(COMPETITION_REGISTRATION_NAMED_PARTICIPANT.PARTICIPANT))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(isReady2Race)
            .fetch()
    }
}
