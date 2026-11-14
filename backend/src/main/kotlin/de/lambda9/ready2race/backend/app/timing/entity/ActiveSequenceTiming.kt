package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Die Startsequenz, die eine Anzeige ohne Postenbindung gerade zeigen soll - die zuletzt
 * angefasste aktive Sequenz der Veranstaltung ([TimingSequenceRepo.getMostRecentActiveByEvent]-
 * Regel), auf das reduziert, was eine Uhr braucht. Geliefert von
 * `TimingSequenceService.activeTiming`; gemeinsame Quelle für die Stream-Uhr (StreamSceneLogic)
 * und die Boards (BoardService) - zwei Ableitungen derselben Frage liefen unweigerlich auseinander.
 *
 * [startedAt] ist der Anker der Kette (Sequenzstart plus verbuchte Pausendauer), [firesAt] der
 * geplante Zeitpunkt des ERSTEN NOCH ANSTEHENDEN Starts - dieselbe Rechnung, gegen die der
 * Scheduler feuert (`plannedStartMillis` der kleinsten PENDING-Position). Eine nur
 * scharfgestellte Sequenz hat weder Anker noch Feuerzeitpunkt. [pausedAt] ist nur während der
 * laufenden Pause belegt.
 *
 * [currentMatchId] gehört zu demselben nächsten anstehenden Eintrag wie [firesAt]. Gibt es keinen
 * anstehenden Eintrag mehr, zeigt sie deterministisch auf den zuletzt gestarteten beziehungsweise
 * ersten Sequenzeintrag. [matchIds] sind die Setup-Läufe aller Boote der Sequenz: daran erkennt
 * eine Kachel, ob IHR Lauf gerade in dieser Sequenz steckt.
 */
data class ActiveSequenceTiming(
    val sequenceId: UUID,
    val state: SequenceState,
    val startedAt: LocalDateTime?,
    val firesAt: LocalDateTime?,
    val pausedAt: LocalDateTime?,
    val currentMatchId: UUID?,
    val matchIds: List<UUID>,
)
