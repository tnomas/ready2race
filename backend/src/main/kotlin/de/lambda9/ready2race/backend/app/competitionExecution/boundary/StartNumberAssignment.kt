package de.lambda9.ready2race.backend.app.competitionExecution.boundary

/**
 * Startnummern eines Laufs aus den Meldungsnummern (ADR-0111, Entscheidung vom 14.11.2026).
 *
 * Gilt, wenn die Veranstaltung mit "Meldungsnummern nach Bootsnummern vergeben" fixiert wurde
 * (`event.team_numbers_as_start_numbers`): Die Rundenanlage - erste Runde wie Folgerunden - gibt
 * jedem Boot seine Meldungsnummer als Startnummer, damit "Boot 3 fährt in jedem Rennen als #3"
 * stimmt. Eine reine Funktion für beide Pfade von `createNewRound`, damit es genau eine Regel gibt.
 *
 * Die Meldungsnummer ist je Wettkampf nur durch die Fixierung eindeutig, die Datenbank erzwingt es
 * nicht; der Lauf dagegen hat einen eindeutigen Index auf (Lauf, Startnummer). Deshalb:
 * - Ein Team behält seine Meldungsnummer, wenn sie im Lauf noch frei ist (erste Nennung gewinnt,
 *   in der Reihenfolge von [teams] - also der Setzliste bzw. des Rangs).
 * - Teams ohne Meldungsnummer oder mit einer im Lauf schon vergebenen bekommen die nächste freie
 *   Nummer oberhalb der höchsten Meldungsnummer des Wettkampfs ([highestTeamNumberInCompetition])
 *   und oberhalb jeder im Lauf vergebenen Zahl - nie eine Zahl, die ein anderes Boot des
 *   Wettkampfs als Meldungsnummer trägt.
 */
object StartNumberAssignment {

    fun <K> fromTeamNumbers(
        teams: List<Pair<K, Int?>>,
        highestTeamNumberInCompetition: Int?,
    ): Map<K, Int> {
        val result = LinkedHashMap<K, Int>()
        val used = mutableSetOf<Int>()

        teams.forEach { (key, teamNumber) ->
            if (teamNumber != null && teamNumber > 0 && used.add(teamNumber)) {
                result[key] = teamNumber
            }
        }

        var next = maxOf(highestTeamNumberInCompetition ?: 0, used.maxOrNull() ?: 0)
        teams.forEach { (key, _) ->
            if (key !in result) {
                do next++ while (next in used)
                used += next
                result[key] = next
            }
        }

        return teams.associate { (key, _) -> key to result.getValue(key) }
    }
}
