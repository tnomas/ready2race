package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.competitionExecution.entity.MatchTeamLapDto
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardParticipant
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardResult
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardResultTeam
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardStartState
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardTeam
import de.lambda9.ready2race.backend.app.matchStatus.entity.MatchState
import de.lambda9.ready2race.backend.app.stream.entity.StreamFinishEntry
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import java.time.Duration
import java.time.LocalDateTime
import java.util.UUID

/**
 * Probemodus-Datenquelle (`StreamSceneDto.trialMode`): liefert [resolveScene] eine feste,
 * erfundene Szene, damit eine Regie eine Konfiguration ohne echten Wettkampfbetrieb ansehen kann.
 *
 * [trialInput] ist rein: kein Uhrzugriff, kein Zufall, nur `now` als Parameter. Dieselbe `now`
 * liefert immer dieselbe [StreamResolverInput] - der 3-Minuten-Loop wird ausschließlich über die
 * Modulo-Rechnung aus `now` abgeleitet.
 *
 * Ablauf der 180-Sekunden-Schleife (Sekunden ab Schleifenbeginn):
 * - 0–30 s: Vorbereitung (STARTLIST/NEXT_UP über `preparing`/`preparingSince`)
 * - 30–60 s: Startsequenz (CLOCK-Countdown über `sequenceStartedAt`)
 * - 60–150 s: Rennen (LAPS alle 20 s, FINISH_TICKER-Einläufe ab Sekunde 120)
 * - 150–180 s: Ergebnis (RESULT, in der ersten Hälfte des Fensters `provisional`)
 */

/**
 * Fester Bezugspunkt für die Loop-Rechnung. Der genaue Wert ist beliebig - entscheidend ist nur,
 * dass er konstant bleibt, damit dieselbe `now` immer dieselbe Loop-Phase ergibt.
 */
val TRIAL_LOOP_EPOCH: LocalDateTime = LocalDateTime.of(2000, 1, 1, 0, 0)

private const val LOOP_SECONDS = 180L
private const val PREPARING_END = 30L
private const val SEQUENCE_END = 60L
private const val RUNNING_END = 150L

/** Erste Hälfte des Ergebnisfensters (150–165 s) gilt als vorläufig, siehe Task-Vorgabe. */
private const val PROVISIONAL_RESULT_END = 165L

private val TRIAL_MATCH_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000701")
private const val TRIAL_COMPETITION_NAME = "Achter Herren (Probemodus)"

private data class TrialLane(val startNumber: Int, val clubShort: String, val crew: List<String>)

/** 4 Bahnen mit erfundenen Vereins- und Besatzungsnamen — so zeigen Startliste, Ergebnis und
 *  Einlauf-Ticker im Probemodus dieselben Zeilen wie im echten Betrieb, Namen inklusive. */
private val TRIAL_LANES: List<TrialLane> = listOf(
    TrialLane(1, "RC Demo", listOf("Anna Beispiel", "Ben Beispiel")),
    TrialLane(2, "SC Probe", listOf("Clara Probe", "David Probe")),
    TrialLane(3, "RV Muster", listOf("Emma Muster", "Finn Muster")),
    TrialLane(4, "RG Fiktiv", listOf("Greta Fiktiv", "Henry Fiktiv")),
)

/** Zwischenzeiten-Stellen des Demo-Laufs, alle 20 s ab Rennstart (Sekunde 60 der Schleife). */
private val SPLIT_OFFSETS: List<Pair<Long, String>> = listOf(
    20L to "500 m",
    40L to "1000 m",
    60L to "1500 m",
    80L to "2000 m",
)

/**
 * Ziel-Reihenfolge des Demo-Laufs, als Sekunden nach Rennstart - Index in [TRIAL_LANES], Bahn 1
 * gewinnt in dieser erfundenen Wiederholung immer. Alle Werte liegen vor [RUNNING_END] - [SEQUENCE_END]
 * (90 s Rennfenster), damit bis Sekunde 150 alle vier Boote im Ziel sind.
 */
private val FINISH_OFFSETS: List<Long> = listOf(60L, 68L, 76L, 84L)

/**
 * Alle Sekunden der Schleife, an denen sich die Ausgabe von [trialInput] ÄNDERT: die vier
 * Phasengrenzen, das Umschlagen auf „nicht mehr vorläufig", jede Zwischenzeit und jeder
 * Zieleinlauf. Abgeleitet aus denselben Konstanten wie die Schleife selbst - eine neue Zwischenzeit
 * bekommt ihren Weckzeitpunkt damit automatisch mit.
 */
