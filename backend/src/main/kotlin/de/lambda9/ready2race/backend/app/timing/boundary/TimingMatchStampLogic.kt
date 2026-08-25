package de.lambda9.ready2race.backend.app.timing.boundary

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId

/**
 * Die Entscheidungen, mit denen die interne Zeitnahme die Laufzustände stempelt - bewusst ohne
 * Datenbankbezug, damit die Regeln ohne laufende Umgebung prüfbar sind (dasselbe Muster wie
 * `RaceClockerPollLogic` für den Abrufpfad, dessen Semantik hier gespiegelt wird):
 *
 * 1. Eine eingerichtete oder gestartete Startsequenz ruft die Partie an den Start
 *    (`activated_at`, nur wenn noch nicht gesetzt - die Zeitnahme rückt keine bestehende
 *    Aktivierung vor). Diese Entscheidung ist trivial und lebt direkt im Service.
 * 2. Die erste zugeordnete, aktive Startmarke ist der Ist-Start (`started_at`) - mit dem
 *    Zeitstempel der Marke, siehe [startStampFor].
 * 3. Die Rücknahme des Versuchs nimmt den Ist-Start zurück - aber NUR den eigenen, siehe
 *    [startRetracted].
 * 4. `finished_at` wird von der Zeitnahme niemals gesetzt oder zurückgenommen - das Beenden
 *    bleibt beim Schiedsrichter, an `finished_at` hängen Aktivierungskette und
 *    Folgerunden-Automatik. Diese Datei bietet dafür bewusst keine Funktion an.
 */
object TimingMatchStampLogic {

    /**
     * Der Marken-Zeitstempel (Epoch-Millis, wie ihn das erfassende Gerät bzw. der Sequenz-Plan
     * liefert) als `LocalDateTime` in der Zeitzone der Anwendung - die EINE Umrechnung für
     * Stempeln UND Wiedererkennen. Beides muss durch dieselbe Funktion laufen, denn die
     * Rücknahme ([startRetracted]) erkennt den eigenen Stempel am exakten Wert.
     */
    fun stampFor(timestampMillis: Long): LocalDateTime =
        Instant.ofEpochMilli(timestampMillis).atZone(ZoneId.systemDefault()).toLocalDateTime()

    /**
     * Der Ist-Start, den die vorhandenen Startmarken einer Partie hergeben - null, wenn sie schon
     * einen hat oder keine Marke da ist.
     *
     * [existingStartedAt] gewinnt immer: Ein einmal gesetzter Ist-Start wird NIE verschoben, auch
     * nicht durch eine frühere, nachträglich zugeordnete Marke - insbesondere bleibt ein vom
     * Schiedsrichter von Hand gestempelter Start unangetastet, wenn die Zeitnahme denselben Lauf
     * später auch noch misst (dieselbe Regel wie beim gemessenen Start des Abrufpfads).
     *
     * Von mehreren Startmarken zählt die FRÜHESTE: Bei einem Intervallstart ist das erste
     * losfahrende Boot der Moment, ab dem die Partie läuft - die späteren Boote starten in eine
     * bereits laufende Partie hinein.
     */
    fun startStampFor(
        existingStartedAt: LocalDateTime?,
        startMarkMillis: List<Long>,
    ): LocalDateTime? = when {
        existingStartedAt != null -> null
        else -> startMarkMillis.minOrNull()?.let { stampFor(it) }
    }

    /**
     * Ob die Rücknahme des Versuchs den Ist-Start der Partie mitnehmen darf.
     *
     * Provenienz über den Wert selbst: Der Ist-Start stammt genau dann von der Zeitnahme, wenn er
     * exakt dem umgerechneten Zeitstempel einer Startmarke dieser Partie entspricht - denn nur
     * [startStampFor] schreibt Markenzeiten, alle anderen Stempler (Schiedsrichter-Dashboard,
     * Regattabüro, RaceClocker-Abruf) schreiben `LocalDateTime.now()` bzw. eine Feed-Uhrzeit, die
     * nie auf die Milliseconde mit einer internen Marke zusammenfällt. Der Vergleich ist damit
     * neustartfest und braucht weder eine neue Spalte noch `updated_by` (das die nächste fremde
     * Änderung ohnehin überschriebe).
     *
     * [knownStartMarkMillis] sind ALLE Startmarken der Partie, unabhängig vom Status: Auch eine
     * einzeln zurückgenommene und ersetzte Startmarke kann den stehenden Stempel geliefert haben
     * (die Einzelkorrektur verschiebt ihn ausdrücklich nicht), und ihr Stempel gehört bei der
     * Versuchs-Rücknahme trotzdem zurückgenommen.
     *
     * Ohne Ist-Start gibt es nichts zurückzunehmen; ein fremder Stempel (kein Marken-Treffer)
     * bleibt stehen. `activated_at` geht diese Entscheidung nichts an - die Partie bleibt an den
     * Start gerufen und fällt zurück auf "In Vorbereitung" (dieselbe Regel wie beim Rückzug im
     * Abrufpfad).
     */
    fun startRetracted(
        existingStartedAt: LocalDateTime?,
        knownStartMarkMillis: List<Long>,
    ): Boolean =
        existingStartedAt != null &&
            knownStartMarkMillis.any { stampFor(it) == existingStartedAt }
}
