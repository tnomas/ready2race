package de.lambda9.ready2race.backend.app.competitionExecution.entity

import de.lambda9.ready2race.backend.parsing.Parser

/**
 * Ein Boot mit dem Platz, den die Rundenlogik ihm gegeben hat.
 *
 * [matchName] und [matchWeighting] stehen nur, wenn die Runde je Partie gewertet wird
 * (`CompetitionSetupPlacesOption.PER_MATCH`): Dann ist [place] der Platz INNERHALB dieser Partie -
 * Finale A, B und C haben jeweils einen Ersten - und die Partie gehört zur Aussage dazu. Bei allen
 * anderen Wertungen gilt der Platz für die ganze Runde und beide Felder bleiben leer.
 */
data class TeamPlacement(
    val team: CompetitionMatchTeamWithRegistration,
    val place: Int,
    val matchName: String? = null,
    val matchWeighting: Int? = null,
) {
    /** Die Ergebniszeit des Bootes in Millisekunden; null ohne Zeit oder bei unlesbarer Zeit. */
    val timeMillis: Long?
        get() = team.timeString?.let { runCatching { Parser.timecode.parse(it) }.getOrNull()?.millis }

    companion object {
        /**
         * Die Reihenfolge der Platzierungen untereinander: Partien in Setup-Reihenfolge, innerhalb
         * der Partie nach Platz. Platzierungen ohne Partie stehen hinter allen Partien - das sind
         * in einem Wettkampf mit Wertung je Partie die Boote früherer Runden, deren Plätze das
         * Gesamtfeld zählen und numerisch hinter den Partie-internen liegen. Ohne Wertung je
         * Partie sind alle Partie-Anteile gleich, es entscheidet also allein der Platz.
         *
         * Bei gleichem Platz steht die schnellere Zeit vorn, Boote ohne Zeit dahinter; bleibt es
         * gleich, die kleinere Startnummer. So sehen zwei Ausdrucke derselben Wertung gleich aus,
         * statt der Zufallsreihenfolge der Datenbank zu folgen.
         */
        val ordering: Comparator<TeamPlacement> =
            compareBy(
                { it.matchWeighting ?: Int.MAX_VALUE },
                { it.place },
                { it.timeMillis ?: Long.MAX_VALUE },
                { it.team.startNumber },
            )
    }
}
