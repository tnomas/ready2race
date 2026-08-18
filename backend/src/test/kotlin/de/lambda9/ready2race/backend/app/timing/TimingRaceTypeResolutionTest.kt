package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.control.TimingRaceTypeResolution
import de.lambda9.ready2race.backend.app.timing.control.TimingRaceTypeResolution.ScheduledMatch
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * The decision "which race type applies right now" without a database - it is a function of the
 * event's running order alone, and this is where that is pinned down.
 */
class TimingRaceTypeResolutionTest {

    private val base: LocalDateTime = LocalDateTime.of(2026, 8, 18, 10, 0)
    private val timeTrial = UUID.randomUUID()
    private val massStart = UUID.randomUUID()

    private fun match(
        minutes: Long?,
        raceType: UUID?,
        startedAt: LocalDateTime? = null,
        finishedAt: LocalDateTime? = null,
    ) = ScheduledMatch(
        startTime = minutes?.let { base.plusMinutes(it) },
        startedAt = startedAt,
        finishedAt = finishedAt,
        raceType = raceType,
    )

    @Test
    fun noMatchesResolvesToNothing() {
        assertNull(TimingRaceTypeResolution.resolve(emptyList()))
    }

    @Test
    fun picksTheEarliestScheduledMatch() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(30, massStart),
                match(10, timeTrial),
                match(20, massStart),
            )
        )
        assertEquals(timeTrial, resolved)
    }

    // The heat that is under way tells nobody how the NEXT one starts - a board being armed is
    // being armed for what comes after.
    @Test
    fun skipsMatchesThatAlreadyStarted() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(10, timeTrial, startedAt = base.plusMinutes(10)),
                match(20, massStart),
            )
        )
        assertEquals(massStart, resolved)
    }

    @Test
    fun skipsFinishedMatchesEvenWithoutAStartStamp() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(10, timeTrial, finishedAt = base.plusMinutes(15)),
                match(20, massStart),
            )
        )
        assertEquals(massStart, resolved)
    }

    // A round without a race type is not an answer - the search continues instead of reporting
    // "nothing configured" while a later round clearly declares one.
    @Test
    fun skipsRoundsWithoutARaceType() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(10, null),
                match(20, timeTrial),
            )
        )
        assertEquals(timeTrial, resolved)
    }

    // An unscheduled match is the one nobody can point at on the timetable either.
    @Test
    fun unscheduledMatchesComeLast() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(null, massStart),
                match(30, timeTrial),
            )
        )
        assertEquals(timeTrial, resolved)
    }

    @Test
    fun fallsBackToAnUnscheduledMatchWhenNothingIsScheduled() {
        val resolved = TimingRaceTypeResolution.resolve(listOf(match(null, massStart)))
        assertEquals(massStart, resolved)
    }

    @Test
    fun resolvesToNothingWhenNoRoundDeclaresARaceType() {
        assertNull(TimingRaceTypeResolution.resolve(listOf(match(10, null), match(20, null))))
    }

    // Matches of one wave share a start time; the caller's order decides, and it must not be
    // shuffled by the sort.
    @Test
    fun keepsTheGivenOrderForMatchesSharingAStartTime() {
        val resolved = TimingRaceTypeResolution.resolve(
            listOf(
                match(10, massStart),
                match(10, timeTrial),
            )
        )
        assertEquals(massStart, resolved)
    }
}
