package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Ein benannter Satz aus den vier Tönen einer Zeitnahme („Laut fürs Wasser", „Leise für die
 * Halle") - die Vorlage, die sich beliebig viele Zeitnahmetypen teilen.
 *
 * Warum an der Veranstaltung und nicht am Typ: Man stellt einen Klang EINMAL ein, und dann soll er
 * für alle Läufe gelten, die gleich klingen sollen. Wer die Lautstärke aller Typen ändern will,
 * ändert einen Satz statt sieben Typen.
 *
 * Alle vier Ton-Felder sind hier UNAUFGELÖST: `null` heißt „eingebauter Standard", genau wie
 * bisher an Veranstaltung und Typ. Das Formular muss den Unterschied zwischen „Standard" und
 * „eigener Wert" sehen, sonst gäbe es kein „Standard wiederherstellen" mehr. Aufgelöst wird erst
 * dort, wo die Boards bedient werden.
 */
data class TimingToneSetDto(
    val id: UUID,
    val name: String,
    /**
     * Der Vorgabesatz der Veranstaltung: Zeitnahmetypen ohne eigene Wahl erben ihn. Genau einer je
     * Veranstaltung - erzwungen von einem partiellen Unique-Index, nicht von der Anwendungslogik.
     */
    val isDefault: Boolean,
    /** Tonplan der Startsequenz, rückwärts gezählt zum Start; null = eingebauter Standardplan. */
    val sequenceTonePlan: List<ToneStep>?,
    /** Bestätigungston am SPLIT-Posten; null = eingebauter Standardton. */
    val splitTone: CaptureTone?,
    /** Fehlstart-FOLGE, vorwärts gezählt ab der Auslösung; null = eingebaute Standardfolge. */
    val falseStartTone: List<ToneStep>?,
    /** Bestätigungston am FINISH-Posten; null = eingebauter Standardton. */
    val finishTone: CaptureTone?,
    /**
     * Unterscheidet der Erfassungston die Boote? Position 1 spielt den Zielton, die übrigen fünf
     * eine pentatonische Leiter darüber. Gehört zum Satz und nicht zur Veranstaltung: Es ist eine
     * Eigenschaft dieses Klangbildes.
     */
    val tonePerBoat: Boolean,
)

/**
 * Die Töne, die ein Board WIRKLICH spielt - das Ergebnis der Auflösung
 * ([de.lambda9.ready2race.backend.app.timing.boundary.TimingToneResolveLogic]) und damit das
 * Gegenstück zu [TimingToneSetDto]: dort steht, was jemand eingestellt hat, hier, was daraus
 * klingt.
 *
 * Warum aufgelöst über den Draht und nicht im Board: Ein Board soll spielen, was ankommt, und
 * keine Vererbungskette nachbauen. Die Kette („Satz des Typs → Vorgabesatz der Veranstaltung →
 * eingebauter Standard") gibt es genau einmal, im Backend, und sie ist einzeln getestet.
 *
 * Reist an zwei Stellen mit: an jeder Partie (`TimingMatchDto.timingMode.resolvedToneSet` - der
 * Posten spielt die Töne des Laufs, den er gerade führt) und als Vorgabesatz der Veranstaltung
 * (`TimingSettingsDto.defaultToneSet`) für alles, was zu keiner Partie gehört - der große
 * Erfassungsknopf bankt eine Zeit OHNE Zuordnung, und der muss klingen.
 */
data class ResolvedToneSet(
    /**
     * Der Startsequenz-Tonplan - als EINZIGER der vier weiterhin nullable, und das mit Absicht:
     * Sein eingebauter Standard ist der Countdown der Boards selbst (T−5…T−1 Tick, T−0 Startton;
     * `DEFAULT_START_TONE_PLAN` in `tonePlan.ts`), und den hat das Backend nie gekannt. Ihn hier
     * zu erfinden hieße, denselben Klang an zwei Stellen zu pflegen - null sagt schlicht
     * „unverändert wie immer".
     */
    val sequenceTonePlan: List<ToneStep>?,
    /** Bestätigungston am SPLIT-Posten, nie null. */
    val splitTone: CaptureTone,
    /** Fehlstart-FOLGE, nie null und nie leer. */
    val falseStartTone: List<ToneStep>,
    /** Bestätigungston am FINISH-Posten, nie null. */
    val finishTone: CaptureTone,
    /** Siehe [TimingToneSetDto.tonePerBoat]; ohne Satz gilt der Datenbank-Default (an). */
    val tonePerBoat: Boolean,
)
