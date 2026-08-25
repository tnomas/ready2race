package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Ein Team, wie es die Posten-Startliste braucht: wer ist das Boot, und wo steht es auf dem Weg
 * vom Start ins Ziel. [started]/[finished] sind markenbasiert (zugeordnete ACTIVE-Marken auf
 * START- bzw. FINISH-Posten) - genau die Datenlage, aus der auch die offiziellen Zeiten rechnen.
 */
data class TimingMatchTeamDto(
    val competitionMatchTeam: UUID,
    /** Startnummer = Position im Lauf (starting_position_unique_in_match) - die "Bahn" des Boots. */
    val startNumber: Int,
    val teamName: String?,
    val clubName: String?,
    val started: Boolean,
    val finished: Boolean,
)

/**
 * Eine Partie der intern gezeiteten Wettkämpfe, in Startreihenfolge geliefert
 * (siehe `TimingStartOrderLogic`): die Datengrundlage, mit der der Startposten "einfach durchweg
 * alle Partien starten" kann und der Zielposten weiß, welches Rennen im Ziel erwartet wird und
 * welche Boote noch fehlen.
 */
data class TimingMatchDto(
    /** Schlüssel der Partie - `competition_match` trägt die Setup-Match-Id als Primärschlüssel. */
    val competitionSetupMatch: UUID,
    val matchName: String?,
    val competition: UUID,
    val competitionName: String?,
    /** Rennnummer - das, worüber die Regatta über Läufe spricht. */
    val competitionIdentifier: String?,
    /** Kürzel des Wettkampfs (short_name, z. B. "CM 4x+") - die Kurzform der Tagesablauf-Spalte. */
    val competitionShortName: String?,
    val round: UUID,
    val roundName: String?,
    /** Geplante Startzeit (aus dem Zeitplan); ohne sie sortiert die Setup-Reihenfolge. */
    val startTime: LocalDateTime?,
    /** Realer Start (Schiedsrichter-Aktion oder Zeitnahme). */
    val startedAt: LocalDateTime?,
    val finishedAt: LocalDateTime?,
    /** Aufruf-Zustand (activated_at) - dieselbe Ableitung wie /timing/teams. */
    val phase: TimingMatchPhase,
    /** Zeitnahme-Zustand: offen / Startsequenz läuft / gestartet / im Ziel. */
    val progress: TimingMatchProgress,
    /** Der aufgelöste Zeitnahmetyp (Runde schlägt Wettkampf); null = nicht konfiguriert. */
    val timingMode: TimingModeDto?,
    val teams: List<TimingMatchTeamDto>,
)
