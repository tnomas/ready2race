package de.lambda9.ready2race.backend.app.participantRequirement.entity

import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

/**
 * Ein Lauf der Person, so weit die App ihn zum Abhaken braucht: wofür geprüft wird (Wettkampf und
 * Tag) und woran das Erledigungsfenster hängt ([startTime]).
 *
 * [eventDay] wird ausdrücklich hier im Backend bestimmt und nicht in der App - über
 * `RequirementScopeLogic.eventDayOf`, dieselbe Regel, mit der die Schiedsrichter-Ansicht später
 * auswertet. Würde die App den Tag selbst aus dem Datum raten, gäbe es zwei Regeln, die bei
 * mehrtägigen Wettkämpfen auseinanderlaufen können - und der Haken landete an einem Tag, an dem
 * ihn niemand sucht. Die App schickt schlicht zurück, was sie hier bekommen hat.
 */
data class ParticipantMatchScopeDto(
    val competitionId: UUID,
    val competitionName: String,
    val competitionIdentifier: String?,
    val competitionShortName: String?,
    val eventDay: UUID?,
    val eventDayDate: LocalDate?,
    val startTime: LocalDateTime?,
    val matchName: String?,
    val roundName: String?,
)
