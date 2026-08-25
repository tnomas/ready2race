package de.lambda9.ready2race.backend.app.competitionExecution.entity

import de.lambda9.ready2race.backend.app.ratingcategory.entity.RatingCategoryRef
import java.util.UUID

data class CompetitionMatchTeamWithRegistration(
    val id: UUID,
    val competitionMatch: UUID,
    val startNumber: Int,
    val place: Int?,
    val timeString: String?,
    val placesCalculated: Boolean,
    val competitionRegistration: UUID,
    val clubId: UUID,
    val clubName: String,
    val registrationName: String?,
    val teamNumber: Int?,
    val participants: List<CompetitionMatchTeamParticipant>,
    val deregistered: Boolean,
    val deregistrationReason: String?,
    val out: Boolean,
    val failed: Boolean,
    val failedReason: String?,
    val penaltySeconds: Int?,
    val penaltyNote: String?,
    /**
     * Die Wertungskategorie der Mannschaft. Trug bis zum 09.08.2026 nur den Namen; seit die
     * Platzierung je Kategorie gewertet wird, braucht sie zusätzlich die Id zum Gruppieren und
     * die Sortierstelle zum Anordnen der Abschnitte.
     */
    val ratingCategory: RatingCategoryRef?,
    val mixedTeamTerm: String?,
    /**
     * Zwischenzeiten dieses Bootes, in der Reihenfolge ihrer Position.
     *
     * ZWEI Quellen schreiben sie, getrennt über das Zeitnahme-System der Veranstaltung: die
     * hauseigene Zeitnahme aus den Marken ihrer Streckenposten (`TimingSplitService`, System
     * INTERN) und der RaceClocker-Abruf aus dem Feed (`applyLapsFromFeed`, System RACECLOCKER).
     * Beide füllen dieselbe Tabelle `competition_match_team_lap`; wer hier etwas ändert oder einen
     * neuen Korrekturweg baut, muss an beide denken. Der Name ist im ersten Fall der Name des
     * Postens, im zweiten der frei vergebene Spaltenname des Zeitnehmers; die Zeit ist in beiden
     * Fällen die Fahrzeit seit dem gemessenen Start.
     */
    val laps: List<MatchTeamLap> = emptyList(),
)

/**
 * Eine Zwischenzeit: Beschriftung und kumulierte Fahrzeit in Millisekunden. Die Beschriftung ist
 * der Name des Streckenpostens (hauseigene Zeitnahme) oder der Spaltenname aus RaceClocker — je
 * nachdem, welcher der beiden Schreiber die Zeile angelegt hat.
 */
data class MatchTeamLap(
    val name: String,
    val lapMillis: Long,
    /**
     * Die Stelle auf der Strecke, an der diese Zeit gefallen ist, in Metern. Die Zwischenzeit
     * trägt sie selbst, statt sie über den Postennamen nachzuschlagen — der Name ist frei
     * vergeben und änderbar. Null bei den Rundenzeiten aus dem Fremdsystem: Deren Spalten
     * gehören keinem Posten, dort gibt es kein Tempo.
     */
    val distanceMeters: Int? = null,
)