package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

data class TimingStationDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
    /** Nur bei ANZEIGE gesetzt: der gespiegelte START-Posten; null = alle Starts der Veranstaltung. */
    val linkedStation: UUID?,
    /** Wie der Posten auf einen Druck reagiert - Einrichtung der Veranstaltung. */
    val captureMode: TimingCaptureMode,
    /**
     * Ob der Posten gerade scharf ist. Nur bei [TimingCaptureMode.ARMED] von Bedeutung; im
     * ONETOUCH-Betrieb liegt der Zustand brach.
     */
    val armed: Boolean,
)
