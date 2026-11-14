package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.MATERIAL_DEVIATES_LABEL
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.materialCell
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.materialLine
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.startListShowsMaterial
import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionMatchData
import de.lambda9.ready2race.backend.app.material.entity.MaterialCategory
import de.lambda9.ready2race.backend.app.material.entity.MaterialForTeamDto
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
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

    @Test
    fun zeileMarkiertAbweichung() {
        assertEquals("Boot 7 ($MATERIAL_DEVIATES_LABEL)", materialLine(team(deviating), forced = false))
        assertEquals("Boot 1", materialLine(team(matching), forced = true))
        assertEquals(null, materialLine(team(matching), forced = false))
        assertEquals("eigenes Boot", materialLine(team(), forced = true))
    }

    /**
     * Im PDF steht das Boot einmal je Team unter der Überschrift „Boot / Boat“ (nicht in jeder
     * Teilnehmerzeile), eine Abweichung ist markiert.
     */
    @Test
    fun pdfZeigtBootEinmalJeTeamMitUeberschriftUndAbweichung() {
        fun participant(name: String) = CompetitionMatchData.CompetitionMatchParticipant(
            role = "Ruderer", firstname = name, lastname = "Test", year = 1990, gender = Gender.M, externalClubName = null,
        )
        val first = team(deviating).copy(startNumber = 1, participants = List(3) { participant("A$it") })
        val second = team(matching).copy(startNumber = 2, participants = List(3) { participant("B$it") })
        val data = CompetitionMatchData(
            matchName = "Vorlauf 1",
            roundName = "Vorlauf",
            order = 1,
            startTime = null,
            startTimeOffset = null,
            competition = CompetitionMatchData.CompetitionData("M1", "Materialtest", null, null),
            teams = listOf(first, second),
        )

        fun text(forced: Boolean): String {
            val bytes = CompetitionExecutionService.buildPdf(data, null, forceMaterial = forced)
            return Loader.loadPDF(bytes).use { PDFTextStripper().getText(it) }
        }

        val plain = text(forced = false)
        assertEquals(1, Regex("Boot 7").findAll(plain).count(), plain)
        assertTrue(plain.contains("Boot / Boat"), plain)
        assertTrue(plain.contains("abweichend / differs"), plain)
        assertFalse(plain.contains("Boot 1"), plain)

        val forced = text(forced = true)
        assertEquals(1, Regex("Boot 7").findAll(forced).count(), forced)
        assertEquals(1, Regex("Boot 1").findAll(forced).count(), forced)
        assertEquals(2, Regex("Boot / Boat").findAll(forced).count(), forced)
    }
}
