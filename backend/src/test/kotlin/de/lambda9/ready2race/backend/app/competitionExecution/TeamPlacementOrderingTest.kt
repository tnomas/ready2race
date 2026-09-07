package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionMatchTeamWithRegistration
import de.lambda9.ready2race.backend.app.competitionExecution.entity.TeamPlacement
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Reihenfolge gleichplatzierter Boote in Listen und Exporten: erst die schnellere Zeit, bei
 * gleicher Zeit die kleinere Startnummer. Vorher entschied bei gleichem Platz die Zufallsreihenfolge
 * der Datenbank - zwei Ausdrucke derselben Wertung konnten verschieden aussehen.
 */
class TeamPlacementOrderingTest {

    private fun team(startNumber: Int, time: String?) = CompetitionMatchTeamWithRegistration(
        id = UUID.randomUUID(),
        competitionMatch = UUID.randomUUID(),
        startNumber = startNumber,
        place = null,
        timeString = time,
        placesCalculated = true,
        competitionRegistration = UUID.randomUUID(),
        clubId = UUID.randomUUID(),
        clubName = "Verein $startNumber",
        registrationName = null,
        teamNumber = null,
        participants = emptyList(),
        deregistered = false,
        deregistrationReason = null,
        out = false,
        failed = false,
        failedReason = null,
        penaltySeconds = null,
        penaltyNote = null,
        ratingCategory = null,
        mixedTeamTerm = null,
    )

    @Test
    fun beiGleichemPlatzStehtDieSchnellereZeitVorn() {
        val sorted = listOf(
            TeamPlacement(team(1, "3:12.9"), place = 2),
            TeamPlacement(team(2, "3:12.4"), place = 2),
            TeamPlacement(team(3, "3:10.0"), place = 1),
        ).sortedWith(TeamPlacement.ordering)

        assertEquals(listOf(3, 2, 1), sorted.map { it.team.startNumber })
    }

    @Test
    fun beiGleicherZeitEntscheidetDieStartnummer() {
        val sorted = listOf(
            TeamPlacement(team(7, "3:12.4"), place = 1),
            TeamPlacement(team(4, "3:12.4"), place = 1),
            TeamPlacement(team(5, null), place = 1),
        ).sortedWith(TeamPlacement.ordering)

        // Ohne Zeit hinter allen mit Zeit.
        assertEquals(listOf(4, 7, 5), sorted.map { it.team.startNumber })
    }

    @Test
    fun partieUndPlatzGehenWeiterVor() {
        val sorted = listOf(
            TeamPlacement(team(1, "3:00.0"), place = 1, matchWeighting = 2),
            TeamPlacement(team(2, "3:30.0"), place = 2, matchWeighting = 1),
            TeamPlacement(team(3, "3:40.0"), place = 1, matchWeighting = 1),
        ).sortedWith(TeamPlacement.ordering)

        assertEquals(listOf(3, 2, 1), sorted.map { it.team.startNumber })
    }
}
