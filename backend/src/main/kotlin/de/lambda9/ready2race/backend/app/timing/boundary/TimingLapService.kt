package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamLapRepo
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.control.AssignedMarkRow
import de.lambda9.ready2race.backend.app.timing.control.TimingResultRepo
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchTeamLapRecord
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID

/**
 * The bridge from timing marks into the structures the rest of the application already shows:
 * intermediate times become `competition_match_team_lap` rows (the Rundenband, the boards, the
 * execution views), and a fired start sequence stamps `competition_match.started_at`.
 *
 * Both are deliberately one-way. Timing owns the marks; these writes make the existing views work
 * with internal timing WITHOUT any of them having to learn about stations, marks or assignments -
 * exactly what the RaceClocker feed already does through
 * `CompetitionExecutionService.applyLapsFromFeed` / `markMatchStarted`, whose shape is mirrored
 * here.
 */
object TimingLapService {

    /**
     * Rewrites the laps of [teamIds] from their currently assigned, ACTIVE marks.
     *
     * Called from every mutation that can change what a team's laps would be: assigning a mark,
     * re-assigning it to another boat, detaching it, retracting it, and firing a start (a new start
     * mark shifts EVERY lap of that boat, which is why the whole set is recomputed rather than
     * patched).
     *
     * Shape of a lap row - `name` = station name, `position` = station sorting, `lap_millis` = mark
     * minus the boat's start:
     *
     * - **No start mark yet:** nothing can be computed, so nothing is written. Existing rows are
     *   still removed - they would describe a start that no longer exists (same rule as
     *   `applyLapsFromFeed`, which clears a boat's laps when the feed drops its start).
     * - **Upsert, not replace:** `created_at` is when a mark FIRST arrived, and the Rundenband of
     *   the livestream sorts by it. [CompetitionMatchTeamLapRepo.upsert] keeps it; only name and
     *   time are pulled along.
     * - **Marks before the start** (a split captured while the boat was still behind the line) are
     *   dropped instead of stored as a negative lap.
     *
     * The boat's own `competition_match_team.started_at` is written from the same start mark - the
     * column `applyLapsFromFeed` fills from the RaceClocker feed, and the one the time-trial views
     * read to tell who is already on the water (`competition_match.started_at` only says that
     * SOMEBODY started). Cleared again when the start mark is gone, for the same reason the laps are:
     * it would describe a start that no longer exists.
     *
     * Caveat by design: a boat whose laps came from a RaceClocker pull and that is then touched by
     * internal timing has them replaced. Both sources writing the same boat is a misconfiguration -
     * the timing system is chosen per event ([de.lambda9.ready2race.backend.app.timingConfig]) - and
     * the last writer wins, just as it does for times.
     */
    fun syncLaps(
        eventId: UUID,
        teamIds: Collection<UUID>,
        userId: UUID?,
    ): App<Nothing, Unit> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.unit

        val marks = !TimingResultRepo.getAssignedActiveMarks(eventId, distinct).orDie()
        val byTeam = marks.groupBy { it.competitionMatchTeam }
        val now = LocalDateTime.now()

        !distinct.traverse { teamId ->
            KIO.comprehension {
                val teamMarks = byTeam[teamId].orEmpty()
                val records = lapRecords(teamId, teamMarks, userId, now)
                if (records.isNotEmpty()) {
                    !CompetitionMatchTeamLapRepo.upsert(records).orDie()
                }
                // Removes what the marks no longer support - a retracted split, or every lap of a
                // boat that lost its start.
                !CompetitionMatchTeamLapRepo.deleteBeyond(teamId, records.map { it.position }).orDie()
                !writeTeamStartedAt(teamId, teamMarks, userId, now)
                KIO.unit
            }
        }

