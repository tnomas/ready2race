package de.lambda9.ready2race.backend.app.timing.control

import java.time.LocalDateTime
import java.util.UUID

/**
 * Picks the race type that applies to the work a station is about to do.
 *
 * Deliberately pure: the database side only has to hand over the event's matches with their
 * schedule, their started state and their round's race type - the decision itself is a function of
 * that list alone, which is what makes it testable without a database.
 *
 * The rule is the one a timekeeper would apply by looking at the running order: the next heat that
 * has not started yet, earliest scheduled first, and among those the first one whose round actually
 * declares a race type. Matches without a schedule time come last - they are the ones nobody can
 * point at on the timetable either.
 */
object TimingRaceTypeResolution {

    /** One candidate heat, flattened to exactly what the decision needs. */
    data class ScheduledMatch(
        val startTime: LocalDateTime?,
        val startedAt: LocalDateTime?,
        val finishedAt: LocalDateTime?,
        val raceType: UUID?,
    )

    /**
     * The race type of the earliest un-started match whose round declares one, or null when the
     * event has no such match (nothing left to start, or no round assigned a race type).
     *
     * Already started matches are skipped: their start mode is history, and a board that is being
     * armed is being armed for what comes next. A finished match is skipped too even when nobody
     * ever stamped its start - a heat that is over is not what anybody is about to start.
     */
    fun resolve(matches: List<ScheduledMatch>): UUID? = matches
        .asSequence()
        .filter { it.startedAt == null && it.finishedAt == null }
        // sortedWith is stable, so matches sharing a start time (a wave started together) keep the
        // order the query delivered them in instead of being shuffled arbitrarily.
        .sortedWith(compareBy(nullsLast<LocalDateTime>()) { it.startTime })
        .firstOrNull { it.raceType != null }
        ?.raceType
}
