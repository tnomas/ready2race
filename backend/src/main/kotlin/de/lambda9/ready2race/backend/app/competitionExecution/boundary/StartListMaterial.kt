package de.lambda9.ready2race.backend.app.competitionExecution.boundary

import de.lambda9.ready2race.backend.app.competitionExecution.entity.CompetitionMatchData

/**
 * Ob eine Startliste (PDF) die Boot-Spalte überhaupt braucht (Materialvermietung, Task 6.1):
 * eine echte Abweichung von der Startnummer ist immer der Rede wert, unabhängig vom Wunsch
 * der Anfrage. [forced] (Query `showMaterial`) zeigt die Spalte zusätzlich auch ohne jede
 * Abweichung — die CSV zeigt sie dagegen immer (siehe `buildCsv`), dort entscheidet nur noch
 * [materialCell] je Zeile.
 */
fun startListShowsMaterial(
    teams: List<CompetitionMatchData.CompetitionMatchTeam>,
    forced: Boolean,
): Boolean = forced || teams.any { it.material?.deviatesFromStartNumber == true }

/**
 * Der Zellinhalt der Boot-Spalte für EIN Team einer Startliste. Leer ohne bestätigte
 * Boots-Anfrage und ohne [forced]; bei einer echten Abweichung von der Startnummer immer das
 * Label (unabhängig von [forced] - genau das ist die Abweichung, auf die die Spalte
 * hinweisen soll); mit [forced] zusätzlich das Label der Regelfälle bzw. "eigenes Boot" ohne
 * bestätigte Anfrage.
 */
fun materialCell(
    team: CompetitionMatchData.CompetitionMatchTeam,
    forced: Boolean,
): String {
    val material = team.material
    return when {
        material?.deviatesFromStartNumber == true -> material.label
        !forced -> ""
        material != null -> material.label
        else -> "eigenes Boot"
    }
}

/**
 * Die Boot-Angabe eines Teams für die PDF-Startliste: einmal je Team (nicht je Teilnehmerzeile),
 * mit derselben Auswahl wie [materialCell] und einer sichtbaren Markierung, wenn die Bootsnummer
 * von der Startnummer im Lauf abweicht. `null`, wenn für dieses Team nichts zu zeigen ist.
 */
fun materialLine(
    team: CompetitionMatchData.CompetitionMatchTeam,
    forced: Boolean,
): String? {
    val cell = materialCell(team, forced).ifEmpty { return null }
    return if (team.material?.deviatesFromStartNumber == true) "$cell ($MATERIAL_DEVIATES_LABEL)" else cell
}

/** Zweisprachig wie die übrigen Beschriftungen der Startliste. */
const val MATERIAL_DEVIATES_LABEL = "abweichend / differs"