        // Laps feed the polled public views (Rundenband, boards); without this they would show the
        // old set until the cache TTL expired.
        EventChangeMarker.bump(eventId)
        KIO.unit
    }

    /**
     * Stamps the matches of [teamIds] as started, idempotently.
     *
     * Called when a start sequence fires: the boats leave the line, and every view that asks "is
     * this heat running?" (LiveDashboard, the stream clock, the schedule) reads
     * `competition_match.started_at` - the same column the RaceClocker start detection and the
     * office's "Läuft" button write. Mirrors `CompetitionExecutionService.markMatchStarted`: both
     * stamps are only set when still empty, so a heat started by hand keeps its original instant and
     * a re-fired sequence never moves it.
     *
     * Carries that method's challenge-event guard too: a challenge event has no heats that run, and
     * `started_at` means nothing there. It is a silent skip rather than an error because the only
     * caller is the start scheduler ([TimingSequenceService.fireDueEntries], `App<Nothing, _>`) -
     * there is no request to answer with a 409, and the mark itself is still perfectly valid. The
     * boat's own start (see [syncLaps]) is written either way; only the match stamp is skipped.
     */
    fun markMatchesStarted(
        eventId: UUID,
        teamIds: Collection<UUID>,
        userId: UUID?,
    ): App<Nothing, Unit> = KIO.comprehension {
        val distinct = teamIds.distinct()
        if (distinct.isEmpty()) return@comprehension KIO.unit

        val isChallengeEvent = !EventRepo.isChallengeEvent(eventId).orDie()
        if (isChallengeEvent == true) return@comprehension KIO.unit

        val teams = !CompetitionMatchTeamRepo.getByIds(distinct).orDie()
        val matchIds = teams.map { it.competitionMatch }.distinct()
        if (matchIds.isEmpty()) return@comprehension KIO.unit

        val now = LocalDateTime.now()
        !matchIds.traverse { matchId ->
            CompetitionMatchRepo.update(matchId) {
                if (startedAt == null) {
                    startedAt = now
                }
                if (activatedAt == null) {
                    activatedAt = now
                }
                updatedBy = userId
                updatedAt = now
            }.orDie()
        }

        EventChangeMarker.bump(eventId)
        KIO.unit
    }

    /**
     * Stamps (or clears) the boat's own measured start from its currently assigned START marks.
     *
     * Unlike the match-level stamp this one is NOT idempotent-once: it follows the marks. A restart
     * moves it, a retracted or re-assigned start mark clears it - the same "the feed is the truth"
     * rule `applyLapsFromFeed` applies to the RaceClocker side, with the marks in the feed's place.
     * The write is skipped when nothing changes, so an unrelated lap sync leaves the audit columns
     * alone.
     */
    private fun writeTeamStartedAt(
        teamId: UUID,
        marks: List<AssignedMarkRow>,
        userId: UUID?,
        now: LocalDateTime,
    ): App<Nothing, Unit> = KIO.comprehension {
        val startMillis = marks.filter { it.stationType == TimingStationType.START }
            .maxOfOrNull { it.timestampMillis }
        val startedAtValue = startMillis?.let {
            LocalDateTime.ofInstant(Instant.ofEpochMilli(it), ZoneId.systemDefault())
        }

        val team = !CompetitionMatchTeamRepo.getById(teamId).orDie()
        if (team == null || team.startedAt == startedAtValue) return@comprehension KIO.unit

        !CompetitionMatchTeamRepo.updateById(teamId) {
            startedAt = startedAtValue
            updatedBy = userId
            updatedAt = now
        }.orDie()
        KIO.unit
    }

    private fun lapRecords(
        teamId: UUID,
        marks: List<AssignedMarkRow>,
        userId: UUID?,
        now: LocalDateTime,
    ): List<CompetitionMatchTeamLapRecord> {
        // The latest start is the one the boat actually took (a restart adds a second mark).
        val start = marks.filter { it.stationType == TimingStationType.START }
            .maxOfOrNull { it.timestampMillis }
            ?: return emptyList()

        return marks.filter { it.stationType == TimingStationType.SPLIT }
            // A double tap on the same split station is one crossing: the earliest is the real one,
            // mirroring how the finish mark is picked.
            .groupBy { it.station }
            .mapNotNull { (_, stationMarks) -> stationMarks.minByOrNull { it.timestampMillis } }
            .sortedWith(compareBy({ it.stationSorting }, { it.stationName }))
            // `position` is the station's sorting and is unique per boat by the lap table's index.
            // Two split stations sorted alike would collide; the first in that order wins, which is
            // stable and visible in the station admin rather than silently random.
            .distinctBy { it.stationSorting }
            .mapNotNull { mark ->
                val lapMillis = mark.timestampMillis - start
                if (lapMillis < 0) return@mapNotNull null
                CompetitionMatchTeamLapRecord(
                    id = UUID.randomUUID(),
                    competitionMatchTeam = teamId,
                    position = mark.stationSorting,
                    name = mark.stationName,
                    lapMillis = lapMillis,
                    createdAt = now,
                    createdBy = userId,
                )
            }
    }
}
