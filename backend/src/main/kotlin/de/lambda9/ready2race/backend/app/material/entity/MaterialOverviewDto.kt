package de.lambda9.ready2race.backend.app.material.entity

import java.time.LocalDateTime
import java.util.UUID

/**
 * Alles, was das Anbieter-Dashboard für eine Veranstaltung in einem Aufruf braucht (Spec
 * Abschnitt 9): Angebote, Flotte mit Ausfallfenstern, Anfragen mit Zuteilungen und die Läufe, in
 * denen zuteilbar wird. [items] ist der ganze Bestand des Anbieters, nicht nur der dieser
 * Veranstaltung - Zuteilung kann jedes eigene Stück treffen.
 */
data class MaterialOverviewDto(
    val requestsClosed: Boolean,
    val offers: List<MaterialOfferDto>,
    val items: List<MaterialOverviewItemDto>,
    val requests: List<MaterialOverviewRequestDto>,
    val matches: List<MaterialOverviewMatchDto>,
)

data class MaterialOverviewItemDto(
    val id: UUID,
    val materialType: UUID,
    val materialTypeName: String,
    val category: MaterialCategory,
    val number: Int?,
    val label: String,
    val status: MaterialItemStatus,
    val outages: List<MaterialOutageDto>,
)

/** Ausfallfenster eines Schadens (`status = REPORTED`, `out_of_service_from` gesetzt). */
data class MaterialOutageDto(
    val damageId: UUID,
    val from: LocalDateTime,
    val until: LocalDateTime?,
)

/**
 * Eine Anfrage mit allem, was der Anbieter für Entscheidung und Zuteilung sehen darf (Spec
 * Abschnitt 6: kein Teilnehmername, keine Geburtsdaten - nur Team, Verein, Wettkampf,
 * Startnummer und die Kontaktperson des Vereins).
 */
data class MaterialOverviewRequestDto(
    val id: UUID,
    val materialOffer: UUID,
    val materialType: UUID,
    val materialTypeName: String,
    val category: MaterialCategory,
    val count: Int,
    val status: MaterialRequestStatus,
    val decisionNote: String?,
    val requestedAt: LocalDateTime,
    val decidedAt: LocalDateTime?,
    val competitionRegistration: UUID,
    val competition: UUID,
    val competitionIdentifier: String,
    val competitionName: String,
    val teamName: String?,
    /**
     * Meldungsnummer aus der Fixierung - je Wettkampf eindeutig und fest. Die Grundzuteilung
     * paart Boot n mit Meldungsnummer n ("Nach Startnummer zuteilen", Abgleich bei der Fixierung).
     */
    val teamNumber: Int?,
    /**
     * Die Startnummer im ersten Lauf des Teams (je Lauf ab 1, in Folgerunden der Rang); ohne
     * Lauf die Meldungsnummer. Nur zur Anzeige - nicht eindeutig je Wettkampf, deshalb nie zum
     * Paaren. Die Startnummer je Lauf steht in [MaterialOverviewMatchDto.teams].
     */
    val startNumber: Int?,
    val clubId: UUID,
    val clubName: String,
    // Kontakt = E-Mail des Nutzers, der die Anmeldung angelegt hat (event_registration.created_by).
    val clubContactEmail: String?,
    val assignments: List<MaterialAssignmentDto>,
)

data class MaterialAssignmentDto(
    val id: UUID,
    val materialItem: UUID,
    val competitionMatch: UUID?,
)

/**
 * Ein Lauf, in dem eine der Anfragen dieses Anbieters läuft - Grundlage für die Ausnahme je Lauf
 * bei der Zuteilung. [id] ist `competition_match.competition_setup_match`, wie überall im System.
 */
data class MaterialOverviewMatchDto(
    val id: UUID,
    val competition: UUID,
    val name: String?,
    val roundName: String?,
    val startTime: LocalDateTime?,
    val endTime: LocalDateTime?,
    val registrationIds: List<UUID>,
    /**
     * Je Meldung dieses Laufs die Startnummer im Lauf (`competition_match_team.start_number`) -
     * dieselbe Zahl, gegen die die Anzeigen eine Abweichung des Boots markieren.
     */
    val teams: List<MaterialOverviewMatchTeamDto>,
)

data class MaterialOverviewMatchTeamDto(
    val competitionRegistration: UUID,
    val startNumber: Int,
)
