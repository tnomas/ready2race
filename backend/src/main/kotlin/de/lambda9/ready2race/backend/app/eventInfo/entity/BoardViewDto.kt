package de.lambda9.ready2race.backend.app.eventInfo.entity

import de.lambda9.ready2race.backend.app.awardCeremony.entity.AwardCeremonyRank
import de.lambda9.ready2race.backend.app.event.entity.EventNoticeDto
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import java.time.LocalDateTime
import java.util.UUID

/**
 * Ein Platz auf der Tages-Timeline. Höchstens eines von [match] und [result] ist gefüllt;
 * beide leer heißt: an dieser Position ist (noch) nichts — die Kachel zeigt ihren
 * Leerzustand, statt zu verschwinden.
 */
data class BoardMatchSlotDto(
    val offset: Int,
    val match: AthleteBoardMatch?,
    val result: AthleteBoardResult?,
)

/** Daten eines Listen-Elements; je [mode] ist genau eine der Listen gefüllt. */
data class BoardListDto(
    val mode: BoardListMode,
    val matches: List<AthleteBoardMatch>,
    val results: List<AthleteBoardResult>,
    /** Nur im Modus SCHEDULE gefüllt: das komplette Tagesprogramm aus dem Zeitplan. */
    val program: List<BoardProgramEntry> = emptyList(),
)

/**
 * Zustand einer Programmzeile - eine Abbildung von
 * [de.lambda9.ready2race.backend.app.matchStatus.entity.MatchState] (siehe
 * `BoardLogic.programState`). Abgesagte Slots stehen gar nicht im Programm; SKIPPED und
 * UNSCHEDULED gibt es deshalb hier nicht.
 */
enum class BoardProgramState { FINISHED, RUNNING, PREPARING, CLARIFICATION, AWAITING_FINISH, UPCOMING }

/**
 * Eine Zeile des Tagesprogramms: ein Zeitplan-Slot mit seinem Zustand. [name] trägt
 * Programmpunkte (Pausen); für echte Läufe stehen Wettkampf/Runde/Lauf. Pausen kommen
 * nur mit, wenn die Veranstaltung sie auf öffentlichen Anzeigen zeigt.
 */
data class BoardProgramEntry(
    val startTime: LocalDateTime?,
    val name: String? = null,
    val competitionName: String? = null,
    val competitionShortName: String? = null,
    val roundName: String? = null,
    val matchName: String? = null,
    val state: BoardProgramState,
)

/**
 * Das Podium einer Ehrung — dieselben Ränge, die der Siegerehrungsbogen druckt.
 * [ranks] leer heißt: für diese Ehrung gibt es (noch) keine geehrten Boote.
 */
data class BoardCeremonyDto(
    val competitionId: UUID,
    val ratingCategoryId: UUID?,
    val competitionIdentifier: String,
    val competitionShortName: String?,
    val competitionName: String,
    val ratingCategoryName: String?,
    val ranks: List<AwardCeremonyRank>,
)

/**
 * Die Startsequenz der hauseigenen Zeitnahme, die die Boards gerade zeigen - die zuletzt
 * angefasste aktive Sequenz der Veranstaltung (`TimingSequenceService.activeTiming`, dieselbe
 * Wahl wie die Stream-Uhr und der Startbildschirm ohne Posten).
 *
 * Warum sie hier reist: Die Boards lesen den öffentlichen, gecachten Poll-Endpunkt bzw. den
 * Board-Kanal; die Sequenz lebt im Zeitnahme-Modul hinter Sitzung und Geräte-Token. Damit die
 * Laufuhr einer Kachel schon VOR dem Start von minus hochzählen kann, muss der geplante
 * Startzeitpunkt hier durchgereicht werden - der Zeitnahme-Kanal steht einem Board nicht offen.
 * Preisgegeben werden nur Zeitpunkte und Lauf-Ids, keine Boote.
 *
 * [firesAt] ist der geplante ERSTE NOCH ANSTEHENDE Start (leer, solange die Sequenz nur scharf
 * ist), [pausedAt] nur während der laufenden Pause belegt; die Uhr friert dann auf
 * `firesAt − pausedAt` ein. [matchIds]: die Setup-Läufe aller Boote der Sequenz - daran erkennt
 * eine Kachel, ob IHR Lauf gemeint ist.
 */
data class BoardSequenceDto(
    val sequenceId: UUID,
    val state: SequenceState,
    val startedAt: LocalDateTime?,
    val firesAt: LocalDateTime?,
    val pausedAt: LocalDateTime?,
    val matchIds: List<UUID>,
)

/** Alles, was die Anzeige eines Boards braucht, in einer Antwort. */
data class BoardViewDto(
    val boardId: UUID,
    val eventName: String,
    val serverTime: LocalDateTime,
    val refreshIntervalSeconds: Int,
    val config: BoardConfig,
    val slots: List<BoardMatchSlotDto>,
    val lists: List<BoardListDto>,
    /** Je konfiguriertem Siegerehrungs-Element eine Ehrung; fehlende bleiben einfach aus. */
    val ceremonies: List<BoardCeremonyDto> = emptyList(),
    /** Der veranstaltungsweite Hinweisbanner (z.B. Wetterwarnung); null = kein Banner. */
    val notice: EventNoticeDto? = null,
    /**
     * Aktuelle Verspätung in Sekunden: `started_at − start_time` des zuletzt gestarteten Laufs
     * (BoardLogic.currentDelaySeconds). Negativ = Verfrühung. Null, wenn noch nichts gestartet
     * ist — oder das Board kein DELAY-Element hat (needs-Muster, siehe BoardDataNeeds.delay).
     */
    val currentDelaySeconds: Long? = null,
    /**
     * Die aktive Startsequenz, die die Kacheln zeigen - null ohne eine solche. Nicht ans
     * needs-Muster gebunden: die Frage kostet eine kleine Abfrage je Bau, und der Bau läuft nur
     * je Änderungsmarker, nicht je Poll (siehe boardViewCache).
     */
    val sequence: BoardSequenceDto? = null,
)
