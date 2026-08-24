package de.lambda9.ready2race.backend.app.timing.entity

import de.lambda9.ready2race.backend.validation.ValidationResult

/**
 * Was der Startbildschirm (die Athleten-Anzeige am Start) zeigt und wie groß er es zeigt.
 *
 * Bis zum 24.08.2026 war das fest verdrahtet: Startnummer und Verein, dazu eine gedoppelte
 * Positionsnummer, alles in einer Größe. Am Wasser trägt das nicht — ein 27-Zöller am Steg
 * verlangt andere Schriftgrößen als ein Tablet im Boot, und was ein Boot identifiziert, ist von
 * Regatta zu Regatta verschieden (die eine ruft Startnummern aus, die nächste Bootsnamen).
 * Deshalb entscheidet die Veranstaltung, nicht der Code.
 *
 * Gespeichert als EIN jsonb-Objekt an der Veranstaltung (`event.timing_start_display`, Migration
 * V202608242000); null in der Datenbank = [TimingStartDisplayLimits.DEFAULT]. Die Boards
 * bekommen den Block aufgelöst über GET /timing/settings und live über `settingsChanged` — eine
 * Umstellung im Formular wirkt sofort auf jeden Bildschirm, ohne dass jemand hinlaufen und neu
 * laden muss.
 *
 * Warum ein eigener Typ und keine neun Felder an [TimingSettingsDto]: Die Werte gehören zu EINEM
 * Bildschirm, werden gemeinsam gelesen und gemeinsam gesetzt, und die Gruppe wächst
 * erfahrungsgemäß weiter. Als eigener Typ bleibt sie an jeder Stelle (Datenbank, DTO, Request,
 * Formular) als ein Block erkennbar.
 *
 * Alle Felder sind NICHT nullbar: Anders als bei den Tönen gibt es hier keine „null heißt
 * Standard"-Semantik je Feld — die Rückfalllinie ist der ganze Block (Spalte null). Ein
 * halbgefülltes Objekt wäre eine dritte Bedeutung, die niemand braucht; das Formular schickt
 * ohnehin immer alle neun Werte.
 */
data class StartDisplaySettings(
    /**
     * Die laufende Nummer vor dem Boot (1., 2., 3. …). Vorgabe AUS, und das ist der Grund für
     * dieses Feld: Der Bildschirm zeigte die Position bisher doppelt — einmal als Nummer in der
     * Zeile und einmal durch die Reihenfolge der Liste selbst. Wer die Zählung braucht (etwa bei
     * Einzelstarts im Minutenabstand), schaltet sie ein.
     */
    val showPosition: Boolean,
    /** Startnummer des Boots — die übliche Kennung am Wasser, deshalb Vorgabe AN. */
    val showStartNumber: Boolean,
    /** Bootsname/Mannschaftsname. Vorgabe AN: er ist das, was der Sprecher ausruft. */
    val showTeamName: Boolean,
    /** Verein(e) des Boots. Vorgabe AN — bei Renngemeinschaften die ganze Vereinskette. */
    val showClubName: Boolean,
    /**
     * Die Namen der Ruderinnen und Ruderer. Vorgabe AUS: In einem Achter sind das acht Zeilen je
     * Boot — auf einem Startbildschirm, der mehrere Boote gleichzeitig führt, bleibt davon nichts
     * lesbar. Wer Einzel- oder Zweierrennen fährt, hat den Platz und schaltet sie ein.
     */
    val showAthleteNames: Boolean,
    /**
     * Größe der Uhrzeit im Kopf, als Faktor auf die eingebaute Größe (1.0 = unverändert).
     * Ein Faktor statt einer Punktgröße, weil die Anzeige ohnehin relativ zur Bildschirmbreite
     * rechnet — eine feste Punktzahl wäre auf jedem zweiten Gerät falsch.
     */
    val clockScale: Double,
    /** Größe des Countdowns, gleicher Faktor-Gedanke wie [clockScale]. */
    val countdownScale: Double,
    /** Größe der Bootsliste, gleicher Faktor-Gedanke wie [clockScale]. */
    val listScale: Double,
    /**
     * Wie viele der FOLGENDEN Boote unter dem gerade geführten gelistet werden. 0 ist ein
     * legitimer Wert und heißt „nur das aktuelle Boot" — die aufgeräumteste Anzeige für einen
     * kleinen Bildschirm.
     */
    val followingCount: Int,
)

