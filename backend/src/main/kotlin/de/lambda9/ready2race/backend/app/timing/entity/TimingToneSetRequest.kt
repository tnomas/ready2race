package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank

/**
 * Anlegen und Ändern eines Ton-Satzes. `null` bleibt in jedem Ton-Feld die Bedeutung „eingebauter
 * Standard" - das Formular schickt genau dann null, wenn der Nutzer „Standard wiederherstellen"
 * gewählt hat.
 */
data class TimingToneSetRequest(
    val name: String,
    /**
     * Diesen Satz zur Vorgabe der Veranstaltung machen. `true` nimmt dem bisherigen Vorgabesatz
     * seine Markierung ab (siehe `TimingToneSetRepo.setDefault`); `false` am aktuellen
     * Vorgabesatz wird abgelehnt, solange es andere Sätze gibt - eine Veranstaltung mit Sätzen
     * ohne Vorgabe hätte niemanden, den die erbenden Typen hören könnten.
     *
     * Mit Vorgabewert, damit der übliche Aufruf („noch ein Satz") das Feld weglassen darf.
     */
    val isDefault: Boolean = false,
    /** null = eingebauter Standardplan; Offsets rückwärts zum Start, Grenzen siehe [TimingToneLimits]. */
    val sequenceTonePlan: List<ToneStep>? = null,
    val splitTone: CaptureTone? = null,
    /** null = eingebaute Standardfolge; Offsets vorwärts ab der Auslösung. */
    val falseStartTone: List<ToneStep>? = null,
    val finishTone: CaptureTone? = null,
    /** Vorgabe `true` wie in der Datenbank - siehe [TimingToneSetDto.tonePerBoat]. */
    val tonePerBoat: Boolean = true,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        TimingToneLimits.validateTonePlan(sequenceTonePlan, "sequenceTonePlan"),
        TimingToneLimits.validateCaptureTone(splitTone, "splitTone"),
        TimingToneLimits.validateToneSequence(falseStartTone, "falseStartTone"),
        TimingToneLimits.validateCaptureTone(finishTone, "finishTone"),
    )

    companion object {
        val example
            get() = TimingToneSetRequest(
                name = "Laut fürs Wasser",
                isDefault = true,
            )
    }
}
