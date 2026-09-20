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
import de.lambda9.ready2race.backend.app.stream.entity.StreamTrialPhase
import java.time.LocalDateTime
import java.util.UUID

/**
 * Probemodus-Datenquelle (`StreamSceneDto.trialMode`): liefert [resolveScene] einen erfundenen
 * Lauf in genau der Phase, die die Regie gewählt hat ([StreamTrialPhase]) — kein Zeitablauf, keine
 * Schleife. Die Regie klickt sich durch die Phasen eines Laufs und sieht je Phase, was die
 * Automatik daraus macht; dieselbe Phase erneut zu setzen löst ihre Einblendfenster neu aus.
 *
 * [trialInput] ist rein: kein Uhrzugriff, kein Zufall — `now`, Phase und Phasenbeginn
 * (`phaseSince`) kommen herein, dieselben Werte liefern dieselbe [StreamResolverInput]. Alle
 * Zeitanker (Sequenzstart, Rennstart, Marken, Ergebniszeitpunkt) sind relativ zu `phaseSince`, die
 * Einblendfenster des Resolvers (Startliste, Zwischenzeiten, Ergebnis) laufen also ab dem Klick.
 *
 * Phasen:
 * - [StreamTrialPhase.PREPARING]: Boote am Steg (STARTLIST-Fenster ab Phasenbeginn, NEXT_UP)
 * - [StreamTrialPhase.COUNTDOWN]: Startsequenz läuft, der Start fällt [COUNTDOWN_LEAD_IN_SECONDS]
 *   nach Phasenbeginn (CLOCK zählt herunter und klemmt danach bei 0:00)
 * - [StreamTrialPhase.RUNNING]: Rennen läuft seit [RUNNING_ELAPSED_SECONDS], erste Marke liegt
 *   zurück (CLOCK läuft, LAPS-Fenster längst zu)
 * - [StreamTrialPhase.SPLIT]: zweite Marke EBEN eingetroffen (LAPS-Fenster ab Phasenbeginn)
 * - [StreamTrialPhase.FINISH]: zwei von vier Booten im Ziel (FINISH_TICKER wächst, CLOCK läuft)
 * - [StreamTrialPhase.FINISHED]: alle im Ziel (FINISH_TICKER voll, CLOCK eingefroren)
 * - [StreamTrialPhase.RESULT]: Ergebnis gewertet, vorläufig (RESULT-Fenster ab Phasenbeginn)
 * - [StreamTrialPhase.IDLE]: nichts läuft — nur Tagesprogramm (und Streckenbild, sofern konfiguriert)
 *
 * Das Tagesprogramm ([trialSchedule]) trägt jede Phase, damit SCHEDULE in jeder Phase geprobt
 * werden kann; ein Streckenbild kennt der Probemodus nicht (kein erfundenes Dokument).
 */

const val COUNTDOWN_LEAD_IN_SECONDS = 90L
const val RUNNING_ELAPSED_SECONDS = 2 * 60 + 41L
private const val SPLIT_ELAPSED_SECONDS = 4 * 60 + 3L
private const val FINISH_ELAPSED_SECONDS = 6 * 60 + 12L
private const val FINISHED_ELAPSED_SECONDS = 6 * 60 + 40L

private val TRIAL_MATCH_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000701")
private const val TRIAL_COMPETITION_NAME = "Coastal Mixed Doppelzweier (Probemodus)"
private const val TRIAL_COMPETITION_SHORT = "CMix2x"
private const val TRIAL_ROUND = "Finale A"

private data class TrialLane(val startNumber: Int, val clubShort: String, val crew: List<String>)

/** 4 Bahnen mit erfundenen Vereins- und Besatzungsnamen — so zeigen Startliste, Ergebnis und
 *  Einlauf-Ticker im Probemodus dieselben Zeilen wie im echten Betrieb, Namen inklusive. */
