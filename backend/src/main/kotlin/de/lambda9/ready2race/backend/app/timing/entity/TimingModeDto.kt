package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/** Ein Zeitnahmetyp der Veranstaltung - die Vorlage dafür, wie ein Lauf gestartet und gemessen wird. */
data class TimingModeDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    /** Werden Rundenzeiten erwartet (SPLIT-Posten relevant)? */
    val withLaps: Boolean,
    val startGrouping: TimingStartGrouping,
    /** Gesetzt: Starts folgen automatisch in diesem Abstand; null: jeder Start von Hand. */
    val intervalSeconds: Int?,
    /** Vorlauf/Countdown vor dem (ersten) Start, Anschluss an die lead_in-Mechanik der Sequenzen. */
    val leadInSeconds: Int,
    /**
     * Tonplan der Startsequenz: welche Sinus-Pieps wann relativ zum Start gespielt werden,
     * aufsteigend nach Offset. null = eingebauter Standardplan (klingt exakt wie bisher).
     */
    val tonePlan: List<TonePlanStep>?,
)
