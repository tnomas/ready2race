package de.lambda9.ready2race.backend.app.timingProfile.entity

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import java.util.UUID

/**
 * Der Zeitnahmeprofil-Baum einer Veranstaltung: die Wurzel, ihre Wettkämpfe, deren Runden und
 * Partien — jede Ebene mit ihrem EIGENEN Profil ([ownProfile], null heißt erben) und dem, was
 * dort tatsächlich gilt ([effectiveProfile]).
 *
 * Beide Werte kommen vom Server, damit die Auflösungsregel genau einmal existiert
 * (TimingProfileResolveLogic) und die Oberfläche eine reine Anzeige bleibt.
 */
data class TimingProfileTreeDto(
    val timingSystem: TimingSystem?,
    /** RACE bei RaceClocker, MODE bei interner Zeitnahme, sonst null — dann gibt es keine Profile. */
    val kind: TimingProfileKind?,
    val options: List<TimingProfileOptionDto>,
    /** Das Profil der Wurzel; null heißt "nicht gesetzt" (die Wurzel erbt von niemandem). */
    val ownProfile: UUID?,
    val competitions: List<TimingProfileCompetitionDto>,
)

/** Ein wählbares Profil: bei RACE ein Rennen, bei MODE ein Zeitnahmetyp. */
data class TimingProfileOptionDto(
    val id: UUID,
    val name: String,
    /** Zweite Zeile im Auswahlfeld: Ergebnis-Adresse des Rennens bzw. Startart/Intervall des Typs. */
    val detail: String?,
)

data class TimingProfileCompetitionDto(
    val competitionId: UUID,
    val identifier: String,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
    val rounds: List<TimingProfileRoundDto>,
)

data class TimingProfileRoundDto(
    val roundId: UUID,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
    val matches: List<TimingProfileMatchDto>,
)

data class TimingProfileMatchDto(
    val matchId: UUID,
    val name: String,
    val ownProfile: UUID?,
    val effectiveProfile: UUID?,
)
