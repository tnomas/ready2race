package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.materialCell
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.startListShowsMaterial
import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionMatchData
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialForTeamDto
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Reine Logik ohne Datenbank: ob eine Startliste die Boot-Spalte zeigt (Materialvermietung,
 * Task 6.1) und was in ihr steht - der einzige Baustein von `buildPdf`/`buildCsv`, der sich
 * ohne PDF/CSV-Erzeugung isoliert prüfen lässt.
 */
class StartListMaterialTest {

    private fun team(material: MaterialForTeamDto? = null) = CompetitionMatchData.CompetitionMatchTeam(
        registrationId = UUID.randomUUID(),
        matchTeamId = UUID.randomUUID(),
        startNumber = 1,
        registeringClubName = "RV Test",
        actualClubName = null,
        teamName = null,
        ratingCategory = null,
        participants = emptyList(),
        deregistered = false,
        material = material,
    )

    private val deviating = MaterialForTeamDto(
        number = 7,
        label = "Boot 7",
        category = MaterialCategory.BOAT,
        deviatesFromStartNumber = true,
    )

    private val matching = MaterialForTeamDto(
        number = 1,
        label = "Boot 1",
        category = MaterialCategory.BOAT,
        deviatesFromStartNumber = false,
    )

    @Test
    fun keineSpalteOhneAbweichungUndOhneErzwingen() {
        assertFalse(startListShowsMaterial(listOf(team(), team(matching)), forced = false))
    }

    @Test
    fun spalteBeiEinerEinzigenAbweichung() {
        assertTrue(startListShowsMaterial(listOf(team(matching), team(deviating)), forced = false))
    }

    @Test
    fun spalteWennErzwungenAuchOhneAbweichung() {
        assertTrue(startListShowsMaterial(listOf(team()), forced = true))
    }

    @Test
    fun leereZelleOhneAnfrageUndOhneErzwingen() {
        assertEquals("", materialCell(team(), forced = false))
    }

    @Test
    fun leereZelleBeiRegelfallOhneErzwingen() {
        assertEquals("", materialCell(team(matching), forced = false))
    }

    @Test
    fun labelBeiAbweichungImmerUnabhaengigVonErzwingen() {
        assertEquals("Boot 7", materialCell(team(deviating), forced = false))
        assertEquals("Boot 7", materialCell(team(deviating), forced = true))
    }

    @Test
    fun labelBeiRegelfallMitErzwingen() {
        assertEquals("Boot 1", materialCell(team(matching), forced = true))
    }

    @Test
    fun eigenesBootOhneAnfrageMitErzwingen() {
        assertEquals("eigenes Boot", materialCell(team(), forced = true))
    }
}
