package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardResult
import de.lambda9.ready2race.backend.app.stream.entity.StreamFinishEntry
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicSettings
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicViewDto
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideState
import de.lambda9.ready2race.backend.app.stream.entity.StreamPlacement
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicDto
import java.time.LocalDateTime
import java.util.UUID

/**
 * Eine Regie-Zeile aus `stream_override`. Anders als [StreamOverrideState] am DTO (das auch AUTO
 * kennt) trägt diese Zeile nur, was tatsächlich in der Tabelle steht — AUTO existiert hier nicht,
 * "kein Override" heißt "keine Zeile" (siehe Kommentar an [StreamOverrideState]).
 */
data class StreamOverrideRow(
    val graphicType: StreamGraphicType,
    val state: StreamOverrideState,
    /** Inhaltswahl der Regie; null = jüngster/aktueller Inhalt. */
    val match: UUID?,
    /** Auto-Rückfall auf AUTO; null = kein automatischer Rückfall. */
    val expiresAt: LocalDateTime?,
    /** Erzeugungszeitpunkt — entscheidet bei zwei FORCED_ON auf demselben Platz (Regel 2). */
    val createdAt: LocalDateTime,
)

/** Eingabe des reinen Szenen-Resolvers — alles, was zur Auflösung einer Szene nötig ist, als Schnappschuss. */
data class StreamResolverInput(
    val now: LocalDateTime,
    /** Nur enabled-Zeilen der Szene. */
    val graphics: List<StreamSceneGraphicDto>,
    val overrides: List<StreamOverrideRow>,
    /** Lauf „In Vorbereitung", inkl. Zeitpunkt des Zustandswechsels ([preparingSince]). */
    val preparing: AthleteBoardMatch?,
    val preparingSince: LocalDateTime?,
    /** Laufender Lauf. */
    val running: AthleteBoardMatch?,
    /** Lauf der gestarteten Startsequenz; schlägt für die Countdown-Uhr einen älteren laufenden Lauf. */
    val sequenceMatch: AthleteBoardMatch?,
    /** Laufende Startsequenz, sonst null. */
    val sequenceStartedAt: LocalDateTime?,
    /** Zeitpunkt, an dem der Start dieser Sequenz fällt (Anker + Vorlauf), sonst null. */
    val sequenceFiresAt: LocalDateTime?,
    /** Beginn der LAUFENDEN Pause der Sequenz - nur gesetzt, solange sie angehalten ist. */
    val sequencePausedAt: LocalDateTime?,
    val latestResult: AthleteBoardResult?,
    /** Zeitpunkt der Wertung (für den RESULT-Auto-Out). */
    val latestResultAt: LocalDateTime?,
    /** Laufzustand Klärung. */
    val latestResultProvisional: Boolean,
    /** Einläufe des aktuellen Laufs, nach Rang. */
    val finishEntries: List<StreamFinishEntry>,
    /** Inhalt für Overrides mit match-Bezug. */
    val overriddenMatches: Map<UUID, AthleteBoardMatch>,
    val overriddenResults: Map<UUID, AthleteBoardResult>,
    /** Kommende Läufe (SCHEDULE). */
    val schedule: List<AthleteBoardMatch>,
    val courseImageUrl: String?,
)

/** Aufgelöster Szenenstand, wie er an die Bühne geht. */
data class ResolvedScene(val graphics: List<StreamGraphicViewDto>, val nextEvaluationAt: LocalDateTime?)

/** Automatik-Ergebnis eines Grafiktyps, unabhängig von Regie und Platzkonflikt. */
private data class AutoResolution(
    val visible: Boolean,
    val visibleSince: LocalDateTime?,
    val visibleUntil: LocalDateTime?,
)

/**
 * Priorität am gemeinsamen Platz (Regel 4): RESULT > LAPS > STARTLIST > NEXT_UP, alle übrigen
 * Typen danach in Enum-Reihenfolge. `distinct()` entfernt die vier vorn genannten aus dem Rest.
 */
private val SLOT_PRIORITY: List<StreamGraphicType> = (
    listOf(StreamGraphicType.RESULT, StreamGraphicType.LAPS, StreamGraphicType.STARTLIST, StreamGraphicType.NEXT_UP) +
        StreamGraphicType.entries
    ).distinct()

/**
 * Reiner Kern der Livestream-Overlay-Auflösung: keine KIO, keine DB, keine Uhr — `now` kommt als
 * Parameter. Wird von Push-Kanal und GET-Einstieg mit demselben Schnappschuss aufgerufen und muss
 * für dieselbe Eingabe immer dasselbe liefern.
 *
 * Ablauf: (1) je Typ AUTO-Sichtbarkeit unabhängig vom Platz berechnen, (2) Regie (FORCED_ON/OFF,
 * abgelaufene Overrides fallen auf AUTO zurück) darüberlegen, (3) je Platz genau einen Gewinner
 * bestimmen, (4) Umschaltpunkte für [ResolvedScene.nextEvaluationAt] einsammeln.
 */
