package de.lambda9.ready2race.backend.app.liveDashboard.entity

import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import java.util.UUID

/**
 * Die aktive Startsequenz eines Laufs, wie das Schiedsrichter-Dashboard sie sieht - ein
 * Auszug aus dem Zeitnahme-Modul, aufgelöst vom Server und über den gewöhnlichen Dashboard-Poll
 * ausgeliefert.
 *
 * Warum ein eigener Auszug und nicht der Zeitnahme-Kanal: Der Websocket der Zeitnahme verlangt
 * Zeitnahme- oder Veranstaltungsrechte, die eine Schiedsrichter-Rolle nicht zwingend hat, und das
 * Dashboard hängt ohnehin am Veranstaltungs-Push, der bei JEDER Sequenz-Mutation feuert
 * (`EventChangeMarker.bump` in TimingSequenceService). Der Auszug reist also auf demselben Weg wie
 * alles andere auf der Karte - gecacht, mit ETag, auch im Lese-Cache der Helfer-App.
 *
 * Nur die drei aktiven Zustände kommen vor: eine erledigte oder abgebrochene Sequenz sagt über
 * den Lauf nichts mehr, was sein Zustand ([LiveDashboardMatchState]) und die Ergebniszeilen nicht
 * besser wüssten. Ein Lauf ohne aktive Sequenz trägt hier `null`.
 */
enum class LiveDashboardSequenceState { ARMED, RUNNING, PAUSED }

data class LiveDashboardSequenceDto(
    val sequenceId: UUID,
    val state: LiveDashboardSequenceState,
    /** MASS: ein Signal für alle Boote; INTERVAL: ein Boot je Takt (Zeitfahren). */
    val mode: SequenceMode,
    /**
     * Beginn der LAUFENDEN Pause als Server-Epoch-Millis, nur bei [LiveDashboardSequenceState.PAUSED]
     * gesetzt. Die Karte friert den Countdown auf `plannedStartMillis − pausedAtMillis` ein - eine
     * reine Serverzeit-Differenz - statt sichtbar auf 0:00 zuzulaufen, während niemand startet.
     * Das Fortsetzen verschiebt die geplanten Starts exakt um die Pausendauer (siehe
     * `pause_shift_millis`), der eingefrorene Reststand läuft also nahtlos weiter.
     */
    val pausedAtMillis: Long?,
)

/**
 * Der Platz eines Boots in der aktiven Sequenz seines Laufs - `null` an Booten, die in keiner
 * aktiven Sequenz stehen (oder in einer anderen als der, die der Lauf gerade zeigt, siehe
 * [de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardSequenceLogic]).
 */
data class LiveDashboardSequenceEntryDto(
    /** Position in der Sequenz (0-basiert, über alle Läufe der Sequenz hinweg) - die Startreihenfolge. */
    val position: Int,
    val status: SequenceEntryStatus,
    /**
     * Geplanter Startzeitpunkt dieses Boots als Server-Epoch-Millis; leer, solange die Sequenz nur
     * scharfgestellt ist. Dieselbe Rechnung, gegen die der Scheduler feuert - die Karte zählt
     * gegen die Serveruhr darauf herunter.
     */
    val plannedStartMillis: Long?,
)
