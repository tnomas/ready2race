package de.lambda9.ready2race.backend.app.timing.entity

enum class SequenceState {
    ARMED,
    RUNNING,

    /**
     * Angehalten: die Sequenz läuft weiter, feuert aber nichts, bis sie fortgesetzt wird.
     *
     * Der Fall am Wasser ist die Kulanz-Entscheidung der Schiedsrichter - eine Athletin kommt
     * unverschuldet zu spät an den Start, also wird angehalten statt abgebrochen. Weil
     * serverseitig gegen die GEPLANTEN Zeitpunkte gefeuert wird (nicht gegen einen laufenden
     * Timer), ist die Pause kein angehaltener Wecker, sondern genau dieser Zustand plus die beim
     * Fortsetzen nachgeholte Verschiebung der Kette (`pause_shift_millis`).
     */
    PAUSED,
    DONE,
    ABORTED;

    /**
     * ARMED, RUNNING and PAUSED sequences occupy their station; DONE/ABORTED ones are history.
     *
     * PAUSED gehört ausdrücklich dazu: die Pause ist eine Unterbrechung, kein Ende - der Posten
     * bleibt belegt, die Sequenz bleibt die eine des Postens, und die Boards zeigen sie weiter.
     */
    val isActive: Boolean get() = this == ARMED || this == RUNNING || this == PAUSED

    companion object {
        /** Die Zustandsnamen für die Datenbank-Prädikate der Repos - eine Quelle statt drei Listen. */
        val activeNames: List<String> get() = entries.filter { it.isActive }.map { it.name }
    }
}
