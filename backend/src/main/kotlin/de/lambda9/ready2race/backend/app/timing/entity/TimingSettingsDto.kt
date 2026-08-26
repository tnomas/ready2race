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
     * Fehlstart-FOLGE der Startposten, ebenfalls aufgelöst (unkonfiguriert =
     * [TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE]). Start-Board und Startbildschirm spielen
     * sie GANZ - Ton für Ton mit den Zeitpunkten der Folge - bei Versuchs-Rücknahme oder Abbruch
     * einer laufenden Sequenz der gerade geführten Partie. Nie leer: ein noch als Einzelton
     * gespeicherter Wert kommt als einelementige Folge an.
     */
    val falseStartTone: List<ToneStep>,
    /**
     * Ob das Erfassungs-Board am START-Posten den manuellen Stempel (CaptureButton) zeigt.
     * Vorgabe `false`: Am Startposten stünden sonst zwei grüne Flächen untereinander - der große
     * Sequenz-Startknopf und darunter der Stempel -, beide grün, beide „Start". Am Wasser ist das
     * eine Verwechslungsfalle, und ein versehentlicher Stempel setzt eine Startmarke, die niemand
     * bestellt hat. Wer spontan ohne Sequenz startet, schaltet ihn in den Zeitnahme-Einstellungen
     * der Veranstaltung ein; die Boards folgen live (settingsChanged).
     */
    val showManualCapture: Boolean,
    /**
     * Was der Startbildschirm zeigt und wie groß - bereits AUFGELÖST wie die Töne: unkonfiguriert
     * liefert der Server die eingebauten Vorgaben ([TimingStartDisplayLimits.DEFAULT]), die
     * Anzeige nimmt einfach, was hier steht, und kennt kein „nicht gesetzt". Gepflegt über die
     * Zeitnahme-Einstellungen der Veranstaltung (EventTimingConfigRequest).
     */
    val startDisplay: StartDisplaySettings,
    /**
     * Der aufgelöste VORGABESATZ der Veranstaltung - der Rückfall für alles, was zu keiner Partie
     * gehört.
     *
     * Seit dem 26.08.2026 reisen die Töne mit der Partie (`TimingMatchDto.timingMode`), weil sie
     * zum Zeitnahmetyp gehören und ein Zeitfahren nicht klingen muss wie ein Massenstart. Genau
     * ein Griff hat aber keine Partie: der große Erfassungsknopf, der eine Zeit OHNE Zuordnung
     * bankt. Ohne diesen Rückfall bliebe er stumm - und Stille an der Ziellinie liest sich wie
     * ein Fehler, nicht wie eine Einstellung.
     *
     * Deshalb steht er hier und nicht bei den Partien: Er gilt auch dann, wenn die Startliste
     * leer ist, der Posten gar keine Partie führt oder die Veranstaltung keine Zeitnahmetypen
     * kennt. [finishTone], [splitTone] und [falseStartTone] daneben sind der Alt-Weg der
     * Veranstaltungs-Spalten; sie fallen, sobald das Frontend hier liest.
     */
    val defaultToneSet: ResolvedToneSet,
)
