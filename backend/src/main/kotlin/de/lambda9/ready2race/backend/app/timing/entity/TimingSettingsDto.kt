package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision

/**
 * Die Leitstand-/Board-Sicht auf die Zeitnahme-Einstellungen der Veranstaltung, in EINEM Fetch:
 * der Schalter „Automatische Übernahme" und die Genauigkeit der offiziellen Zeiten.
 *
 * Ein gemeinsamer Endpunkt statt zweier kleiner (der frühere GET /timing/autoApply ist hierin
 * aufgegangen): Leitstand und Boards brauchen beide Werte ohnehin zusammen beim Öffnen, und die
 * Boards laufen auch mit Geräte-Token ohne Sitzung -- ein zweiter Token-lesbarer Mini-Endpunkt
 * wäre nur ein zweiter Auth-Zweig für denselben Datensatz. Geschrieben wird weiterhin getrennt:
 * der Schalter über PUT /timing/autoApply, die Genauigkeit über die Zeitnahme-Einstellungen der
 * Veranstaltung (EventTimingConfigRequest).
 */
data class TimingSettingsDto(
    val autoApply: Boolean,
    val precision: TimingPrecision,
    /**
     * Erfassungstöne der Posten (FINISH/SPLIT), bereits aufgelöst: unkonfiguriert liefert der
     * Server den eingebauten Standard ([TimingToneLimits.DEFAULT_CAPTURE_TONE]) - die Boards
     * spielen einfach, was hier steht. Gepflegt über die Zeitnahme-Einstellungen der
     * Veranstaltung (EventTimingConfigRequest), live gepusht via settingsChanged.
     */
    val finishTone: CaptureTone,
    val splitTone: CaptureTone,
    /**
     * Fehlstart-Ton der Startposten, ebenfalls aufgelöst (unkonfiguriert =
     * [TimingToneLimits.DEFAULT_FALSE_START_TONE]). Start-Board und Startbildschirm spielen ihn
     * bei Versuchs-Rücknahme oder Abbruch einer laufenden Sequenz der gerade geführten Partie.
     */
    val falseStartTone: CaptureTone,
)
