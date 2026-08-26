package de.lambda9.ready2race.backend.app.club

import de.lambda9.ready2race.backend.app.club.boundary.ClubComposition
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.competitionExecution.entity.StartListFileType
import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService
import de.lambda9.ready2race.backend.app.eventRegistration.control.EventRegistrationRepo
import de.lambda9.ready2race.backend.app.eventRegistration.entity.EventRegistrationResultData
import de.lambda9.ready2race.backend.app.results.boundary.ResultsService
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.extensions.kio.orDie
import org.apache.pdfbox.Loader
import org.apache.pdfbox.text.PDFTextStripper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Die Vereinskette in den Listen der Geschäftsstelle - Meldeansicht, Startliste, Ergebnisse und
 * die Rundenansicht der Durchführung.
 *
 * Diese vier waren im Entwurf vom 09.08.2026 ausdrücklich ausgenommen ("möglicher Nachzug im Laufe
 * der Woche") und blieben bei `singletonOrFallback(clubs, mixedTeamTerm)`. Was dort auffiel, als
 * die vereinsübergreifende Meldung (V202608142000) in Betrieb ging: Die alte Ableitung sah
 * ausschließlich `participant.external_club_name`. Ein Boot aus mehreren GEPFLEGTEN Vereinen trug
 * dort überall null, galt damit als eindeutig - und stand am Ende weder als Kette noch als
 * "Renngemeinschaft" da, sondern unter dem meldenden Verein.
 *
 * Deshalb prüft jeder Fall hier beides: die Kette der Gastruderer-Mannschaft aus [seedClubChain]
 * UND die reine Vereins-Mannschaft aus [seedCrossClubTeam], an der die alte Ableitung schwieg.
 */
class ClubChainInListsTest {

    private val crossClubChain = "$CROSS_CLUB_A${ClubComposition.SEPARATOR}$CROSS_CLUB_B"

    /** Der Zeilenumbruch des PDF ist für die Prüfung Weissraum wie jeder andere. */
    private val whitespace = Regex("""\s+""")

    @Test
    fun theRegistrationReportShowsTheChainAndEveryRowerTheirOwnClub() = testComprehension {
        val seeded = seedClubChain()
        seedCrossClubTeam(seeded)

        val text = pdfText(
            EventRegistrationService.buildPdf(
                data = EventRegistrationResultData.fromPersisted(
                    !EventRegistrationRepo.getRegistrationResult(seeded.eventId).orDie().map { it!! }
                ),
                template = null,
            )
        )

        assertChainInOrder(text)
        assertTrue(text.contains(crossClubChain), "Kette der reinen Vereins-Mannschaft fehlt: $text")

        // Der Verein je Person - bis zum 26.08.2026 stand hier bei jedem Vereinsmitglied der
        // meldende Verein, weil die Zeile nur `external_club_name` kannte.
        assertRowCarriesClub(text, "Albers", MAINZ)
        assertRowCarriesClub(text, "Cordes", FLENSBURG)
        assertRowCarriesClub(text, "Groth", ROSTOCK)
        assertRowCarriesClub(text, "Iversen", CROSS_CLUB_B)
    }

    @Test
    fun theStartListShowsTheChainAndEveryRowerTheirOwnClub() = testComprehension {
        val seeded = seedClubChain()
        seedCrossClubTeam(seeded)

        val file = !CompetitionExecutionService.getStartList(
            matchId = seeded.matchId,
            startListType = StartListFileType.PDF,
            startTimeRequired = false,
        )

        val text = pdfText(file.bytes)

        assertChainInOrder(text)
        assertTrue(text.contains(crossClubChain), "Kette der reinen Vereins-Mannschaft fehlt: $text")
        assertRowCarriesClub(text, "Albers", MAINZ)
        assertRowCarriesClub(text, "Groth", ROSTOCK)
        assertRowCarriesClub(text, "Iversen", CROSS_CLUB_B)
    }

    @Test
    fun theResultsDocumentShowsTheChain() = testComprehension {
        val seeded = seedClubChain()
        seedCrossClubTeam(seeded)

        val file = !ResultsService.generateResultsDocument(seeded.eventId)
        val text = pdfText(file.bytes)

        assertChainInOrder(text)
        assertTrue(text.contains(crossClubChain), "Kette der reinen Vereins-Mannschaft fehlt: $text")
    }

    @Test
    fun theRoundViewShowsTheChain() = testComprehension {
        val seeded = seedClubChain()
        val crossClub = seedCrossClubTeam(seeded)

        val progress = (!CompetitionExecutionService.getProgress(seeded.eventId, seeded.competitionId)).dto
        val teams = progress.rounds.single().matches.single().teams

        assertEquals(
            EXPECTED_FULL,
            teams.single { it.registrationId == seeded.registrationId }.actualClubName,
        )
        assertEquals(
            crossClubChain,
            teams.single { it.registrationId == crossClub.registrationId }.actualClubName,
        )
    }

    /**
     * Die fünf Vereine der gemischten Mannschaft, vollständig und in Bootsreihenfolge - und keine
     * Spur mehr von dem pauschalen Begriff, der bis zum 26.08.2026 an ihrer Stelle stand.
     *
     * Der meldende Verein wird hier NICHT ausgeschlossen: Anders als auf der Urkunde nennt ihn jede
     * dieser Listen bewusst noch einmal als "gemeldet von".
     */
    private fun assertChainInOrder(rendered: String) {
        val text = rendered.replace(whitespace, " ")

        EXPECTED_CLUBS.forEach {
            assertTrue(text.contains(it), "Verein fehlt in der Kette: '$it' in: $text")
        }
        EXPECTED_CLUBS.zipWithNext().forEach { (before, after) ->
            assertTrue(
                text.indexOf(before) < text.indexOf(after),
                "'$before' müsste vor '$after' stehen: $text",
            )
        }
        assertFalse(text.contains("Renngemeinschaft"), text)
    }

    /**
     * Die Zeile einer Person nennt den Verein, den sie trägt - nicht den, der sie gemeldet hat.
     *
     * Gesucht wird im Fließtext statt zeilenweise: Ein langer Vereinsname bricht in der Tabelle
     * um, und die Zeile mit dem Nachnamen trüge dann nur seine erste Hälfte.
     */
    private fun assertRowCarriesClub(rendered: String, lastName: String, club: String) {
        val text = rendered.replace(whitespace, " ")
        val row = Regex("""${Regex.escape(lastName)} \d{4} ${Regex.escape(club)}""")
        assertTrue(row.containsMatchIn(text), "Zeile für '$lastName' nennt nicht '$club': $text")
    }

    private fun pdfText(bytes: ByteArray): String {
        val doc = Loader.loadPDF(bytes)
        val text = PDFTextStripper().getText(doc)
        doc.close()
        return text
    }
}
