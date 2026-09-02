package de.lambda9.ready2race.backend.app.liveDashboard.boundary

import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardSequenceDto
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardSequenceEntryDto
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardSequenceState
import de.lambda9.ready2race.backend.app.timing.control.plannedStartMillis
import de.lambda9.ready2race.backend.app.timing.entity.ActiveSequenceEntry
import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import java.util.UUID

/**
 * Ordnet die aktiven Startsequenzen einer Veranstaltung den Läufen des Schiedsrichter-Dashboards
 * zu - reine Funktion über den Zeilen aus `TimingSequenceEntryRepo.getActiveEntriesByEvent`,
 * damit die Regeln ohne Datenbank prüfbar sind.
 */
object LiveDashboardSequenceLogic {

    /** Was ein Lauf von seiner Sequenz zeigt: den Kopf und je Boot (`competition_match_team.id`) den Eintrag. */
    data class MatchSequence(
        val sequence: LiveDashboardSequenceDto,
        val entriesByMatchTeam: Map<UUID, LiveDashboardSequenceEntryDto>,
    )

    /**
     * Je Setup-Lauf die Sequenz, die die Karte zeigt.
     *
     * Ein Lauf steckt normalerweise in höchstens einer aktiven Sequenz. Stehen seine Boote doch in
     * mehreren (zwei Startposten, jeder mit eigener Sequenz über dasselbe Feld), gewinnt die
     * zuletzt angefasste - dieselbe Regel wie beim Startbildschirm ohne Postenbindung
     * (`TimingSequenceRepo.getMostRecentActiveByEvent`): eine frisch scharfgestellte oder gestartete
     * Sequenz ist das, worauf gerade gewartet wird. Boote, die nur in der anderen Sequenz stehen,
     * bekommen dann keinen Eintrag - lieber eine Lücke als zwei Wahrheiten auf einer Karte.
     *
     * Zeilen mit einem Zustand außerhalb der drei aktiven werden übergangen statt abzubrechen: das
     * Repo filtert sie schon weg, und ein unerwarteter Wert soll den ganzen Poll nicht reißen.
     */
    fun byMatch(rows: List<ActiveSequenceEntry>): Map<UUID, MatchSequence> =
        rows.groupBy { it.setupMatchId }.mapNotNull { (matchId, matchRows) ->
            val chosen = matchRows
                .groupBy { it.sequence.id }
                .values
                .maxByOrNull { group -> group.first().sequence.updatedAt!! }
                ?: return@mapNotNull null
            val record = chosen.first().sequence
            val state = dashboardState(record.state) ?: return@mapNotNull null
            matchId to MatchSequence(
                sequence = LiveDashboardSequenceDto(
                    sequenceId = record.id,
                    state = state,
                    mode = SequenceMode.valueOf(record.mode),
                    // Per Vertrag nur während der laufenden Pause belegt (resumeSequence leert es);
                    // trotzdem an den Zustand gebunden, damit ein Altwert nie als Pause erscheint.
                    pausedAtMillis = record.pausedAtMillis.takeIf { state == LiveDashboardSequenceState.PAUSED },
                ),
                entriesByMatchTeam = chosen.associate { row ->
                    row.entry.competitionMatchTeam to LiveDashboardSequenceEntryDto(
                        position = row.entry.position,
                        status = SequenceEntryStatus.valueOf(row.entry.status!!),
                        plannedStartMillis = plannedStartMillis(record, row.entry.position),
                    )
                },
            )
        }.toMap()

    private fun dashboardState(raw: String?): LiveDashboardSequenceState? =
        when (raw?.let { runCatching { SequenceState.valueOf(it) }.getOrNull() }) {
            SequenceState.ARMED -> LiveDashboardSequenceState.ARMED
            SequenceState.RUNNING -> LiveDashboardSequenceState.RUNNING
            SequenceState.PAUSED -> LiveDashboardSequenceState.PAUSED
            SequenceState.DONE, SequenceState.ABORTED, null -> null
        }
}
