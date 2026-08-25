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
     * Die Betriebsart des Postens. Vorgabe [TimingCaptureMode.ONETOUCH] - das heutige Verhalten;
     * ein Posten, der ungefragt auf ARMED spränge, stünde am nächsten Renntag vor einem toten
     * Knopf. Der Zustand `armed` steht bewusst NICHT hier: den schaltet der Zeitnehmer am Tag über
     * seinen eigenen Weg, und ein Speichern der Einrichtung dürfte ihn nicht mit zurücksetzen.
     */
    val captureMode: TimingCaptureMode = TimingCaptureMode.ONETOUCH,
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