private val TRIAL_LANES: List<TrialLane> = listOf(
    TrialLane(1, "RC Demo", listOf("Anna Beispiel", "Ben Beispiel")),
    TrialLane(2, "SC Probe", listOf("Clara Probe", "David Probe")),
    TrialLane(3, "RV Muster", listOf("Emma Muster", "Finn Muster")),
    TrialLane(4, "RG Fiktiv", listOf("Greta Fiktiv", "Henry Fiktiv")),
)

/** Zwischenzeiten-Marken des Demo-Laufs: Name, Streckenstelle, gefahrene Zeit je Bahn (Index). */
private data class TrialMark(val name: String, val meters: Int, val millisByLane: List<Long>)

private val TRIAL_MARKS: List<TrialMark> = listOf(
    TrialMark("Boje 1", 1500, listOf(121_300, 124_800, 119_600, 127_100)),
    TrialMark("Boje 2", 3000, listOf(243_900, 249_100, 241_200, 254_700)),
)

/** Zielzeiten in Zieleinlauf-Reihenfolge: Bahn (Index) und Millisekunden — Bahn 3 gewinnt. */
private val FINISH_ORDER: List<Pair<Int, Long>> = listOf(
    2 to 362_400,
    0 to 368_100,
    1 to 376_900,
    3 to 384_500,
)

private fun formatMillis(millis: Long): String {
    val minutes = millis / 60_000
    val seconds = (millis % 60_000) / 1000
    val tenths = (millis % 1000) / 100
    return "%d:%02d.%d".format(minutes, seconds, tenths)
}

private fun trialMatch(
    state: MatchState,
    actualStartTime: LocalDateTime? = null,
    teams: List<AthleteBoardTeam> = emptyList(),
    startTime: LocalDateTime? = null,
): AthleteBoardMatch = AthleteBoardMatch(
    matchId = TRIAL_MATCH_ID,
    competitionName = TRIAL_COMPETITION_NAME,
    competitionShortName = TRIAL_COMPETITION_SHORT,
    categoryName = null,
    roundName = TRIAL_ROUND,
    matchName = TRIAL_ROUND,
    startTime = startTime,
    actualStartTime = actualStartTime,
    state = state,
    startState = AthleteBoardStartState.SCHEDULED,
    teams = teams,
)

/**
 * Die vier Demo-Boote mit den Marken, die bis [raceElapsedSeconds] gefallen sind. Die Marke wird
 * zum Zeitpunkt ihrer schnellsten Durchfahrt gestempelt; [latestMarkAt] setzt die JÜNGSTE Marke
 * stattdessen auf genau diesen Zeitpunkt (Phase SPLIT: „eben eingetroffen").
 */
private fun trialTeams(
    raceStart: LocalDateTime,
    raceElapsedSeconds: Long,
    latestMarkAt: LocalDateTime? = null,
    finishedLanes: Map<Int, Pair<Int, Long>> = emptyMap(),
): List<AthleteBoardTeam> =
    TRIAL_LANES.mapIndexed { laneIndex, lane ->
        val fallenMarks = TRIAL_MARKS.filter { mark -> mark.millisByLane.min() / 1000 <= raceElapsedSeconds }
        val laps = fallenMarks.mapIndexed { markIndex, mark ->
            val millis = mark.millisByLane[laneIndex]
            val isLatest = markIndex == fallenMarks.lastIndex
            MatchTeamLapDto(
                name = mark.name,
                timeString = formatMillis(millis),
                recordedAt = if (isLatest && latestMarkAt != null) latestMarkAt else raceStart.plusNanos(millis * 1_000_000),
                lapMillis = millis,
                distanceMeters = mark.meters,
            )
        }
        val finished = finishedLanes[laneIndex]
        AthleteBoardTeam(
            startNumber = lane.startNumber,
            teamNumber = null,
            clubsShort = lane.clubShort,
            clubsFull = lane.clubShort,
            teamName = null,
            participants = lane.crew.map { AthleteBoardParticipant(name = it, role = null) },
            place = finished?.first,
            timeString = finished?.second?.let(::formatMillis),
            laps = laps,
        )
    }

