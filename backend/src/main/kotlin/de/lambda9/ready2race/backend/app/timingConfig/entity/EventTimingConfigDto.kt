package de.lambda9.ready2race.backend.app.timingConfig.entity

import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.StartDisplaySettings
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import java.util.UUID

/**
 * Die Zeitnahme-Voreinstellung einer Veranstaltung: gilt fuer alle Wettkaempfe ohne eigene Werte
 * (siehe [TimingConfigDto] - dort sind die Wettkampf-Spalten der Override). System, Startlisten-
 * Export und Rennergebnisse-Import werden von allen Wettkaempfen einer Regatta geteilt.
 *
 * Die konkrete Rennen-Zuordnung (Zeitfahren-/Laeufe-Rennen) steht dagegen NICHT mehr hier: sie wird
 * seit dem 11.08.2026 ausschliesslich pro Rennen am Wettkampf gesetzt (RaceClockerRaceAssignments),
 * ein Veranstaltungs-Default dafuer entfaellt.
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
    /**
     * Die Wettkaempfe, die dieser Voreinstellung nicht folgen. Ohne sie waere die Voreinstellung eine
     * Einstellung, deren Reichweite man nicht sieht: wer hier eine Adresse aendert, muss wissen,
     * welche Wettkaempfe davon unberuehrt bleiben.
     */
    val deviatingCompetitions: List<CompetitionTimingDeviationDto>,
)
