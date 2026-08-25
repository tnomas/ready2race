package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime

/**
 * Der Zustand einer Partie aus Sicht der Zeitnahme-Posten: wo auf dem Weg vom Aufruf bis ins Ziel
 * steht dieser Lauf? Nicht gespeichert, sondern abgeleitet - aus `finished_at`, den aktiven
 * Startsequenzen und den zugeordneten Marken. Die Startliste des Startpostens und die
 * Zielerwartung des Zielpostens hängen an genau dieser Einordnung.
 *
 * Bewusst getrennt von [TimingMatchPhase]: die Phase beantwortet "ist dieses Team gerade
 * erwartet?" (Aufruf durch den Schiedsrichter, `activated_at`), der Progress beantwortet "was hat
 * die Zeitnahme mit diesem Lauf schon getan?". Ein Lauf kann aktiviert und trotzdem noch OPEN
 * sein - aufgerufen, aber noch keine Sekunde gemessen.
 */
enum class TimingMatchProgress {
    /** Noch nichts passiert - weder Sequenz noch Start. */
    OPEN,

    /** Eine Startsequenz (ARMED/RUNNING) enthält Teams dieses Laufs - der Start läuft gerade. */
    STARTING,

    /** Mindestens ein Team ist unterwegs (zugeordnete Startmarke), keine Sequenz mehr aktiv. */
    STARTED,

    /** Der Lauf ist durch: `finished_at` gesetzt, oder alle gestarteten Teams haben ihr Ziel. */
    FINISHED,

    ;

    companion object {
        /**
         * Rangfolge der Ableitung: das persistierte Ende schlägt alles (die ausdrückliche
         * Entscheidung eines Menschen), dann die laufende Sequenz (auch wenn erste Boote schon
         * weg sind - für den Posten zählt, dass der Startvorgang noch feuert), dann der Start.
         * [allTeamsFinished] zählt nur zusammen mit [anyTeamStarted]: "alle im Ziel" ist ohne
         * einen einzigen Start eine leere Aussage über null Marken.
         */
        fun of(
            finishedAt: LocalDateTime?,
            hasActiveSequence: Boolean,
            anyTeamStarted: Boolean,
            allTeamsFinished: Boolean,
        ): TimingMatchProgress = when {
            finishedAt != null -> FINISHED
            hasActiveSequence -> STARTING
            anyTeamStarted && allTeamsFinished -> FINISHED
            anyTeamStarted -> STARTED
            else -> OPEN
        }
    }
}