/** Die ersten [count] Boote des Einlaufs: Bahn-Index → (Rang, Zielzeit). */
private fun finishedLanes(count: Int): Map<Int, Pair<Int, Long>> =
    FINISH_ORDER.take(count).mapIndexed { rankIndex, (laneIndex, millis) -> laneIndex to (rankIndex + 1 to millis) }.toMap()

private fun trialFinishEntries(count: Int): List<StreamFinishEntry> =
    FINISH_ORDER.take(count).mapIndexed { rankIndex, (laneIndex, millis) ->
        val lane = TRIAL_LANES[laneIndex]
        StreamFinishEntry(
            rank = rankIndex + 1,
            startNumber = lane.startNumber,
            clubsShort = lane.clubShort,
            clubsFull = lane.clubShort,
            timeString = formatMillis(millis),
            participants = lane.crew,
        )
    }

/** Das fertige Ergebnis des Demo-Laufs, in Zieleinlauf-Reihenfolge; Bahn 2 trägt eine Strafe. */
private fun trialResult(): AthleteBoardResult {
    val teams = FINISH_ORDER.mapIndexed { rankIndex, (laneIndex, millis) ->
        val lane = TRIAL_LANES[laneIndex]
        val penalised = laneIndex == 1
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
            timeString = formatMillis(millis),
            penaltySeconds = if (penalised) 10 else null,
            penaltyNote = if (penalised) "Boje berührt" else null,
            failed = false,
            failedReason = null,
            deregistered = false,
            deregisteredReason = null,
        )
    }
    return AthleteBoardResult(
        matchId = TRIAL_MATCH_ID,
        competitionName = TRIAL_COMPETITION_NAME,
        competitionShortName = TRIAL_COMPETITION_SHORT,
        categoryName = null,
        roundName = TRIAL_ROUND,
        matchName = TRIAL_ROUND,
        startTime = null,
        actualStartTime = null,
        clarification = true,
        teams = teams,
    )
}

private data class TrialProgramEntry(val minutesAhead: Long, val competition: String, val short: String, val round: String)

private val TRIAL_PROGRAM: List<TrialProgramEntry> = listOf(
    TrialProgramEntry(15, "Coastal Frauen Einer (Probemodus)", "CW1x", "Vorlauf 1"),
    TrialProgramEntry(35, "Coastal Frauen Einer (Probemodus)", "CW1x", "Vorlauf 2"),
    TrialProgramEntry(55, "Coastal Männer Doppelzweier (Probemodus)", "CM2x", "Vorlauf 1"),
    TrialProgramEntry(75, "Coastal Männer Doppelzweier (Probemodus)", "CM2x", "Vorlauf 2"),
    TrialProgramEntry(100, "Coastal Mixed Vierer (Probemodus)", "CMix4x+", "Finale B"),
    TrialProgramEntry(120, "Coastal Mixed Vierer (Probemodus)", "CMix4x+", "Finale A"),
)

