package de.lambda9.ready2race.backend.app.stream.entity

import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardMatch
import de.lambda9.ready2race.backend.app.eventInfo.entity.AthleteBoardResult
import java.time.LocalDateTime
import java.util.UUID

/** Aufgelöster Szenenstand — Push-Nutzlast des Szenen-Kanals UND Antwort des GET-Einstiegs. */
data class StreamSceneViewDto(
    val sceneId: UUID,
    val background: StreamBackground,
    /** Nur bei [StreamBackground.CHROMA] belegt. */
    val chromaColor: String? = null,
    val safeAreaPercent: Int,
    val trialMode: Boolean,
    /** Gewählte Phase des Demo-Laufs — nur gesetzt, solange [trialMode] an ist. */
    val trialPhase: StreamTrialPhase? = null,
    /** Für die Uhr-Korrektur wie bei [de.lambda9.ready2race.backend.app.eventInfo.entity.BoardViewDto.serverTime]. */
    val serverTime: LocalDateTime,
    val graphics: List<StreamGraphicViewDto>,
)

/**
 * Aufgelöster Stand einer einzelnen Grafik. Je [type] ist höchstens eine der Inhalts-Payloads
 * ([match], [result], [finishEntries], [schedule], [imageUrl]) belegt.
 */
data class StreamGraphicViewDto(
    val type: StreamGraphicType,
    val placement: StreamPlacement,
    val size: StreamGraphicSize,
    /** Ob die Grafik gerade eingeblendet ist — das Regelwerk kann sie konfiguriert und trotzdem gerade aus haben. */
    val visible: Boolean,
    val visibleSince: LocalDateTime?,
    /** Timer fürs Ausblenden; null, solange kein Ablauf feststeht. */
    val visibleUntil: LocalDateTime?,
    val overrideState: StreamOverrideState,
    /** STARTLIST/CLOCK/LAPS/NEXT_UP. */
    val match: AthleteBoardMatch? = null,
    /** RESULT. */
    val result: AthleteBoardResult? = null,
    /** RESULT: Lauf steht auf Klärung — das Ergebnis geht trotzdem raus, nur als vorläufig gekennzeichnet. */
    val provisional: Boolean? = null,
    /** FINISH_TICKER. */
    val finishEntries: List<StreamFinishEntry>? = null,
    /** SCHEDULE. */
    val schedule: List<AthleteBoardMatch>? = null,
    /** COURSE_IMAGE. */
    val imageUrl: String? = null,
    /** CLOCK: Countdown ab Sequenzstart. */
    val sequenceStartedAt: LocalDateTime? = null,
    /**
     * CLOCK: der Zeitpunkt, an dem der Start tatsächlich fällt (Sequenzanker plus konfigurierten
     * Vorlauf) — null, solange keine Sequenz läuft. Dahin zählt der Countdown HERUNTER, anders
     * als [sequenceStartedAt], von dem aus er (falsch) HOCHzählte.
     */
    val sequenceFiresAt: LocalDateTime? = null,
    /**
     * CLOCK: Beginn der LAUFENDEN Pause der Sequenz — nur gesetzt, solange sie angehalten ist.
     * Die Bühne friert den Countdown auf dem Reststand dieses Zeitpunkts ein
     * (`sequenceFiresAt − sequencePausedAt`, reine Serverzeit-Differenz ohne Versatz-Korrektur);
     * das Fortsetzen verschiebt [sequenceFiresAt] um exakt die Pausendauer, der eingefrorene
     * Wert läuft also nahtlos weiter.
     */
    val sequencePausedAt: LocalDateTime? = null,
)

/** Ein Einlauf auf dem FINISH_TICKER-Band, in der Reihenfolge der Zieldurchfahrt. */
data class StreamFinishEntry(
    val rank: Int,
    val startNumber: Int,
    val clubsShort: String?,
    val clubsFull: String?,
    val timeString: String,
    /**
     * Besatzungsnamen in Bootsreihenfolge — leer, wenn keine Besatzung erfasst ist. Das Band
     * zeigt sie als Zweitzeile unter der Vereinskette; ohne sie stand im Einlauf nur der
     * Verein, während Startliste und Ergebnis längst Namen zeigen.
     */
    val participants: List<String> = emptyList(),
)

/**
 * Grober Zustand eines Laufs für den Lauf-Wähler des Kontroll-Panels — bewusst nur diese drei,
 * nicht die feine Zustandsmaschine des Schiedsrichter-Dashboards.
 */
enum class StreamPickerMatchState {
    UPCOMING,
    RUNNING,
    FINISHED,
}

/**
 * Ein Lauf des Veranstaltungstags für den Lauf-Wähler des Kontroll-Panels
 * ([de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneService.getPickerMatches]) —
 * zerlegte Namensteile statt einer fertigen Beschriftung, dieselbe Form wie das öffentliche
 * `LiveMatchInfo`, damit das Panel sich sein Label selbst baut.
 */
data class StreamPickerMatchDto(
    val matchId: UUID,
    val competitionName: String,
    val categoryName: String?,
    val roundName: String?,
    val matchName: String?,
    /** Geplanter Start; null für einen Lauf ohne eigene Startzeit. */
    val startTime: LocalDateTime?,
    val state: StreamPickerMatchState,
)
