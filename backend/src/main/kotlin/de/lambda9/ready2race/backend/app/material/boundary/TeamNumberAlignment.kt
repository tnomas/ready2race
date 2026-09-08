package de.lambda9.ready2race.backend.app.material.boundary

import java.util.UUID
import kotlin.random.Random

/**
 * Verteilt Startnummern innerhalb EINES Wettkampfs bei der Fixierung, wenn `alignMaterialNumbers`
 * gesetzt ist (Spec Abschnitt 8): Mietteams sollen möglichst die Bootsnummer ihres zugeteilten
 * Bootsanbieters als Startnummer bekommen, damit Startnummer und Rumpfnummer übereinstimmen.
 *
 * Reine Funktion ohne DB-Zugriff, damit der komplette Algorithmus per JUnit ohne Testcontainer
 * geprüft werden kann - die DB-nahen Teile (welche Meldung welche Bootsnummern hat, welche
 * Nummern schon vergeben sind) liefert der Aufrufer.
 */
object TeamNumberAlignment {

    /**
     * @param rented Meldungen mit bestätigtem Mietboot -> die Bootsnummern (Rumpfnummern) der
     *   aktiven Stücke des zugeteilten Anbieters/Typs. Verschiedene Anbieter/Typen können
     *   unterschiedliche Listen haben - ein Mietteam darf nur eine Nummer aus SEINER eigenen
     *   Liste bekommen.
     * @param own Meldungen ohne Mietboot.
     * @param taken Bereits vergebene Nummern in diesem Wettkampf (bei `keepNumbers`).
     * @param random Zufallsquelle - für Tests mit festem Seed reproduzierbar.
     * @return Meldung -> zugeteilte Startnummer, für jede übergebene Meldung genau ein Eintrag.
     */
    fun align(rented: Map<UUID, List<Int>>, own: List<UUID>, taken: Set<Int>, random: Random): Map<UUID, Int> {
        val result = mutableMapOf<UUID, Int>()

        // Bootsnummern-Pool: Vereinigung aller Kandidatenlisten - eigene Boote meiden auch die
        // Nummern, die ein anderes Mietteam am Ende NICHT bekommt (Spec: "sind reserviert").
        val allBoatNumbers = rented.values.flatten().toSet()
        val usedNumbers = mutableSetOf<Int>()
        val freeBoatNumbers = (allBoatNumbers - taken).toMutableSet()

        // Schritt 1: Mietteams zufällig auf eine freie Nummer aus der EIGENEN Kandidatenliste.
        val overflow = mutableListOf<UUID>()
        rented.keys.shuffled(random).forEach { team ->
            val candidates = rented.getValue(team).filter { it in freeBoatNumbers }
            if (candidates.isEmpty()) {
                overflow += team
            } else {
                val chosen = candidates.random(random)
                freeBoatNumbers -= chosen
                usedNumbers += chosen
                result[team] = chosen
            }
        }

        // Schritt 2: eigene Boote von 1 aufwärts, keine Bootsnummer und noch nicht vergeben.
        var next = 1
        own.shuffled(random).forEach { team ->
            while (next in taken || next in allBoatNumbers || next in usedNumbers) next++
            result[team] = next
            usedNumbers += next
            next++
        }

        // Schritt 3: überzählige Mietteams oberhalb der höchsten Bootsnummer.
        var overflowNext = (allBoatNumbers.maxOrNull() ?: 0) + 1
        overflow.shuffled(random).forEach { team ->
            while (overflowNext in taken || overflowNext in usedNumbers) overflowNext++
            result[team] = overflowNext
            usedNumbers += overflowNext
            overflowNext++
        }

        return result
    }
}
