package de.lambda9.ready2race.backend.app.certificate

import de.lambda9.ready2race.backend.app.certificate.boundary.AwardCertificateLogic
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateMode
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateOptions
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateParticipant
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateTeam
import java.time.LocalDate
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AwardCertificateLogicTest {

    private fun participant(firstName: String, lastName: String, role: String = "Ruderer") =
        AwardCertificateParticipant(firstName = firstName, lastName = lastName, role = role)

    private fun team(
        place: Int,
        clubName: String = "RC Allemannia Hamburg v. 1866",
        teamName: String? = null,
        result: String? = "33:17,7 min",
        startNumber: Int = place,
        excluded: Boolean = false,
        participants: List<AwardCertificateParticipant> = listOf(participant("Carina", "Hein")),
    ) = AwardCertificateTeam(
        place = place,
        clubName = clubName,
        teamName = teamName,
        result = result,
        startNumber = startNumber,
        excluded = excluded,
        participants = participants,
        registrationId = UUID.randomUUID(),
    )

    private fun options(
        maxPlace: Int = 3,
        mode: AwardCertificateMode = AwardCertificateMode.PER_ATHLETE,
    ) = AwardCertificateOptions(maxPlace = maxPlace, mode = mode, withBackground = false)

    private fun entries(
        teams: List<AwardCertificateTeam>,
        options: AwardCertificateOptions = options(),
    ) = AwardCertificateLogic.entriesForCompetition(
        competitionIdentifier = "1",
        competitionName = "CF 1x Frauen-Einer",
        competitionShortName = "CF 1x",
        teams = teams,
        options = options,
    )

    @Test
    fun placesBeyondTheLimitAreDropped() {
        val result = entries(listOf(team(1), team(2), team(3), team(4)))
        assertEquals(listOf(1, 2, 3), result.map { it.place })
    }

    @Test
    fun allPlacesArePossible() {
        val result = entries(listOf(team(1), team(2), team(3), team(4)), options(maxPlace = 99))
        assertEquals(listOf(1, 2, 3, 4), result.map { it.place })
    }

    @Test
    fun excludedTeamsGetNoCertificate() {
        val result = entries(listOf(team(1), team(2, excluded = true), team(3)))
        assertEquals(listOf(1, 3), result.map { it.place })
    }

    @Test
    fun perAthleteYieldsOneEntryPerParticipant() {
        val result = entries(
            listOf(
                team(
                    place = 1,
                    participants = listOf(
                        participant("Carina", "Hein"),
                        participant("Malte", "Hein"),
                        participant("Jonas", "Meier", role = "Steuermann"),
                    ),
                )
            )
        )

        assertEquals(3, result.size)
        assertEquals(listOf("Carina Hein"), result[0].names)
        assertEquals(listOf("Jonas Meier"), result[2].names)
        assertTrue(result.all { it.place == 1 })
    }

    @Test
    fun perTeamYieldsOneEntryWithAllNames() {
        val result = entries(
            listOf(
                team(
                    place = 1,
                    participants = listOf(participant("Carina", "Hein"), participant("Malte", "Hein")),
                )
            ),
            options(mode = AwardCertificateMode.PER_TEAM),
        )

        assertEquals(1, result.size)
        assertEquals(listOf("Carina Hein", "Malte Hein"), result.single().names)
    }

    @Test
    fun entriesAreSortedByPlaceThenStartNumber() {
        val result = entries(
            listOf(
                team(place = 2, startNumber = 7, clubName = "Startnummer 7"),
                team(place = 1, startNumber = 4, clubName = "Startnummer 4"),
                team(place = 2, startNumber = 3, clubName = "Startnummer 3"),
            )
        )

        assertEquals(listOf(1, 2, 2), result.map { it.place })
        assertEquals(
            listOf("Startnummer 4", "Startnummer 3", "Startnummer 7"),
            result.map { it.clubName },
        )
    }

    @Test
    fun competitionDataIsCarriedOver() {
        val result = entries(listOf(team(1, teamName = "Flensburg I"))).single()
        assertEquals("1", result.competitionIdentifier)
        assertEquals("CF 1x", result.competitionShortName)
        assertEquals("Flensburg I", result.teamName)
        assertEquals("33:17,7 min", result.result)
        assertEquals("RC Allemannia Hamburg v. 1866", result.clubName)
    }

    @Test
    fun missingResultStaysNull() {
        val result = entries(listOf(team(1, result = null))).single()
        assertEquals(null, result.result)
    }

    @Test
    fun placeIsFormattedGerman() {
        assertEquals("1. Platz", AwardCertificateLogic.formatPlace(1))
        assertEquals("12. Platz", AwardCertificateLogic.formatPlace(12))
    }

    @Test
    fun eventDateIsFormattedAsRange() {
        assertEquals(
            "16.–17. August 2025",
            AwardCertificateLogic.formatEventDate(
                listOf(LocalDate.of(2025, 8, 16), LocalDate.of(2025, 8, 17))
            ),
        )
    }

    @Test
    fun singleEventDayHasNoRange() {
        assertEquals(
            "16. August 2025",
            AwardCertificateLogic.formatEventDate(listOf(LocalDate.of(2025, 8, 16))),
        )
    }

    @Test
    fun eventDateAcrossMonthsSpellsBothMonths() {
        assertEquals(
            "31. Juli – 1. August 2025",
            AwardCertificateLogic.formatEventDate(
                listOf(LocalDate.of(2025, 7, 31), LocalDate.of(2025, 8, 1))
            ),
        )
    }

    @Test
    fun noEventDaysYieldsEmptyString() {
        assertEquals("", AwardCertificateLogic.formatEventDate(emptyList()))
    }
}
