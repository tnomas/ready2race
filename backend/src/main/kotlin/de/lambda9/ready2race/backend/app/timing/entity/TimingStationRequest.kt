package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

data class TimingStationRequest(
    val name: String,
    val type: TimingStationType,
    val sorting: Int,
    /**
     * Nur für [TimingStationType.ANZEIGE]: welchen START-Posten die Anzeige spiegelt; null =
     * alle Startsequenzen der Veranstaltung. Dass die Verknüpfung nur an einer ANZEIGE hängt
     * und auf einen START-Posten derselben Veranstaltung zeigt, prüft der Service.
     */
    val linkedStation: java.util.UUID? = null,
    /**
     * Die Betriebsart des Postens. `null` heißt „unverändert lassen"; beim Anlegen wird daraus
     * [TimingCaptureMode.ONETOUCH] - das heutige Verhalten, denn ein Posten, der ungefragt auf
     * ARMED spränge, stünde am nächsten Renntag vor einem toten Knopf.
     *
     * Kein harter Vorgabewert, weil die Richtung zählt: ein Formular, das das Feld (noch) nicht
     * kennt, würde einen ARMED-Posten beim bloßen Umbenennen sonst still auf ONETOUCH
     * zurückfallen lassen - ein stiller Rückfall, der eine Sicherung ENTFERNT.
     *
     * Der Zustand `armed` steht bewusst gar nicht hier: den schaltet der Zeitnehmer am Tag über
     * seinen eigenen Weg.
     */
    val captureMode: TimingCaptureMode? = null,
) : Validatable {
    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
    )

    companion object {
        val example get() = TimingStationRequest(
            name = "Finish",
            type = TimingStationType.FINISH,
            sorting = 0,
            linkedStation = null,
            captureMode = TimingCaptureMode.ONETOUCH,
        )
    }
}
