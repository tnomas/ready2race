package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.database.generated.tables.records.TimingToneSetRecord
import java.util.UUID

/**
 * Welcher Ton-Satz für einen Zeitnahmetyp gilt - reine Logik, ohne Datenbank, nach dem Muster von
 * [TimingStartOrderLogic] und [TimingSplitLogic].
 *
 * Zwei Ebenen, mehr sind es nicht: Der Typ hat einen eigenen Satz gewählt, oder er hat keinen
 * gewählt und erbt den Vorgabesatz der Veranstaltung. Eine dritte Ebene gibt es hier bewusst
 * nicht - die eingebauten Standardtöne stecken nicht in einem Satz, sondern in den `null`-Werten
 * der Ton-Felder selbst; sie einzusetzen ist die Aufgabe von [TimingToneResolveLogic], und genau
 * DESHALB liegt die Auswahl des Satzes eine Stufe darunter: Wer den Satz einmal gewählt hat,
 * verlässt ihn nicht mehr, und ein leeres Feld darin heißt „Standard" statt „Vorgabesatz".
 */
object TimingToneSetLogic {

    /**
     * Der Satz, den ein Zeitnahmetyp mit der Wahl [toneSet] wirklich hört, oder `null`, wenn die
     * Veranstaltung überhaupt keine Sätze hat (dann gelten die eingebauten Standardtöne).
     *
     * Zeigt [toneSet] auf einen Satz, den [toneSets] nicht kennt, gilt ebenfalls die Vorgabe: Das
     * ist derselbe Fall wie „nichts gewählt", und ein Board, das lieber die Vorgabe spielt als zu
     * schweigen, ist am Wasser das kleinere Übel.
     */
    fun effectiveSet(toneSets: List<TimingToneSetRecord>, toneSet: UUID?): TimingToneSetRecord? =
        toneSets.firstOrNull { it.id == toneSet } ?: toneSets.firstOrNull { it.isDefault == true }
}
