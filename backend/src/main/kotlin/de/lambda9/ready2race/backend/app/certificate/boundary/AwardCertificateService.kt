package de.lambda9.ready2race.backend.app.certificate.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateEntry
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateError
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateOptions
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateParticipant
import de.lambda9.ready2race.backend.app.certificate.entity.AwardCertificateTeam
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
import de.lambda9.ready2race.backend.app.competitionExecution.boundary.CompetitionExecutionService
import de.lambda9.ready2race.backend.app.documentTemplate.boundary.GapPlaceholderLogic
import de.lambda9.ready2race.backend.app.documentTemplate.control.GapDocumentTemplateRepo
import de.lambda9.ready2race.backend.app.documentTemplate.control.toGapPlaceholders
import de.lambda9.ready2race.backend.app.documentTemplate.entity.GapDocumentType
import de.lambda9.ready2race.backend.app.documentTemplate.entity.GapPlaceholderValues
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.event.entity.EventError
import de.lambda9.ready2race.backend.app.eventDay.control.EventDayRepo
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.docx.gapDocumentsDocx
import de.lambda9.ready2race.backend.docx.toByteArray
import de.lambda9.ready2race.backend.lexiNumberComp
import de.lambda9.ready2race.backend.pdf.gapDocuments
import de.lambda9.ready2race.backend.singletonOrFallback
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import org.apache.pdfbox.Loader
import java.io.ByteArrayOutputStream
import java.util.UUID

object AwardCertificateService {

    enum class Format { PDF, DOCX }

    fun downloadForEvent(
        eventId: UUID,
        options: AwardCertificateOptions,
        format: Format,
    ): App<ServiceError, ApiResponse.File> = KIO.comprehension {
        val entries = !entriesForEvent(eventId, options, competitionId = null, registrationId = null)
        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }

        render(eventId, entries, options, format, "urkunden_${event.name}")
    }

    fun downloadForCompetition(
        eventId: UUID,
        competitionId: UUID,
        options: AwardCertificateOptions,
        format: Format,
    ): App<ServiceError, ApiResponse.File> = KIO.comprehension {
        val entries = !entriesForEvent(eventId, options, competitionId, registrationId = null)
        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        val identifier = entries.firstOrNull()?.competitionIdentifier ?: ""

        render(eventId, entries, options, format, "urkunden_${event.name}_$identifier")
    }

    fun downloadForRegistration(
        eventId: UUID,
        competitionId: UUID,
        registrationId: UUID,
        options: AwardCertificateOptions,
        format: Format,
    ): App<ServiceError, ApiResponse.File> = KIO.comprehension {
        val entries = !entriesForEvent(eventId, options, competitionId, registrationId)
        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        val first = entries.firstOrNull()
        val name = listOfNotNull(
            "urkunde",
            event.name,
            first?.competitionIdentifier,
            first?.place?.toString(),
            first?.names?.firstOrNull(),
        ).joinToString("_")

        render(eventId, entries, options, format, name)
    }

    /**
     * Sammelt die Urkunden der Veranstaltung, optional auf einen Wettkampf und eine Meldung
     * eingegrenzt. Die Wettkämpfe werden wie in der Ergebnisliste nach Identifier sortiert.
     */
    private fun entriesForEvent(
        eventId: UUID,
        options: AwardCertificateOptions,
        competitionId: UUID?,
        registrationId: UUID?,
    ): App<ServiceError, List<AwardCertificateEntry>> = KIO.comprehension {
        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }

        val competitions = !CompetitionRepo.getByEvent(eventId).orDie()

        val selected = if (competitionId == null) {
            competitions
        } else {
            val match = competitions.filter { it.id == competitionId }
            !KIO.failOn(match.isEmpty()) { AwardCertificateError.CompetitionNotInEvent }
            match
        }

        val entries = !selected
            .sortedWith(lexiNumberComp { it.identifier })
            .traverse { competition ->
                KIO.comprehension {
                    val places = !CompetitionExecutionService.computeCompetitionPlaces(competition.id!!)

                    val teams = places.map { (team, place) ->
                        val clubs = team.participants.map { it.externalClubName }.toSet()
                        val clubName = singletonOrFallback(clubs, team.mixedTeamTerm) ?: team.clubName

                        AwardCertificateTeam(
                            place = place,
                            clubName = clubName,
                            teamName = team.registrationName,
                            result = team.timeString,
                            startNumber = team.startNumber,
                            excluded = team.deregistered || team.out || team.failed,
                            participants = team.participants.map {
                                AwardCertificateParticipant(
                                    firstName = it.firstName,
                                    lastName = it.lastName,
                                    role = it.namedParticipantName,
                                )
                            },
                            registrationId = team.competitionRegistration,
                        )
                    }.filter { registrationId == null || it.registrationId == registrationId }

                    KIO.ok(
                        AwardCertificateLogic.entriesForCompetition(
                            competitionIdentifier = competition.identifier!!,
                            competitionName = competition.name!!,
                            competitionShortName = competition.shortName,
                            teams = teams,
                            options = options,
                        )
                    )
                }
            }
            .map { it.flatten() }

        !KIO.failOn(entries.isEmpty()) { AwardCertificateError.NoResults }

        KIO.ok(entries)
    }

    private fun render(
        eventId: UUID,
        entries: List<AwardCertificateEntry>,
        options: AwardCertificateOptions,
        format: Format,
        fileBaseName: String,
    ): App<ServiceError, ApiResponse.File> = KIO.comprehension {
        val template = !GapDocumentTemplateRepo.getAssigned(GapDocumentType.AWARD_CERTIFICATE).orDie()
            .onNullFail { AwardCertificateError.MissingTemplate }

        val event = !EventRepo.get(eventId).orDie().onNullFail { EventError.NotFound }
        val eventDays = !EventDayRepo.getByEvent(eventId).orDie()
        val eventDate = AwardCertificateLogic.formatEventDate(eventDays.map { it.date })

        val placeholders = template.placeholders!!.toList().toGapPlaceholders()

        val pages = entries.map { entry ->
            GapPlaceholderLogic.fill(
                placeholders = placeholders,
                values = GapPlaceholderValues(
                    firstName = entry.names.singleOrNull()?.substringBefore(" "),
                    lastName = entry.names.singleOrNull()?.substringAfter(" "),
                    fullName = entry.names.joinToString("\n"),
                    result = entry.result,
                    eventName = event.name,
                    place = AwardCertificateLogic.formatPlace(entry.place),
                    competitionName = entry.competitionName,
                    competitionShortName = entry.competitionShortName,
                    clubName = entry.clubName,
                    teamName = entry.teamName,
                    eventDate = eventDate,
                    eventLocation = event.location,
                ),
            )
        }

        val bytes = when (format) {
            Format.PDF -> {
                val doc = gapDocuments(
                    template = template.data!!,
                    font = template.fontData,
                    withBackground = options.withBackground,
                    pages = pages,
                )
                val out = ByteArrayOutputStream()
                doc.save(out)
                doc.close()
                out.toByteArray()
            }

            Format.DOCX -> {
                val templateDoc = Loader.loadPDF(template.data!!)
                val format0 = templateDoc.getPage(0).mediaBox
                val width = format0.width
                val height = format0.height
                templateDoc.close()

                gapDocumentsDocx(
                    pageWidthPoints = width,
                    pageHeightPoints = height,
                    fontName = template.fontName,
                    pages = pages,
                ).toByteArray()
            }
        }

        val extension = if (format == Format.PDF) "pdf" else "docx"

        KIO.ok(
            ApiResponse.File(
                name = "$fileBaseName.$extension",
                bytes = bytes,
            )
        )
    }
}