/** Ein erfundenes Tagesprogramm, relativ zu `now`, damit SCHEDULE in jeder Phase etwas zeigt. */
private fun trialSchedule(now: LocalDateTime): List<AthleteBoardMatch> =
    TRIAL_PROGRAM.mapIndexed { index, entry ->
        AthleteBoardMatch(
            matchId = UUID.fromString("00000000-0000-0000-0000-0000000007%02d".format(10 + index)),
            competitionName = entry.competition,
            competitionShortName = entry.short,
            categoryName = null,
            roundName = entry.round,
            matchName = entry.round,
            startTime = now.plusMinutes(entry.minutesAhead).withSecond(0).withNano(0),
            actualStartTime = null,
            state = MatchState.UPCOMING,
            startState = AthleteBoardStartState.SCHEDULED,
            teams = emptyList(),
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
    sequenceMatch = null,
    sequenceStartedAt = null,
    sequenceFiresAt = null,
    sequencePausedAt = null,
    latestResult = null,
    latestResultAt = null,
    latestResultProvisional = false,
    finishEntries = emptyList(),
    overriddenMatches = emptyMap(),
    overriddenResults = emptyMap(),
    schedule = trialSchedule(now),
    courseImageUrl = null,
)

/**
 * Die [StreamResolverInput] des Demo-Laufs in [phase], mit allen Zeitankern relativ zu
 * [phaseSince] (dem Klick der Regie). Siehe Klassendoku oben für die Phasen.
 *
 * [overrides] sind die ECHTEN Regie-Zeilen der Szene (`StreamOverrideRepo`, per
 * [StreamSceneLogic.buildInput] geladen): Nur so kann eine Regie Auto/An/Aus gegen den
 * Demo-Lauf durchspielen — der reine [resolveScene] wertet sie genauso aus wie im echten
 * Betrieb (samt des Unaufgelöst-Rückfalls für einen FORCED_ON-Bezug auf einen Lauf, den es im
 * Demo-Lauf nicht gibt).
 */
fun trialInput(
    now: LocalDateTime,
    phase: StreamTrialPhase,
    phaseSince: LocalDateTime,
    graphics: List<StreamSceneGraphicDto>,
    overrides: List<StreamOverrideRow> = emptyList(),
): StreamResolverInput {
    val base = emptyInput(now, graphics, overrides)
    val preparingMatch = trialMatch(
        state = MatchState.PREPARING,
        teams = trialTeams(phaseSince, 0),
        startTime = phaseSince.plusMinutes(5).withSecond(0).withNano(0),
    )

    fun running(elapsedSeconds: Long, latestMarkAt: LocalDateTime? = null, finished: Int = 0): AthleteBoardMatch {
        val raceStart = phaseSince.minusSeconds(elapsedSeconds)
        return trialMatch(
            state = MatchState.RUNNING,
            actualStartTime = raceStart,
            teams = trialTeams(raceStart, elapsedSeconds, latestMarkAt, finishedLanes(finished)),
        )
    }

    return when (phase) {
        StreamTrialPhase.PREPARING -> base.copy(
            preparing = preparingMatch,
            preparingSince = phaseSince,
        )

        StreamTrialPhase.COUNTDOWN -> base.copy(
            preparing = preparingMatch,
            sequenceMatch = preparingMatch,
            // Die Startliste hatte ihr Fenster in der Vorbereitung — hier zählt die Uhr.
            preparingSince = phaseSince.minusMinutes(5),
            sequenceStartedAt = phaseSince,
            sequenceFiresAt = phaseSince.plusSeconds(COUNTDOWN_LEAD_IN_SECONDS),
        )

        StreamTrialPhase.RUNNING -> base.copy(
            running = running(RUNNING_ELAPSED_SECONDS),
        )

        StreamTrialPhase.SPLIT -> base.copy(
            running = running(SPLIT_ELAPSED_SECONDS, latestMarkAt = phaseSince),
        )

        StreamTrialPhase.FINISH -> base.copy(
            running = running(FINISH_ELAPSED_SECONDS, finished = 2),
            finishEntries = trialFinishEntries(2),
        )

        StreamTrialPhase.FINISHED -> base.copy(
            running = running(FINISHED_ELAPSED_SECONDS, finished = TRIAL_LANES.size),
            finishEntries = trialFinishEntries(TRIAL_LANES.size),
        )

        StreamTrialPhase.RESULT -> base.copy(
            latestResult = trialResult(),
            latestResultAt = phaseSince,
            latestResultProvisional = true,
        )

        StreamTrialPhase.IDLE -> base
    }
}
