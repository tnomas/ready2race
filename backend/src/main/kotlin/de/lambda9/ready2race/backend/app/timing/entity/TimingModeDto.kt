package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Ein Zeitnahmetyp der Veranstaltung - die Vorlage dafür, wie ein Lauf gestartet wird.
 *
 * Wie gemessen wird, steht nicht hier: Ob es Zwischenzeiten gibt, sagen die SPLIT-Posten am
 * Wettkampf (`competition_timing_station`), nicht der Typ.
 */
data class TimingModeDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val startGrouping: TimingStartGrouping,
    /** Gesetzt: Starts folgen automatisch in diesem Abstand; null: jeder Start von Hand. */
    val intervalSeconds: Int?,
    /** Vorlauf/Countdown vor dem (ersten) Start, Anschluss an die lead_in-Mechanik der Sequenzen. */
    val leadInSeconds: Int,
    /**
     * Darf der Startposten für Läufe dieses Typs einen Fehlstart auslösen (Sequenz abbrechen +
     * Versuch zurücknehmen + rotes Signal an die Anzeigen)?
     *
     * Steuert die Sichtbarkeit des Knopfes am Board UND die Route selbst - ein abgeschalteter Typ
     * lehnt den Fehlstart ab, nicht nur die Oberfläche. Der Fall dahinter ist der Timetrial im
     * Rudersport: dort wird ein Fehlstart mit Strafzeit geahndet, nicht mit Rückruf.
     */
    val falseStartEnabled: Boolean,
    /**
     * Tonplan der Startsequenz: welche Sinus-Pieps wann relativ zum Start gespielt werden,
     * aufsteigend nach Offset. null = eingebauter Standardplan (klingt exakt wie bisher).
     */
    val tonePlan: List<ToneStep>?,
)
