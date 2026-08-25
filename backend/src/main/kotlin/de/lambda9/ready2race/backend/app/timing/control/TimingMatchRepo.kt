package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID

/** Eine Partie der Posten-Startliste, flach aus der Kette gelesen. */
data class TimingMatchRow(
    val setupMatchId: UUID,
    val matchName: String?,
    val executionOrder: Int,
    val competitionId: UUID,
    val competitionName: String?,
    val competitionIdentifier: String?,
    val competitionShortName: String?,
    val roundId: UUID,
    val roundName: String?,
    val startTime: LocalDateTime?,
    val startedAt: LocalDateTime?,
    val finishedAt: LocalDateTime?,
    val activatedAt: LocalDateTime?,
)

/** Ein Team einer Partie, reduziert auf das, was die Startliste zeigt. */
data class TimingMatchTeamRow(
    val setupMatchId: UUID,
    val teamId: UUID,
    val startNumber: Int,
    val teamName: String?,
    val clubName: String?,
)

/** Eine Setup-Runde der Veranstaltung, für die Kettenwanderung der Sortierung. */
data class TimingRoundRow(
    val id: UUID,
    val nextRound: UUID?,
)

/**
 * Liest die Partien der INTERN gezeiteten Wettkämpfe einer Veranstaltung - der Zuschnitt der
 * Posten-Startliste.
 *
 * Der Filter ist derselbe wie überall (das Zeitnahme-System steht an der Veranstaltung, vgl.
 * RaceClockerPollRepo): nur eine Veranstaltung auf INTERN gehört den internen Posten - eine
 * RaceClocker-Veranstaltung taucht hier nie auf. Und nur materialisierte Partien (inner join auf
 * competition_match) zählen: eine Runde, deren Läufe noch nicht angelegt sind, ist für die Posten
 * schlicht noch nicht da (Anschluss an die Richtung von "Scope timing boards to the matches that
 * are actually expected").
 */
object TimingMatchRepo {

    private val internSystem = EVENT.TIMING_SYSTEM.eq(TimingSystem.INTERN.name)

    fun getMatchesByEvent(eventId: UUID): JIO<List<TimingMatchRow>> = Jooq.query {
        select(
            COMPETITION_SETUP_MATCH.ID,
            COMPETITION_SETUP_MATCH.NAME,
            COMPETITION_SETUP_MATCH.EXECUTION_ORDER,
            COMPETITION.ID,
            COMPETITION_PROPERTIES.NAME,
            COMPETITION_PROPERTIES.IDENTIFIER,
            COMPETITION_PROPERTIES.SHORT_NAME,
            COMPETITION_SETUP_ROUND.ID,
            COMPETITION_SETUP_ROUND.NAME,
            COMPETITION_MATCH.START_TIME,
            COMPETITION_MATCH.STARTED_AT,
            COMPETITION_MATCH.FINISHED_AT,
            COMPETITION_MATCH.ACTIVATED_AT,
        )
            .from(COMPETITION_MATCH)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .and(internSystem)
            // Ein Freilos wird nie gefahren - es sei denn, es muss (dieselbe Regel wie
            // TimingTeamRepo, dort je Team; hier fällt gleich die ganze Partie weg).
            .and(COMPETITION_MATCH.BYE_NAME.isNull.or(COMPETITION_MATCH.BYE_MUST_RACE.isTrue))
            .fetch { record ->
                TimingMatchRow(
                    setupMatchId = record[COMPETITION_SETUP_MATCH.ID]!!,
                    matchName = record[COMPETITION_SETUP_MATCH.NAME],
                    executionOrder = record[COMPETITION_SETUP_MATCH.EXECUTION_ORDER]!!,
                    competitionId = record[COMPETITION.ID]!!,
                    competitionName = record[COMPETITION_PROPERTIES.NAME],
                    competitionIdentifier = record[COMPETITION_PROPERTIES.IDENTIFIER],
                    competitionShortName = record[COMPETITION_PROPERTIES.SHORT_NAME],
                    roundId = record[COMPETITION_SETUP_ROUND.ID]!!,
                    roundName = record[COMPETITION_SETUP_ROUND.NAME],
                    startTime = record[COMPETITION_MATCH.START_TIME],
                    startedAt = record[COMPETITION_MATCH.STARTED_AT],
                    finishedAt = record[COMPETITION_MATCH.FINISHED_AT],
                    activatedAt = record[COMPETITION_MATCH.ACTIVATED_AT],
                )
            }
    }

    /**
     * Die Teams der intern gezeiteten Partien, ein Team je Zeile (ohne Teilnehmernamen - die
     * liefert /timing/teams; die Startliste braucht Boot, Startnummer und Verein).
     */
    fun getMatchTeamsByEvent(eventId: UUID): JIO<List<TimingMatchTeamRow>> = Jooq.query {
        select(
            COMPETITION_MATCH_TEAM.COMPETITION_MATCH,
            COMPETITION_MATCH_TEAM.ID,
            COMPETITION_MATCH_TEAM.START_NUMBER,
            COMPETITION_REGISTRATION.NAME,
            CLUB.NAME,
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
            .where(COMPETITION.EVENT.eq(eventId))
            .and(internSystem)
            .fetch { record ->
                TimingMatchTeamRow(
                    setupMatchId = record[COMPETITION_MATCH_TEAM.COMPETITION_MATCH]!!,
                    teamId = record[COMPETITION_MATCH_TEAM.ID]!!,
                    startNumber = record[COMPETITION_MATCH_TEAM.START_NUMBER]!!,
                    teamName = record[COMPETITION_REGISTRATION.NAME],
                    clubName = record[CLUB.NAME],
                )
            }
    }

    /**
     * Alle Setup-Runden der Veranstaltung (auch die ohne materialisierte Partien): die
     * Kettenwanderung der Sortierung (`TimingStartOrderLogic.roundOrder`) braucht die VOLLE Kette
     * - fehlte eine Zwischenrunde, bekämen die dahinter falsche Indizes.
     */
    fun getRoundsByEvent(eventId: UUID): JIO<List<TimingRoundRow>> = Jooq.query {
        select(
            COMPETITION_SETUP_ROUND.ID,
            COMPETITION_SETUP_ROUND.NEXT_ROUND,
        )
            .from(COMPETITION_SETUP_ROUND)
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .fetch { record ->
                TimingRoundRow(
                    id = record[COMPETITION_SETUP_ROUND.ID]!!,
                    nextRound = record[COMPETITION_SETUP_ROUND.NEXT_ROUND],
                )
            }
    }
}
