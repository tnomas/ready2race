package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.timing.control.toCaptureTone
import de.lambda9.ready2race.backend.app.timing.control.toTonePlan
import de.lambda9.ready2race.backend.app.timing.control.toToneSequence
import de.lambda9.ready2race.backend.app.timing.entity.ResolvedToneSet
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingToneSetRecord
import java.util.UUID

/**
 * Welche vier Töne ein Zeitnahmetyp wirklich hört - reine Logik ohne Datenbank und ohne Ktor,
 * nach dem Muster von [TimingSplitLogic] und [TimingStartOrderLogic].
 *
 * Die Kette je Ton: **Satz des Typs → Vorgabesatz der Veranstaltung → eingebauter Standard.**
 * Die Auswahl des Satzes selbst macht [TimingToneSetLogic.effectiveSet]; hier kommt nur noch die
 * letzte Stufe dazu, damit die Boards spielen können, was ankommt, statt eine Vererbungskette
 * nachzubauen.
 *
 * **Die eine Stelle, die man leicht falsch herum baut:** Ist ein Ton IM GEWÄHLTEN SATZ `null`,
 * fällt er auf den eingebauten Standard - NICHT auf den Vorgabesatz. Ein gewählter Satz ist eine
 * Aussage; ein leeres Feld darin heißt „Standard", nicht „nimm den von woanders". Anders herum
 * gäbe es keinen Weg mehr, einen Satz zu bauen, der bewusst nur EINEN Ton abweichen lässt und
 * sonst der eingebaute ist - jedes leere Feld zöge stillschweigend den Vorgabesatz nach, und wer
 * den Vorgabesatz ändert, veränderte damit auch jeden Satz, der ihn nie gemeint hat. Genau
 * deshalb wird der Satz EINMAL ausgewählt und danach nicht mehr verlassen.
 */
object TimingToneResolveLogic {

    /**
     * Die Töne eines Zeitnahmetyps mit der Wahl [toneSet], vollständig aufgelöst.
     *
     * [toneSets] sind die Sätze der Veranstaltung - eine Abfrage je Aufruf des Dienstes, keine je
     * Partie.
     */
    fun resolve(toneSets: List<TimingToneSetRecord>, toneSet: UUID?): ResolvedToneSet {
        val set = TimingToneSetLogic.effectiveSet(toneSets, toneSet)
        return ResolvedToneSet(
            // Bleibt nullbar: der eingebaute Countdown lebt in den Boards, siehe ResolvedToneSet.
            sequenceTonePlan = set?.sequenceTonePlan.toTonePlan(),
            splitTone = set?.splitTone.toCaptureTone() ?: TimingToneLimits.DEFAULT_CAPTURE_TONE,
            // Ein noch als Einzelton (jsonb-Objekt) gespeicherter Wert wird hier zur
            // einelementigen Folge - die Boards kennen nur noch Folgen.
            falseStartTone = set?.falseStartTone.toToneSequence()
                ?: TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            finishTone = set?.finishTone.toCaptureTone() ?: TimingToneLimits.DEFAULT_CAPTURE_TONE,
            tonePerBoat = set?.tonePerBoat ?: true,
        )
    }

    /**
     * Der aufgelöste Vorgabesatz der Veranstaltung - der Rückfall für alles, was zu keinem
     * Zeitnahmetyp gehört.
     *
     * Der Fall dahinter ist der große Erfassungsknopf: Er bankt eine Zeit OHNE Zuordnung, und
     * eine Zeit ohne Zuordnung gehört zu keiner Partie und damit zu keinem Typ. Bliebe dieser
     * Rückfall aus, verstummte genau der Griff, der im Ernstfall zählt - und Stille an der
     * Ziellinie liest sich wie ein Fehler.
     *
     * Es ist derselbe Weg wie „Typ ohne eigene Wahl": nichts gewählt heißt Vorgabesatz.
     */
    fun resolveDefault(toneSets: List<TimingToneSetRecord>): ResolvedToneSet = resolve(toneSets, null)
}
