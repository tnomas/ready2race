package de.lambda9.ready2race.backend.app.certificate.boundary

import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateEntry
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateMode
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateOptions
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateTeam
import java.time.LocalDate

object AwardCertificateLogic {

    private val germanMonths = listOf(
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    )

    fun entriesForCompetition(
        competitionIdentifier: String,
        competitionName: String,
        competitionShortName: String?,
        teams: List<AwardCertificateTeam>,
        options: AwardCertificateOptions,
    ): List<AwardCertificateEntry> = teams
        .filter { !it.excluded && it.place <= options.maxPlace }
        .sortedWith(compareBy({ it.place }, { it.startNumber }))
        .flatMap { team ->
            val names = team.participants.map { "${it.firstName} ${it.lastName}" }

            val nameGroups = when (options.mode) {
                AwardCertificateMode.PER_ATHLETE -> names.map { listOf(it) }
                AwardCertificateMode.PER_TEAM -> listOf(names)
            }

            nameGroups.map { group ->
                AwardCertificateEntry(
                    place = team.place,
                    competitionIdentifier = competitionIdentifier,
                    competitionName = competitionName,
                    competitionShortName = competitionShortName,
                    clubName = team.clubName,
                    teamName = team.teamName,
                    result = team.result,
                    names = group,
                    registrationId = team.registrationId,
                )
            }
        }

    fun formatPlace(place: Int): String = "$place. Platz"

    /**
     * Renntage als Bereich, wie auf der DRV-Vorlage: „16.–17. August 2025", über Monatsgrenzen
     * hinweg „31. Juli – 1. August 2025".
     */
    fun formatEventDate(days: List<LocalDate>): String {
        if (days.isEmpty()) return ""

        val first = days.min()
        val last = days.max()
        val year = last.year

        return when {
            first == last -> "${first.dayOfMonth}. ${germanMonths[first.monthValue - 1]} $year"
            first.month == last.month && first.year == last.year ->
                "${first.dayOfMonth}.–${last.dayOfMonth}. ${germanMonths[first.monthValue - 1]} $year"
            else ->
                "${first.dayOfMonth}. ${germanMonths[first.monthValue - 1]} – " +
                    "${last.dayOfMonth}. ${germanMonths[last.monthValue - 1]} $year"
        }
    }
}