private val LOOP_BOUNDARIES: List<Long> = (
    listOf(PREPARING_END, SEQUENCE_END, RUNNING_END, PROVISIONAL_RESULT_END, LOOP_SECONDS) +
        SPLIT_OFFSETS.map { (offset, _) -> SEQUENCE_END + offset } +
        FINISH_OFFSETS.map { SEQUENCE_END + it }
    ).distinct().sorted()

/** Sekunden seit Beginn der aktuellen Schleifenrunde — die eine Modulo-Rechnung für alles hier. */
private fun secondsIntoLoop(now: LocalDateTime): Long {
    val secondsSinceEpoch = Duration.between(TRIAL_LOOP_EPOCH, now).seconds
    // Kotlins % kann bei negativer Differenz (now vor dem Bezugspunkt) negativ werden - der
    // zweite Modulo hebt das Ergebnis zuverlässig in den Bereich [0, LOOP_SECONDS) an.
    return ((secondsSinceEpoch % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS
}

/**
 * Der nächste Zeitpunkt NACH [now], an dem die Demo-Schleife etwas anderes zeigt — nie null.
 *
 * Der Probemodus hat keine Ereignisse, die einen Push auslösen könnten: Es schreibt niemand, und
 * die Einblendungen der Schleife tragen bis auf STARTLIST/LAPS/RESULT auch kein `visibleUntil`.
 * Ohne diese Auskunft schliefe der Szenen-Kanal nach der ersten Einblendung ein und die Schleife
 * stünde still (`StreamSceneLogic.buildResolvedView` mischt den Wert deshalb im Probemodus unter
 * das `nextEvaluationAt` des Resolvers). Weil [LOOP_SECONDS] selbst in [LOOP_BOUNDARIES] steht,
 * gibt es für jede Stelle der Schleife einen nächsten Punkt - spätestens den Rundenanfang.
 */
fun nextTrialEvaluationAt(now: LocalDateTime): LocalDateTime {
    val secondsIntoLoop = secondsIntoLoop(now)
    val loopStart = now.minusSeconds(secondsIntoLoop)
    return loopStart.plusSeconds(LOOP_BOUNDARIES.first { it > secondsIntoLoop })
}

private fun mmss(totalSeconds: Long): String {
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return "%02d:%02d.0".format(minutes, seconds)
}

private fun trialMatch(
    state: MatchState,
    actualStartTime: LocalDateTime? = null,
    teams: List<AthleteBoardTeam> = emptyList(),
): AthleteBoardMatch = AthleteBoardMatch(
    matchId = TRIAL_MATCH_ID,
    competitionName = TRIAL_COMPETITION_NAME,
    categoryName = null,
    roundName = null,
    matchName = null,
    startTime = null,
    actualStartTime = actualStartTime,
    state = state,
    startState = AthleteBoardStartState.UNSCHEDULED,
    teams = teams,
)

/** Baut die vier Demo-Boote, mit den bis [raceElapsedSeconds] bereits gefallenen Zwischenzeiten. */
private fun trialTeams(raceStart: LocalDateTime, raceElapsedSeconds: Long): List<AthleteBoardTeam> =
    TRIAL_LANES.map { lane ->
        val laps = SPLIT_OFFSETS
            .filter { (offset, _) -> raceElapsedSeconds >= offset }
            .map { (offset, name) ->
                MatchTeamLapDto(name = name, timeString = mmss(offset), recordedAt = raceStart.plusSeconds(offset))
            }
        AthleteBoardTeam(
            startNumber = lane.startNumber,
            teamNumber = null,
            clubsShort = lane.clubShort,
            clubsFull = lane.clubShort,
            teamName = null,
            participants = lane.crew.map { AthleteBoardParticipant(name = it, role = null) },
            laps = laps,
        )
    }

/** Einläufe, die bis [raceElapsedSeconds] bereits im Ziel sind, in Zieleinlauf-Reihenfolge (Rang 1 zuerst). */
private fun trialFinishEntries(raceElapsedSeconds: Long): List<StreamFinishEntry> =
    FINISH_OFFSETS.withIndex()
        .filter { (_, offset) -> raceElapsedSeconds >= offset }
        .sortedBy { (_, offset) -> offset }
        .mapIndexed { rankIndex, (laneIndex, offset) ->
            val lane = TRIAL_LANES[laneIndex]
            StreamFinishEntry(
                rank = rankIndex + 1,
                startNumber = lane.startNumber,
                clubsShort = lane.clubShort,
                clubsFull = lane.clubShort,
                timeString = mmss(offset),
                participants = lane.crew,
            )
        }

/** Das fertige Ergebnis des Demo-Laufs, in derselben Zieleinlauf-Reihenfolge wie [FINISH_OFFSETS]. */
private fun trialResult(): AthleteBoardResult {
    val teams = FINISH_OFFSETS.withIndex()
        .sortedBy { (_, offset) -> offset }
        .mapIndexed { rankIndex, (laneIndex, offset) ->
            val lane = TRIAL_LANES[laneIndex]
            AthleteBoardResultTeam(
                place = rankIndex + 1,
                ratingCategory = null,
                categoryPlace = rankIndex + 1,
                startNumber = lane.startNumber,
                teamNumber = null,
                clubsShort = lane.clubShort,
                clubsFull = lane.clubShort,
                teamName = null,
                participants = lane.crew.map { AthleteBoardParticipant(name = it, role = null) },
                timeString = mmss(offset),
                penaltySeconds = null,
                penaltyNote = null,
                failed = false,
                failedReason = null,
                deregistered = false,
                deregisteredReason = null,
            )
        }
    return AthleteBoardResult(
        matchId = TRIAL_MATCH_ID,
        competitionName = TRIAL_COMPETITION_NAME,
        categoryName = null,
        roundName = null,
        matchName = null,
        startTime = null,
        actualStartTime = null,
        clarification = false,
        teams = teams,
    )
}

private fun emptyInput(
    now: LocalDateTime,
    graphics: List<StreamSceneGraphicDto>,
    overrides: List<StreamOverrideRow>,
): StreamResolverInput = StreamResolverInput(
    now = now,
    graphics = graphics,
    overrides = overrides,
    preparing = null,
    preparingSince = null,
    running = null,
    sequenceStartedAt = null,
    sequenceFiresAt = null,
    latestResult = null,
    latestResultAt = null,
    latestResultProvisional = false,
    finishEntries = emptyList(),
    overriddenMatches = emptyMap(),
    overriddenResults = emptyMap(),
    schedule = emptyList(),
    courseImageUrl = null,
)

/**
 * Bildet `now` auf die 3-Minuten-Demo-Schleife ab und liefert die passende [StreamResolverInput]
 * für [resolveScene]. Siehe Klassendoku oben für die Phasengrenzen.
 *
 * [overrides] sind die ECHTEN Regie-Zeilen der Szene (`StreamOverrideRepo`, per
 * [StreamSceneLogic.buildInput] geladen) — Standard leer, damit die bestehenden Tests dieser
 * Datei ungerührt bleiben. Nur so kann eine Regie Auto/An/Aus gegen die Demo-Schleife
 * durchspielen: der Rest von [trialInput] bleibt die erfundene Szene, einzig `overrides` reist
 * unverändert in die zurückgegebene Eingabe durch, der reine [resolveScene] wertet sie dann
 * genauso aus wie im echten Betrieb (samt des Unaufgelöst-Rückfalls für einen FORCED_ON-Bezug
 * auf einen Lauf, den es in der Demo-Schleife nicht gibt).
 */
fun trialInput(
    now: LocalDateTime,
    graphics: List<StreamSceneGraphicDto>,
    overrides: List<StreamOverrideRow> = emptyList(),
): StreamResolverInput {
    val secondsIntoLoop = secondsIntoLoop(now)
    val loopStart = now.minusSeconds(secondsIntoLoop)
    val raceStart = loopStart.plusSeconds(SEQUENCE_END)
    val resultAt = loopStart.plusSeconds(RUNNING_END)

    val base = emptyInput(now, graphics, overrides)

    return when {
        secondsIntoLoop < PREPARING_END -> base.copy(
            preparing = trialMatch(state = MatchState.PREPARING, teams = trialTeams(raceStart, 0)),
            preparingSince = loopStart,
        )

        secondsIntoLoop < SEQUENCE_END -> base.copy(
            preparing = trialMatch(state = MatchState.PREPARING, teams = trialTeams(raceStart, 0)),
            preparingSince = loopStart,
            sequenceStartedAt = loopStart.plusSeconds(PREPARING_END),
            // Die Demo-Schleife feuert den Start immer bei Sekunde 60 (= raceStart) - derselbe
            // Zeitpunkt, an dem die Rennphase unten beginnt und `actualStartTime` stempelt.
            sequenceFiresAt = raceStart,
        )

        secondsIntoLoop < RUNNING_END -> {
            val raceElapsedSeconds = secondsIntoLoop - SEQUENCE_END
            base.copy(
                running = trialMatch(
                    state = MatchState.RUNNING,
                    actualStartTime = raceStart,
                    teams = trialTeams(raceStart, raceElapsedSeconds),
                ),
                finishEntries = trialFinishEntries(raceElapsedSeconds),
            )
        }

        else -> base.copy(
            latestResult = trialResult(),
            latestResultAt = resultAt,
            latestResultProvisional = secondsIntoLoop < PROVISIONAL_RESULT_END,
        )
    }
}
