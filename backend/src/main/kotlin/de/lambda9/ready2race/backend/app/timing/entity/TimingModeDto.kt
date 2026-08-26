package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * Ein Zeitnahmetyp der Veranstaltung - die Vorlage dafür, wie ein Lauf gestartet wird.
 *
 * Wie gemessen wird, steht nicht hier: Ob es Zwischenzeiten gibt, sagen die SPLIT-Posten am
 * Wettkampf (`competition_timing_station`), nicht der Typ.
 */
data class TimingModeDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    val startGrouping: TimingStartGrouping,
    /** Gesetzt: Starts folgen automatisch in diesem Abstand; null: jeder Start von Hand. */
    val intervalSeconds: Int?,
    /** Vorlauf/Countdown vor dem (ersten) Start, Anschluss an die lead_in-Mechanik der Sequenzen. */
    val leadInSeconds: Int,
    /**
     * Darf der Startposten für Läufe dieses Typs einen Fehlstart auslösen (Sequenz abbrechen +
     * Versuch zurücknehmen + rotes Signal an die Anzeigen)?
     *
     * Steuert die Sichtbarkeit des Knopfes am Board UND die Route selbst - ein abgeschalteter Typ
     * lehnt den Fehlstart ab, nicht nur die Oberfläche. Der Fall dahinter ist der Timetrial im
     * Rudersport: dort wird ein Fehlstart mit Strafzeit geahndet, nicht mit Rückruf.
     */
    val falseStartEnabled: Boolean,
    /**
     * Der gewählte Ton-Satz ([TimingToneSetDto]) oder null - dann erbt der Typ den Vorgabesatz
     * der Veranstaltung.
     */
    val toneSet: UUID?,
    /**
     * Startet die App Läufe dieses Typs überhaupt? Nicht jeder Lauf wird von der App gestartet -
     * ein Lauf mit Startrichter am Steg hat kein Countdown-Fenster, und ein Board, das ihm eines
     * hinstellt, lädt zum falschen Griff ein. Vorgabe `true`: das bisherige Verhalten.
     */
    val startSequenceEnabled: Boolean,
    /** Erste Tastenreihe des Zielpostens, in Positionsreihenfolge; siehe [TimingBoatKeys]. */
    val boatKeysPrimary: String,
    /** Zweite, optionale Tastenreihe; null = es gibt keine. */
    val boatKeysSecondary: String?,
    /**
     * Die vier Töne, die ein Lauf dieses Typs wirklich macht - aufgelöst über
     * [de.lambda9.ready2race.backend.app.timing.boundary.TimingToneResolveLogic]: der eigene Satz,
     * sonst der Vorgabesatz der Veranstaltung, sonst der eingebaute Standard.
     *
     * Der Gegenpol zu [toneSet]: dort steht die WAHL (und null heißt „erbt"), hier steht das
     * ERGEBNIS. Ein Board spielt, was hier steht, und baut die Vererbungskette nicht nach.
     * Geschrieben werden die Töne am Satz, nicht am Typ - deshalb führt [TimingModeRequest] sie
     * nicht.
     */
    val resolvedToneSet: ResolvedToneSet,
)