fun resolveScene(input: StreamResolverInput): ResolvedScene {
    val now = input.now

    // Bei mehreren Zeilen je Typ (sollte an der DB nicht vorkommen) gewinnt die jüngste - siehe
    // dieselbe Erzeugungsreihenfolge, die auch zwei FORCED_ON auf einem Platz entscheidet.
    val overridesByType: Map<StreamGraphicType, StreamOverrideRow> =
        input.overrides.groupBy { it.graphicType }.mapValues { (_, rows) -> rows.maxBy { it.createdAt } }

    fun effectiveOverrideState(type: StreamGraphicType): StreamOverrideState {
        val override = overridesByType[type] ?: return StreamOverrideState.AUTO
        // Regel 1: abgelaufene Overrides gelten als AUTO.
        if (override.expiresAt != null && !override.expiresAt.isAfter(now)) return StreamOverrideState.AUTO
        return override.state
    }

    fun settingsFor(type: StreamGraphicType): StreamGraphicSettings =
        input.graphics.firstOrNull { it.type == type }?.settings ?: StreamGraphicSettings()

    // Der Lauf-Bezug einer FORCED_ON-Zeile, oder null (kein Bezug -> "aktueller Inhalt").
    fun overrideMatchId(type: StreamGraphicType): UUID? =
        if (effectiveOverrideState(type) == StreamOverrideState.FORCED_ON) overridesByType[type]?.match else null

    /**
     * Hat die Regie für [type] einen KONKRETEN Lauf benannt, der sich nicht auf Inhalt auflösen
     * lässt (z. B. ein längst beendeter Lauf, von der Regie auf STARTLIST/NEXT_UP erzwungen -
     * [StreamSceneLogic.buildInput] befüllt `overriddenMatches` nur aus laufenden/anstehenden
     * Läufen, `overriddenResults` dagegen aus beendeten)? Dann ist das kein Fall für den
     * Automatik-Rückfall: die Bedienoberfläche hat ausdrücklich EINEN Lauf verlangt, nicht "was
     * gerade automatisch dran wäre" - zeigt die Bühne trotzdem den Automatik-Inhalt, sieht niemand,
     * dass die Regie ins Leere griff. Kein Lauf-Bezug (null) ist dagegen die normale FORCED_ON-Wahl
     * "aktueller Inhalt" und damit nicht unaufgelöst.
     */
    fun overrideContentUnresolved(type: StreamGraphicType): Boolean {
        val matchId = overrideMatchId(type) ?: return false
        return when (type) {
            StreamGraphicType.STARTLIST, StreamGraphicType.NEXT_UP,
            StreamGraphicType.CLOCK, StreamGraphicType.LAPS -> input.overriddenMatches[matchId] == null
            StreamGraphicType.RESULT -> input.overriddenResults[matchId] == null
            else -> false
        }
    }

    fun autoStartlist(): AutoResolution {
        val since = input.preparingSince
        if (input.preparing == null || since == null || input.sequenceStartedAt != null) {
            return AutoResolution(visible = false, visibleSince = null, visibleUntil = null)
        }
        val displaySeconds = settingsFor(StreamGraphicType.STARTLIST).displaySeconds ?: 15
        val until = since.plusSeconds(displaySeconds.toLong())
        return AutoResolution(visible = now.isBefore(until), visibleSince = since, visibleUntil = until)
    }

    fun autoClock(): AutoResolution {
        // Zwei Phasen teilen sich dieselbe Uhr: Countdown ab Sequenzstart, danach die laufende
        // Zeit - solange running gesetzt ist, bleibt die Uhr sichtbar, auch ohne Sequenzstart
        // (z. B. Zeitfahren ohne gemeinsame Startsequenz).
        val visible = input.sequenceStartedAt != null || input.running != null
        val since = input.sequenceStartedAt ?: input.running?.actualStartTime
        return AutoResolution(visible = visible, visibleSince = since, visibleUntil = null)
    }

    fun latestLapAt(): LocalDateTime? =
        input.running?.teams?.flatMap { it.laps }?.mapNotNull { it.recordedAt }?.maxOrNull()

    fun autoLaps(): AutoResolution {
        val since = latestLapAt() ?: return AutoResolution(visible = false, visibleSince = null, visibleUntil = null)
        val displaySeconds = settingsFor(StreamGraphicType.LAPS).displaySeconds ?: 8
        val until = since.plusSeconds(displaySeconds.toLong())
        return AutoResolution(visible = now.isBefore(until), visibleSince = since, visibleUntil = until)
    }

    fun autoResult(): AutoResolution {
        val since = input.latestResultAt ?: return AutoResolution(visible = false, visibleSince = null, visibleUntil = null)
        val displaySeconds = settingsFor(StreamGraphicType.RESULT).displaySeconds ?: 20
        val until = since.plusSeconds(displaySeconds.toLong())
        return AutoResolution(visible = now.isBefore(until), visibleSince = since, visibleUntil = until)
    }

    fun autoNextUp(): AutoResolution {
        // "Platz frei" ist keine Bedingung hier, sondern Ergebnis der Platzregel (Regel 4) - die
        // Startliste gewinnt denselben Platz per Priorität, solange sie selbst sichtbar ist.
        val visible = input.preparing != null && input.sequenceStartedAt == null
        return AutoResolution(visible = visible, visibleSince = input.preparingSince, visibleUntil = null)
    }

    // RESULT muss vor FINISH_TICKER feststehen: der Ticker weicht der (AUTO- oder Regie-)Sichtbarkeit des Ergebnisses.
    // Das gilt nur, wenn RESULT in dieser Szene überhaupt konfiguriert (enabled) ist - eine
    // Szene ohne RESULT-Grafik hat nichts, dem der Ticker weichen könnte, auch wenn irgendwo noch
    // eine RESULT-Override-Zeile oder ein frisches latestResultAt herumliegt.
    val resultConfigured = input.graphics.any { it.type == StreamGraphicType.RESULT }
    val resultAuto = autoResult()
    val resultOverrideState = effectiveOverrideState(StreamGraphicType.RESULT)
    // Ein FORCED_ON auf einen unauflösbaren Lauf zeigt (ab hier) kein Ergebnis mehr - dann muss
    // der Ticker auch nicht mehr weichen, sonst bliebe der Platz für nichts leer.
    val resultVisibleForTicker = resultConfigured && !overrideContentUnresolved(StreamGraphicType.RESULT) &&
        when (resultOverrideState) {
            StreamOverrideState.FORCED_OFF -> false
            StreamOverrideState.FORCED_ON -> true
            StreamOverrideState.AUTO -> resultAuto.visible
        }

    fun autoFinishTicker(): AutoResolution {
        val visible = input.finishEntries.isNotEmpty() && !resultVisibleForTicker
        // Kein Zeitanker bekannt (Einläufe tragen keinen Zeitstempel) - der Ticker ist
        // zustandsgetrieben (Regel 3), kein Timer, daher bleibt visibleUntil immer null.
        return AutoResolution(visible = visible, visibleSince = null, visibleUntil = null)
    }

    fun autoFor(type: StreamGraphicType): AutoResolution = when (type) {
        StreamGraphicType.STARTLIST -> autoStartlist()
        StreamGraphicType.CLOCK -> autoClock()
        StreamGraphicType.LAPS -> autoLaps()
        StreamGraphicType.RESULT -> resultAuto
        StreamGraphicType.FINISH_TICKER -> autoFinishTicker()
        StreamGraphicType.NEXT_UP -> autoNextUp()
        StreamGraphicType.SCHEDULE -> AutoResolution(visible = true, visibleSince = null, visibleUntil = null)
        StreamGraphicType.COURSE_IMAGE -> AutoResolution(visible = true, visibleSince = null, visibleUntil = null)
    }

    data class Candidate(
        val row: StreamSceneGraphicDto,
        val overrideState: StreamOverrideState,
        val auto: AutoResolution,
        val wantsVisible: Boolean,
        /** FORCED_ON mit einem Lauf-Bezug, der sich nicht auflöst (siehe [overrideContentUnresolved]). */
        val unresolved: Boolean,
    )

    val candidates = input.graphics.map { row ->
        val overrideState = effectiveOverrideState(row.type)
        val auto = autoFor(row.type)
        val unresolved = overrideContentUnresolved(row.type)
        val wantsVisible = when {
            // Kein stiller Rückfall auf Automatik-Inhalt: die Regie hat gezielt einen Lauf
            // verlangt, den es an dieser Grafik nicht gibt - dann bleibt die Grafik aus, statt
            // ungefragt etwas anderes zu zeigen.
            unresolved -> false
            overrideState == StreamOverrideState.FORCED_OFF -> false
            overrideState == StreamOverrideState.FORCED_ON -> true
            else -> auto.visible
        }
        Candidate(row, overrideState, auto, wantsVisible, unresolved)
    }

    // Regel 4: je Platz höchstens eine sichtbare Grafik. FORCED_ON schlägt die Platz-Priorität
    // (Regel 2) - stehen mehrere FORCED_ON auf demselben Platz, gewinnt die jüngere Regie-Zeile.
    val winnerByPlacement: Map<StreamPlacement, StreamGraphicType> = candidates
        .filter { it.wantsVisible }
        .groupBy { it.row.placement }
        .mapValues { (_, group) ->
            val forced = group.filter { it.overrideState == StreamOverrideState.FORCED_ON }
            if (forced.isNotEmpty()) {
                forced.maxBy { overridesByType.getValue(it.row.type).createdAt }.row.type
            } else {
                group.minBy { SLOT_PRIORITY.indexOf(it.row.type) }.row.type
            }
        }

    val graphics = candidates.map { candidate ->
        val row = candidate.row
        val visible = candidate.wantsVisible && winnerByPlacement[row.placement] == row.type
        val rawOverride = overridesByType[row.type]

        val visibleSince = if (!visible) null else when (candidate.overrideState) {
            StreamOverrideState.FORCED_ON -> rawOverride?.createdAt
            else -> candidate.auto.visibleSince
        }
        val visibleUntil = if (!visible) null else when (candidate.overrideState) {
            StreamOverrideState.FORCED_ON -> rawOverride?.expiresAt
            else -> candidate.auto.visibleUntil
        }

        // Inhaltswahl der Regie (nur bei FORCED_ON): match-Bezug schlägt Auto-Inhalt. Ist der
        // Bezug unauflösbar (candidate.unresolved), gibt es HIER keinen Rückfall auf den
        // Automatik-Inhalt mehr - die Grafik ist über `visible` (wantsVisible=false) schon
        // ausgeblendet, und sie soll auch keinen falschen Inhalt im DTO tragen.
        val overrideMatchId = if (candidate.overrideState == StreamOverrideState.FORCED_ON) rawOverride?.match else null
        val overriddenMatch = overrideMatchId?.let { input.overriddenMatches[it] }
        val overriddenResult = overrideMatchId?.let { input.overriddenResults[it] }

        val match = if (candidate.unresolved) null else when (row.type) {
            StreamGraphicType.STARTLIST, StreamGraphicType.NEXT_UP -> overriddenMatch ?: input.preparing
            StreamGraphicType.CLOCK -> overriddenMatch ?: if (input.sequenceStartedAt != null) {
                input.sequenceMatch
            } else {
                input.running ?: input.preparing
            }
            StreamGraphicType.LAPS -> overriddenMatch ?: input.running
            else -> null
        }
        val result = if (candidate.unresolved) null
        else if (row.type == StreamGraphicType.RESULT) overriddenResult ?: input.latestResult else null
        val provisional = if (candidate.unresolved) null
        else if (row.type == StreamGraphicType.RESULT) {
            // Ein ausgewähltes fremdes Ergebnis (match-Bezug) trägt seine Klärung selbst
            // (AthleteBoardResult.clarification) - latestResultProvisional gilt nur für den
            // jüngsten Auto-Inhalt, der keinen eigenen Klärungs-Zeitstempel im Input mitbringt.
            if (overriddenResult != null) overriddenResult.clarification else input.latestResultProvisional
        } else null
        val finishEntries = if (row.type == StreamGraphicType.FINISH_TICKER) input.finishEntries else null
        val schedule = if (row.type == StreamGraphicType.SCHEDULE) input.schedule else null
        val imageUrl = if (row.type == StreamGraphicType.COURSE_IMAGE) input.courseImageUrl else null
        val sequenceStartedAt = if (row.type == StreamGraphicType.CLOCK) input.sequenceStartedAt else null
        val sequenceFiresAt = if (row.type == StreamGraphicType.CLOCK) input.sequenceFiresAt else null
        val sequencePausedAt = if (row.type == StreamGraphicType.CLOCK) input.sequencePausedAt else null

        StreamGraphicViewDto(
            type = row.type,
            placement = row.placement,
            size = row.size,
            visible = visible,
            visibleSince = visibleSince,
            visibleUntil = visibleUntil,
            overrideState = candidate.overrideState,
            match = match,
            result = result,
            provisional = provisional,
            finishEntries = finishEntries,
            schedule = schedule,
            imageUrl = imageUrl,
            sequenceStartedAt = sequenceStartedAt,
            sequenceFiresAt = sequenceFiresAt,
            sequencePausedAt = sequencePausedAt,
            showMaterial = row.settings.showMaterial ?: false,
        )
    }

    // Regel 5: frühester künftiger Umschaltpunkt - jedes sichtbare visibleUntil UND jeder
    // Override-Ablauf (unabhängig davon, ob der Typ gerade gewinnt oder konfiguriert ist).
    val visibleUntilPoints = graphics.mapNotNull { it.visibleUntil }.filter { it.isAfter(now) }
    val overrideExpiryPoints = input.overrides.mapNotNull { it.expiresAt }.filter { it.isAfter(now) }
    val nextEvaluationAt = (visibleUntilPoints + overrideExpiryPoints).minOrNull()

    return ResolvedScene(graphics = graphics, nextEvaluationAt = nextEvaluationAt)
}
