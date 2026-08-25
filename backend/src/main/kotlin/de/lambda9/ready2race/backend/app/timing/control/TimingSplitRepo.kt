package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/** Eine zugeordnete, aktive Marke samt ihrem Wettkampf - der Zuschnitt der Zwischenzeit. */
data class SplitMarkRow(
    val competition: UUID,
    val competitionMatchTeam: UUID,
    val station: UUID,
    val stationType: TimingStationType,
    val timestampMillis: Long,
)

/**
 * Die Lesewege der Zwischenzeiten - beide auf INTERN gezeitete Veranstaltungen zugeschnitten.
 *
 * Der Zuschnitt ist der Kern und keine Beiläufigkeit: `competition_match_team_lap` hat zwei
 * Schreiber, den RaceClocker-Abruf und die hauseigene Zeitnahme. Getrennt sind sie allein über
 * das Zeitnahme-System der Veranstaltung - der Abruf fasst nur RACECLOCKER-Veranstaltungen an
 * ([RaceClockerPollRepo]), diese Schicht nur INTERN. Weil der Dienst ausschließlich schreibt, was
 * er hier gelesen hat, kann er eine RaceClocker-Zeile gar nicht erreichen. Formuliert wie überall
 * sonst auch (vgl. [TimingMatchRepo]): das System steht an der Veranstaltung.
 */
object TimingSplitRepo {

    private val internSystem = EVENT.TIMING_SYSTEM.eq(TimingSystem.INTERN.name)

    /**
     * Die zugeordneten ACTIVE-Marken der Veranstaltung, die für eine Zwischenzeit zählen: START
     * (der Bezugspunkt) und SPLIT (die Durchfahrt). FINISH bleibt draußen - die Zielzeit ist die
     * offizielle Zeit und keine Zwischenzeit.
     *
     * Zurückgenommene Marken fallen wie bei den offiziellen Zeiten schon hier heraus: Sie sind
     * genau die Marken, die der Zeitnehmer für nichtig erklärt hat.
     */
    fun getAssignedActiveMarks(eventId: UUID): JIO<List<SplitMarkRow>> = Jooq.query {
        select(
            COMPETITION.ID,
            TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM,
            TIMING_STATION.ID,
            TIMING_STATION.TYPE,
            TIMING_TIME_MARK.TIMESTAMP_MILLIS,
        )
            .from(TIMING_TIME_MARK)
            .join(TIMING_ASSIGNMENT).on(TIMING_ASSIGNMENT.TIME_MARK.eq(TIMING_TIME_MARK.ID))
            .join(TIMING_STATION).on(TIMING_STATION.ID.eq(TIMING_TIME_MARK.STATION))
            .join(COMPETITION_MATCH_TEAM)
            .on(COMPETITION_MATCH_TEAM.ID.eq(TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM))
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .where(TIMING_TIME_MARK.EVENT.eq(eventId))
            .and(TIMING_TIME_MARK.STATUS.eq("ACTIVE"))
            .and(internSystem)
            .and(
                TIMING_STATION.TYPE.`in`(
                    TimingStationType.START.name,
                    TimingStationType.SPLIT.name,
                )
            )
            .fetch { record ->
                SplitMarkRow(
                    // Im Schema durchweg not null; die Projektion verliert nur die Garantie.
                    competition = record[COMPETITION.ID]!!,
                    competitionMatchTeam = record[TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM]!!,
                    station = record[TIMING_STATION.ID]!!,
                    stationType = TimingStationType.valueOf(record[TIMING_STATION.TYPE]!!),
                    timestampMillis = record[TIMING_TIME_MARK.TIMESTAMP_MILLIS]!!,
                )
            }
    }

    /**
     * Die Boote dieser Veranstaltung, an denen bereits Zwischenzeiten stehen.
     *
     * Ohne sie bliebe eine Zeile stehen, deren Grundlage verschwunden ist: Wird die Zuordnung
     * einer Marke gelöst, fällt die Marke aus [getAssignedActiveMarks] heraus - und mit ihr das
     * Boot, dessen Zeile abzuräumen wäre. Die geschriebene Zeile ist die zweite Spur, auf der der
     * Dienst seine eigenen Boote wiederfindet.
     */
    fun getTeamsWithLaps(eventId: UUID): JIO<List<UUID>> = Jooq.query {
        selectDistinct(COMPETITION_MATCH_TEAM_LAP.COMPETITION_MATCH_TEAM)
            .from(COMPETITION_MATCH_TEAM_LAP)
            .join(COMPETITION_MATCH_TEAM)
            .on(COMPETITION_MATCH_TEAM.ID.eq(COMPETITION_MATCH_TEAM_LAP.COMPETITION_MATCH_TEAM))
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(internSystem)
            .fetch { it[COMPETITION_MATCH_TEAM_LAP.COMPETITION_MATCH_TEAM]!! }
    }
}
