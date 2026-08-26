package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.Validatable
import de.lambda9.ready2race.backend.validation.ValidationResult
import de.lambda9.ready2race.backend.validation.validate
import de.lambda9.ready2race.backend.validation.validators.IntValidators
import de.lambda9.ready2race.backend.validation.validators.StringValidators.notBlank
import java.util.UUID

data class TimingModeRequest(
    val name: String,
    val startGrouping: TimingStartGrouping,
    val intervalSeconds: Int?,
    val leadInSeconds: Int,
    /**
     * Fehlstart-Auslöser am Startposten erlaubt? Vorgabe `true` - der Rückruf ist der Normalfall.
     * Abgeschaltet wird er dort, wo er fachlich falsch wäre (Timetrial: Strafzeit statt Rückruf);
     * siehe [TimingModeDto.falseStartEnabled].
     *
     * Mit Vorgabewert, damit ältere Aufrufer (und die Beispiel-Bodies der Doku) das Feld weglassen
     * dürfen und dabei genau das bekommen, was die Datenbank als Default schreibt.
     */
    val falseStartEnabled: Boolean = true,
    /**
     * Der Ton-Satz dieses Typs; null (die Vorgabe) heißt „erbt den Vorgabesatz der Veranstaltung".
     *
     * Den Startsequenz-Tonplan führt dieser Request seit dem 26.08.2026 nicht mehr: Er gehört zum
     * Ton-Satz, gemeinsam mit den drei übrigen Tönen, und wird über
     * `PUT /timing/tone-sets/{toneSetId}` gepflegt. Ein zweiter Schreibweg auf denselben Wert wäre
     * eine Einladung, ihn an zwei Stellen verschieden zu setzen.
     */
    val toneSet: UUID? = null,
    /** Startet die App Läufe dieses Typs? Vorgabe `true` - siehe [TimingModeDto.startSequenceEnabled]. */
    val startSequenceEnabled: Boolean = true,
    /** Erste Tastenreihe des Zielpostens; Regeln siehe [TimingBoatKeys]. */
    val boatKeysPrimary: String = TimingBoatKeys.DEFAULT_PRIMARY,
    /** Zweite, optionale Tastenreihe; null heißt „es gibt keine". */
    val boatKeysSecondary: String? = TimingBoatKeys.DEFAULT_SECONDARY,
) : Validatable {

    override fun validate(): ValidationResult = ValidationResult.allOf(
        this::name validate notBlank,
        // Ein Intervall von 0 hieße "alle sofort" - das ist der Massenstart (WELLE ohne
        // Intervall), kein Intervallstart. Deshalb mindestens 1 Sekunde.
        this::intervalSeconds validate IntValidators.min(1),
        this::leadInSeconds validate IntValidators.notNegative,
        // Eigener, sprechender Fehler statt eines rohen Datenbankfehlers - die Datenbank kennt die
        // Regeln der Tastenbelegung gar nicht, sie stehen an EINER Stelle im Code.
        TimingBoatKeys.validate(boatKeysPrimary, boatKeysSecondary, "timingMode"),
    )

    companion object {
        val example
            get() = TimingModeRequest(
                name = "Timetrial 30s",
                startGrouping = TimingStartGrouping.EINZEL,
                intervalSeconds = 30,
                leadInSeconds = 10,
            )
    }
}
