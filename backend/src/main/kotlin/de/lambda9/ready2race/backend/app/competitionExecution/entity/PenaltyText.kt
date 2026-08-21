package de.lambda9.ready2race.backend.app.competitionExecution.entity

/**
 * Die eine Textform einer Zeitstrafe für Blätter und Exporte: „Zeitstrafe +10 s (Frühstart)".
 *
 * Sie steht hier bei den Ergebnisdaten, weil Siegerehrungsbogen, Ergebnis-PDF und Platzierungs-CSV
 * sie alle brauchen und die Abhängigkeit sonst im Kreis liefe (awardCeremony hängt an
 * competitionExecution, nicht umgekehrt).
 *
 * Die Strafe hängt an den Sekunden, nicht an der Notiz: eine Notiz ohne Sekunden ist keine
 * Zeitstrafe und darf auf dem Blatt nicht wie eine aussehen. Die gefahrene Zeit enthält die
 * Strafe nach der Konvention dieses Systems bereits - der Text ist der Hinweis dazu, kein
 * Rechenposten.
 */
object PenaltyText {

    fun format(seconds: Int?, note: String?): String? = seconds?.let {
        val text = "Zeitstrafe +$it s"
        val reason = note?.takeIf { n -> n.isNotBlank() }
        if (reason == null) text else "$text ($reason)"
    }
}
