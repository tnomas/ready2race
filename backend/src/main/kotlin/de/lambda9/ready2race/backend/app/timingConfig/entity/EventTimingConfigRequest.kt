package de.lambda9.ready2race.backend.app.timingConfig.entity

import de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerPollLogic
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import java.util.UUID

/**
 * Zeitnahme-Voreinstellung der Veranstaltung. Jedes Feld optional wie beim Wettkampf
 * ([TimingConfigRequest]): die RaceClocker-Rennen entstehen erst kurz vor der Regatta.
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
     * Erfassungstöne der Posten (FINISH/SPLIT). Anders als Takte und Genauigkeit optional MIT
     * Bedeutung: `null` heisst "eingebauter Standard" und räumt einen eigenen Wert wieder ab
     * ("Standard wiederherstellen") - PUT-Semantik wie beim OfficialTimeOverrideRequest.
     */
    val finishTone: CaptureTone?,
    val splitTone: CaptureTone?,
    /**
     * Fehlstart-FOLGE der Startposten, gleiche PUT-Semantik wie die Erfassungstöne: `null` heisst
     * "eingebaute Standardfolge" (kurz-kurz-lang, siehe
     * [TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE]) und räumt einen eigenen Wert wieder ab.
     * Geschrieben wird immer die Liste - der frühere Einzelton-Wert bleibt lesbar (Conversions),
     * entsteht aber nicht mehr neu.
     */
    val falseStartTone: List<ToneStep>?,
) : Validatable {

    override fun validate(): ValidationResult =
        ValidationResult.allOf(
            validateInterval(intervalActiveSeconds, "intervalActiveSeconds"),
            validateInterval(intervalUpcomingSeconds, "intervalUpcomingSeconds"),
            validateMinutes(watchBeforeMinutes, "watchBeforeMinutes"),
            validateMinutes(watchAfterMinutes, "watchAfterMinutes"),
            TimingToneLimits.validateCaptureTone(finishTone, "finishTone"),
            TimingToneLimits.validateCaptureTone(splitTone, "splitTone"),
            TimingToneLimits.validateToneSequence(falseStartTone, "falseStartTone"),
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
                finishTone = null,
                splitTone = null,
                falseStartTone = null,
            )
    }
}
