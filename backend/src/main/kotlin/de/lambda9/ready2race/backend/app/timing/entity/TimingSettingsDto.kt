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
)
