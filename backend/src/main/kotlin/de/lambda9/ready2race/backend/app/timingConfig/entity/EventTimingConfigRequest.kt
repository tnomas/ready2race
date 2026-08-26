package de.lambda9.ready2race.backend.app.timingConfig.entity

import de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerPollLogic
import de.lambda9.ready2race.backend.app.timing.entity.StartDisplaySettings
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartDisplayLimits
import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Zeitnahme-Einstellungen der Veranstaltung. System und Dateiformate bleiben optional: Sie werden
 * beim Anlegen der Regatta noch nicht gewusst und dürfen deshalb leer bleiben.
 *
 * Die Töne sind hier nicht mehr dabei: Zwischen-, Fehlstart- und Zielton gehören zum Zeitnahmetyp
 * und werden seit dem 26.08.2026 über die Ton-Sätze der Veranstaltung gepflegt
 * (`TimingToneSetService`), nicht mehr über dieses Formular.
 */
data class EventTimingConfigRequest(
    val timingSystem: TimingSystem?,
    val startlistConfig: UUID?,
    val resultImportConfig: UUID?,
    /**
     * Der automatische Abruf und seine Takte. Anders als die Felder darüber nicht optional: Sie
     * haben in der Datenbank eine Vorgabe (Migration V202608071600), und ein `null` hier hieße
     * "unverändert lassen" - eine Bedeutung, die das Formular nicht braucht und die beim Ausschalten
     * der Automatik gefährlich wäre.
     */
    val autoPull: Boolean,
    val intervalActiveSeconds: Int,
    val intervalUpcomingSeconds: Int,
    val watchBeforeMinutes: Int,
    val watchAfterMinutes: Int,
    /**
     * Genauigkeit der veroeffentlichten offiziellen Zeiten. Wie die Takte nicht optional: die
     * Spalte hat eine Vorgabe, und `null` hiesse "unveraendert lassen" - eine Bedeutung, die das
     * Formular nicht braucht. Eine Aenderung rechnet serverseitig alle eigenen Ergebnisse auf die
     * neue Stufe um (TimingConfigService.updateEventTimingConfig).
     */
    val timingPrecision: TimingPrecision,
    /**
     * Ob das START-Board den manuellen Stempel zeigt. Wie Takte und Genauigkeit NICHT optional:
     * die Spalte hat eine Vorgabe (`false`, Migration V202608242000), und `null` hieße hier
     * "unverändert lassen" - eine Bedeutung, die das Formular nicht braucht und die beim
     * Ausschalten gefährlich wäre (der Schalter wäre dann nicht abschaltbar).
     */
    val showManualCapture: Boolean,
    /**
     * Der Anzeige-Block des Startbildschirms mit PUT-Semantik: `null` heißt "eingebaute Vorgaben"
     * ([TimingStartDisplayLimits.DEFAULT]) und räumt einen eigenen Wert wieder ab ("Standard
     * wiederherstellen"). Teilweise gesetzt gibt es nicht - entweder der ganze Block oder gar
     * keiner, siehe [StartDisplaySettings].
     */
    val startDisplay: StartDisplaySettings?,
) : Validatable {

    override fun validate(): ValidationResult =
        ValidationResult.allOf(
            validateInterval(intervalActiveSeconds, "intervalActiveSeconds"),
            validateInterval(intervalUpcomingSeconds, "intervalUpcomingSeconds"),
            validateMinutes(watchBeforeMinutes, "watchBeforeMinutes"),
            validateMinutes(watchAfterMinutes, "watchAfterMinutes"),
            TimingStartDisplayLimits.validate(startDisplay, "startDisplay"),
        )

    companion object {

        /**
         * Dieselbe Grenze, die der Job ohnehin erzwingt - hier nur, damit sie beim Speichern
         * sichtbar wird statt still zu greifen.
         */
        private fun validateInterval(value: Int, field: String): ValidationResult =
            if (value < RaceClockerPollLogic.MIN_INTERVAL_SECONDS) {
                ValidationResult.Invalid.Message { "$field must be at least ${RaceClockerPollLogic.MIN_INTERVAL_SECONDS} seconds" }
            } else {
                ValidationResult.Valid
            }

        /** Null Minuten sind erlaubt: "erst ab der geplanten Startzeit beobachten" ist eine Ansage. */
        private fun validateMinutes(value: Int, field: String): ValidationResult =
            if (value < 0) {
                ValidationResult.Invalid.Message { "$field must not be negative" }
            } else {
                ValidationResult.Valid
            }

        val example
            get() = EventTimingConfigRequest(
                timingSystem = TimingSystem.RACECLOCKER,
                startlistConfig = UUID.randomUUID(),
                resultImportConfig = UUID.randomUUID(),
                autoPull = true,
                intervalActiveSeconds = 5,
                intervalUpcomingSeconds = 60,
                watchBeforeMinutes = 15,
                watchAfterMinutes = 120,
                timingPrecision = TimingPrecision.ZEHNTEL,
                showManualCapture = false,
                startDisplay = null,
            )
    }
}
