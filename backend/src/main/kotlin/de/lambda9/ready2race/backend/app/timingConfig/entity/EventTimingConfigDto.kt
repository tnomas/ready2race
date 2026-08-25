package de.lambda9.ready2race.backend.app.timingConfig.entity

import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.StartDisplaySettings
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import java.util.UUID

/**
 * Die Zeitnahme-Einstellungen einer Veranstaltung: System, Startlisten-Export und
 * Rennergebnisse-Import gelten für ALLE ihre Wettkämpfe. Eine Abweichung je Wettkampf gibt es
 * nicht mehr — zwei Zeitnahme-Softwares in einer Regatta kommen nicht vor, und alle Wettkämpfe
 * exportieren und importieren dieselben Spalten (die Wettkampf-Spalten sind mit V202608242110
 * gefallen).
 *
 * Welches Profil eine einzelne Partie stoppt — bei RaceClocker das Rennen, bei interner Zeitnahme
 * der Zeitnahmetyp — steht dagegen nicht hier, sondern im Zeitnahmeprofil-Baum
 * (`TimingProfileService`), der über vier Ebenen vererbt.
 */
data class EventTimingConfigDto(
    val timingSystem: TimingSystem?,
    val startlistConfig: UUID?,
    val resultImportConfig: UUID?,
    val autoPull: Boolean,
    val intervalActiveSeconds: Int,
    val intervalUpcomingSeconds: Int,
    val watchBeforeMinutes: Int,
    val watchAfterMinutes: Int,
    /**
     * Genauigkeit der veroeffentlichten offiziellen Zeiten der internen Zeitnahme (sichtbar bei
     * System INTERN). Nie null: die Spalte hat eine Vorgabe (ZEHNTEL, Migration V202608211450).
     */
    val timingPrecision: TimingPrecision,
    /**
     * Erfassungstöne der Posten (interne Zeitnahme): der Bestätigungston beim Erfassen am
     * FINISH- bzw. SPLIT-Posten. Anders als in [TimingSettingsDto] NICHT aufgelöst: null heisst
     * hier "eingebauter Standard" - das Formular muss wissen, ob ein eigener Wert gesetzt ist,
     * um "Standard wiederherstellen" anbieten zu können.
     */
    val finishTone: CaptureTone?,
    val splitTone: CaptureTone?,
    /**
     * Fehlstart-FOLGE der Startposten (kurz-kurz-lang und Verwandtes, Zeitpunkte vorwärts ab der
     * Auslösung). Wie die Erfassungstöne unaufgelöst: null heisst "eingebaute Standardfolge"
     * ([TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE]) - das Formular braucht den Unterschied
     * für "Standard wiederherstellen"; aufgelöst liefert erst GET /timing/settings. Eine noch als
     * Einzelton gespeicherte Spalte kommt hier bereits als einelementige Folge an (siehe
     * `JSONB?.toToneSequence()`).
     */
    val falseStartTone: List<ToneStep>?,
    /**
     * Ob das Erfassungs-Board am START-Posten den manuellen Stempel zeigt. Nie null: die Spalte
     * hat eine Vorgabe (`false`, Migration V202608242000) - der Stempel ist standardmäßig
     * verborgen, weil er sonst als zweite grüne „Start"-Fläche direkt unter dem Sequenz-Knopf
     * stünde.
     */
    val showManualCapture: Boolean,
    /**
     * Anzeige-Block des Startbildschirms (was gezeigt wird, wie groß, wie viele folgende Boote).
     * Wie die Töne unaufgelöst: null heißt „eingebaute Vorgaben"
     * ([TimingStartDisplayLimits.DEFAULT]) - das Formular braucht den Unterschied für „Standard
     * wiederherstellen"; aufgelöst liefert erst GET /timing/settings.
     */
    val startDisplay: StartDisplaySettings?,
)
