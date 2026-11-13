package de.lambda9.ready2race.backend.app.eventInfo.entity

import de.lambda9.ready2race.backend.app.matchStatus.entity.MatchState
import de.lambda9.ready2race.backend.app.paceReference.entity.PaceReferenceDto
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID

data class RunningMatchInfo(
    val matchId: UUID,
    val matchNumber: Int?,
    val competitionId: UUID,
    val competitionName: String,
    /** Wettkampf-Kürzel (short_name) für kompakte Anzeigen; null, wenn keins gepflegt ist. */
    val competitionShortName: String? = null,
    val categoryName: String?,
    val startTime: LocalDateTime?,
    /**
     * Wann der Lauf an den Start gerufen wurde (`competition_match.activated_at`). In diesem Block
     * nie null - die Abfrage holt genau die aktivierten Läufe.
     */
    val activatedAt: LocalDateTime?,
    /**
     * Tatsächlicher Start aus `competition_match.started_at`. Null heißt: der Lauf ist an den Start
     * gerufen, aber noch nicht unterwegs (Vorbereitung am Steg) - das Aktivieren stempelt nicht,
     * das tun nur `markMatchStarted` und die Zeitnahme.
     */
    val startedAt: LocalDateTime?,
    val elapsedMinutes: Long?,
    /**
     * Gegen diesen Lauf läuft ein Einspruch (`competition_match.clarification_since` gesetzt).
     * Nur belegt, wenn die Abfrage strittige Läufe ausdrücklich mitbestellt hat
     * (`includeClarification`, Sprecher-Board) - der öffentliche Standardweg liefert solche
     * Läufe gar nicht erst. Bewusst nur das Flag: die Begründung der Schiedsrichter
     * (`clarification_reason`) ist eine interne Notiz und verlässt das Dashboard nicht.
     */
    val clarification: Boolean? = null,
    /**
     * Der Laufzustand aus der einen Ableitung (`LiveDashboardLogic.deriveMatchState`): in diesem
     * Block PREPARING (aktiviert, ohne Ist-Start), RUNNING oder - nur mit `includeClarification` -
     * CLARIFICATION. Bis zum 13.11.2026 las das Sprecher-Board jeden Lauf dieses Blocks als
     * „● Live", auch den nur an den Start gerufenen.
     */
    val state: MatchState,
    val placeName: String?,
    val roundNumber: Int?,
    val roundName: String?,
    val matchName: String?,
    val executionOrder: Int,
    val teams: List<RunningMatchTeamInfo>,
    /**
     * Die Bezugsgröße des Wettkampfs („Zeit pro 500 m", „km/h"), null ohne gepflegte. Sie reist
     * am Lauf mit, weil die Anzeige das Tempo je Abschnitt selbst rechnet - ohne sie weiß sie
     * nicht, in welcher Einheit.
     */
    val paceReference: PaceReferenceDto? = null,
)