/**
 * Grenzen und Vorgaben des Startbildschirms — EINE Stelle für Request-Validierung und
 * Einstellungs-Auflösung, genau wie [TimingToneLimits] es für die Töne ist; das Frontend prüft
 * dieselben Werte in seinem Formular.
 *
 * Die Grenzen stehen bewusst hier und nicht als Check-Constraint in der Datenbank: Sie sind
 * Bedien-Vernunft, keine Datenintegrität — zu klein ist unlesbar, zu groß passt nicht mehr auf
 * den Bildschirm. Ein Constraint über jsonb-Felder wäre zudem schwerfällig und könnte den Fehler
 * nicht feldweise benennen, was das Formular aber braucht.
 *
 * Skalen 0.5..3.0: Die Hälfte ist die Untergrenze, ab der die eingebaute Größe auf einem Tablet
 * noch aus Bootslänge lesbar bleibt; das Dreifache füllt einen 27-Zöller mit einer einzigen
 * Zeile — mehr ist keine Anzeige mehr, sondern ein Fehler.
 * Folgende Boote 0..20: 0 = „nur das aktuelle Boot"; jenseits von 20 Zeilen ist auf keinem
 * Bildschirm mehr etwas zu erkennen, und der Startbereich hat selten mehr Boote gleichzeitig
 * aufgereiht.
 */
object TimingStartDisplayLimits {

    const val SCALE_MIN = 0.5
    const val SCALE_MAX = 3.0
    const val FOLLOWING_MIN = 0
    const val FOLLOWING_MAX = 20

    /**
     * Die eingebauten Vorgaben — bewusst das, was der Bildschirm ohne jede Einstellung zeigen
     * soll, nicht das, was er bis zum 24.08.2026 zeigte: Startnummer, Bootsname und Verein an,
     * Position und Athletennamen aus, alles in eingebauter Größe, fünf folgende Boote.
     *
     * Da GET /timing/settings den Block AUFGELÖST ausliefert (unkonfiguriert = diese Werte),
     * erreicht die Entscheidung alle Boards; das Formular („Standard wiederherstellen")
     * vergleicht gegen dieselben Werte im Frontend (DEFAULT_START_DISPLAY, startDisplay.ts).
     */
    val DEFAULT = StartDisplaySettings(
        showPosition = false,
        showStartNumber = true,
        showTeamName = true,
        showClubName = true,
        showAthleteNames = false,
        clockScale = 1.0,
        countdownScale = 1.0,
        listScale = 1.0,
        followingCount = 5,
    )

    private fun validateScale(value: Double, field: String): ValidationResult =
        if (value.isNaN() || value < SCALE_MIN || value > SCALE_MAX) {
            ValidationResult.Invalid.Message { "$field must be between $SCALE_MIN and $SCALE_MAX" }
        } else {
            ValidationResult.Valid
        }

    /** null ist gültig und bedeutet „eingebaute Vorgaben" ([DEFAULT]) — wie bei den Tönen. */
    fun validate(settings: StartDisplaySettings?, field: String): ValidationResult =
        if (settings == null) {
            ValidationResult.Valid
        } else {
            ValidationResult.allOf(
                validateScale(settings.clockScale, "$field.clockScale"),
                validateScale(settings.countdownScale, "$field.countdownScale"),
                validateScale(settings.listScale, "$field.listScale"),
                if (settings.followingCount < FOLLOWING_MIN || settings.followingCount > FOLLOWING_MAX) {
                    ValidationResult.Invalid.Message {
                        "$field.followingCount must be between $FOLLOWING_MIN and $FOLLOWING_MAX"
                    }
                } else {
                    ValidationResult.Valid
                },
            )
        }
}
