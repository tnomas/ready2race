package de.lambda9.ready2race.backend.app.eventDay.entity

import java.time.LocalDate
import java.time.LocalDateTime
import java.util.*

data class EventDayDto (
    val id: UUID,
    val event: UUID,
    val date: LocalDate,
    val name: String?,
    val description: String?,
    /**
     * Ab wann an diesem Tag vor Ort gearbeitet wird — Akkreditierung, Bedingungsprüfung,
     * Check-in/-out. Steuert, ab wann die Helfer-App die Veranstaltung zur Wahl stellt.
     *
     * Darf vor [date] liegen: Die Akkreditierung des ersten Renntages findet oft am Vorabend
     * statt. Ist nichts gepflegt, zählt der Tag ab 00:00.
     */
    val operationsStart: LocalDateTime?,
)