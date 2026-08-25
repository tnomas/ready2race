package de.lambda9.ready2race.backend.app.timing.boundary

import java.util.UUID

/**
 * Die Rückschreibe-Entscheidung der Echtzeit-Übernahme als reine Logik: Soll der aktuelle
 * Leitstand-Stand eines Teams an `competition_match_team` geschrieben werden - und wenn nicht,
 * warum nicht?
 *
 * Kern ist der **Fingerabdruck** des zuletzt geschriebenen Ergebnisstands
 * (`timing_official_time.applied_fingerprint`). Er beantwortet zwei Fragen, die Zeitstempel nicht
 * sicher beantworten können:
 *
 * 1. *Unverändert?* Stimmen Ziel-Stand und Abdruck überein, wird nicht noch einmal geschrieben -
 *    die Rückschreibung läuft nach jeder Mutation und muss idempotent sein.
 * 2. *Noch unserer?* Weicht der Stand am Team vom Abdruck ab, hat jemand anderes eingegriffen
 *    (Schiedsrichter-Maske, Import, Handkorrektur). Ein fremdes Ergebnis wird nie stillschweigend
 *    überschrieben oder abgeräumt - der Leitstand zeigt die Abweichung stattdessen als `dirty`.
 *
 * Seit die Übernahme auch die Plätze des Laufs fortschreibt, gehören `place` und
 * `places_calculated` mit in den Abdruck: Eine eigene Platz-Fortschreibung ist damit nie eine
 * Fremdänderung, während ein von Hand oder vom Schiedsrichter gesetzter Platz den Stand fremd
 * macht - und fremde Stände friert die Übernahme ein, wie eh und je. Die frühere pauschale Regel
 * "Platz gesetzt = eingefroren" ist damit zu "FREMDER Platz = eingefroren" geworden; Bestandszeilen
 * werden per Migration (V202608211460) als "ohne eigenen Platz" fortgeschrieben, sodass ein vor dem
 * Umbau vom Schiedsrichter berechneter Platz weiterhin fremd bleibt.
 */
object TimingApplyLogic {

    /**
     * Ein Ergebnisstand, wie ihn die Rückschreibung an das Team schreibt bzw. am Team vorfindet:
     * Zeit (inkl. Strafe), Ausfallstatus (`failed_reason`, null = Zeitergebnis), die beiden
     * Anzeige-Spalten der Strafe - und der Platz im Lauf samt `places_calculated`-Kennzeichen.
     */
    data class ResultState(
        val timeMillis: Long?,
        val statusText: String?,
        val penaltySeconds: Int?,
        val penaltyNote: String?,
        val place: Int? = null,
        val placesCalculated: Boolean = false,
    ) {
        /** Am Team steht gar nichts - weder Zeit noch Ausfall noch Strafe noch Platz. */
        val isEmpty: Boolean
            get() = timeMillis == null && statusText == null && penaltySeconds == null &&
                penaltyNote == null && place == null && !placesCalculated

        /** Ob dieser Stand überhaupt ein schreibbares Ergebnis trägt (Zeit oder Ausfallstatus). */
        val hasResult: Boolean
            get() = timeMillis != null || statusText != null

        companion object {
            val empty = ResultState(null, null, null, null)
        }
    }

    sealed interface Decision {
        /** Ziel-Stand an das Team schreiben (Timecode, failed, Strafspalten, Platz). */
        data object WriteResult : Decision

        /** Unser früheres Ergebnis vom Team entfernen - die Grundlage (Marke/Status) ist weg. */
        data object ClearResult : Decision

        /** Ziel-Stand und Team-Stand entsprechen dem letzten Schreiben - nichts zu tun. */
        data object SkipUnchanged : Decision

        /**
         * Am Team steht ein Ergebnis oder Platz, das nicht (mehr) von uns stammt - nie
         * überschreiben. Deckt seit dem Platz-Umbau auch den früheren "eingefroren"-Fall ab: ein
         * fremder Platz macht den ganzen Stand fremd, weil der Platz Teil des Fingerabdrucks ist.
         */
        data object SkipForeignResult : Decision

        /** Es gibt nichts zu schreiben und es wurde nie etwas geschrieben. */
        data object SkipNothingToWrite : Decision

        /** Automatische Übernahme ist ausgeschaltet. */
        data object SkipDisabled : Decision
    }

    /**
     * Serialisiert einen Ergebnisstand feldgetreu. Längenpräfixe statt bloßer Trennzeichen, damit
     * ein Freitext-Grund niemals mit einem fehlenden Feld oder einem Feldwechsel verschmelzen kann
     * (ein Grund "-" ist etwas anderes als kein Grund).
     *
     * Die Feldreihenfolge ist Vertrag: Zeit | Status | Strafsekunden | Strafgrund | Platz |
     * places_calculated. Die Migration V202608211460 hängt an Bestandsabdrücke genau `|_|5:false`
     * an - ein alter Abdruck ohne Platzfelder wird so zum neuen Abdruck "ohne eigenen Platz".
     */
    fun fingerprint(state: ResultState): String = listOf(
        state.timeMillis?.toString(),
        state.statusText,
        state.penaltySeconds?.toString(),
        state.penaltyNote,
        state.place?.toString(),
        state.placesCalculated.toString(),
    ).joinToString("|") { field -> if (field == null) "_" else "${field.length}:$field" }

    /**
     * Liest einen Abdruck aus [fingerprint] zurück - das Gegenstück zu [fingerprint], gebraucht
     * von der Freeze-Grenze des manuellen Übernahme-Wegs: Sie muss wissen, welchen PLATZ der
     * eigene Abdruck festhält, um einen fremden Platz von einem eigenen zu unterscheiden, ohne
     * dass eine bloße Strafkorrektur von Hand gleich den ganzen Push einfriert.
     *
     * Gibt null zurück, wenn die Zeichenkette kein gültiger Abdruck ist (defensiv: ein
     * unlesbarer Abdruck gilt beim Aufrufer als fremd, nie als eigener).
     */
    fun parseFingerprint(fingerprint: String): ResultState? {
        val fields = mutableListOf<String?>()
        var i = 0
        while (true) {
            if (i >= fingerprint.length) return null
            if (fingerprint[i] == '_') {
                fields.add(null)
                i++
            } else {
                val colon = fingerprint.indexOf(':', i)
                if (colon < 0) return null
                val length = fingerprint.substring(i, colon).toIntOrNull() ?: return null
                val start = colon + 1
                val end = start + length
                if (end > fingerprint.length) return null
                fields.add(fingerprint.substring(start, end))
                i = end
            }
            if (i == fingerprint.length) break
            if (fingerprint[i] != '|') return null
            i++
        }
        if (fields.size != 6) return null
        return ResultState(
            timeMillis = fields[0]?.toLongOrNull(),
            statusText = fields[1],
            penaltySeconds = fields[2]?.toIntOrNull(),
            penaltyNote = fields[3],
            place = fields[4]?.toIntOrNull(),
            placesCalculated = fields[5] == "true",
        )
    }

    /**
     * Die Anzeige-Spalte `penalty_seconds` aus den millisekundengenauen Leitstand-Strafen:
     * kaufmännisch gerundet, und nur bei einer tatsächlichen Strafe gesetzt - dieselbe Konvention,
     * die der manuelle Übernahme-Weg seit jeher verwendet.
     */
    fun penaltySecondsFor(penaltyMillis: Long?): Int? = penaltyMillis
        ?.takeIf { it > 0 }
        ?.let { ((it + 500) / 1000).toInt() }

    /** Ein Boot, das bei der Platzableitung mitspielt: gewertet (nicht ausgefallen), mit Zeit. */
    data class PlaceCandidate(
        val teamId: UUID,
        val timeMillis: Long,
    )

    /**
     * Leitet die Plätze eines Laufs aus den Zeiten ab - der Kern von "mit der Zeit kommt der
     * Platz".
     *
     * Dieselbe Regel wie beim Ergebnis-Import (Platz = Reihenfolge der Zeiten im Lauf), aber mit
     * ehrlichen Gleichständen: Boote mit exakt derselben Zeit teilen sich den Platz, und dahinter
     * reißt die Lücke (1, 1, 3) - dieselbe Semantik, mit der `RatingCategoryRanking` und der
     * Siegerehrungsbogen gleiche Plätze schon immer lesen. Durch die Genauigkeits-Abschneidung
     * (TimingPrecisionLogic) sind gleiche Zeiten auf der veröffentlichten Stufe der Normalfall,
     * nicht die Ausnahme - zwei Boote 40 ms auseinander SIND bei Zehntel-Genauigkeit zeitgleich.
     *
     * Der Aufrufer übergibt nur die wertbaren Boote (nicht ausgefallen, mit Zeit); alle anderen
     * haben keinen Platz. Läuft ein Rennen noch, sind die Plätze bewusst vorläufig: Sie wandern,
     * wenn weitere Boote ankommen - genau wie auf der Live-Anzeige.
     */
    fun derivePlaces(candidates: List<PlaceCandidate>): Map<UUID, Int> {
        val sorted = candidates.sortedBy { it.timeMillis }
        val places = mutableMapOf<UUID, Int>()
        var lastTime: Long? = null
        var lastPlace = 0
        sorted.forEachIndexed { index, candidate ->
            val place = if (candidate.timeMillis == lastTime) lastPlace else index + 1
            places[candidate.teamId] = place
            lastTime = candidate.timeMillis
            lastPlace = place
        }
        return places
    }

    fun decide(
        autoApply: Boolean,
        target: ResultState,
        appliedFingerprint: String?,
        teamState: ResultState,
    ): Decision {
        if (!autoApply) return Decision.SkipDisabled

        val targetFingerprint = if (target.hasResult) fingerprint(target) else null
        val teamFingerprint = if (teamState.isEmpty) null else fingerprint(teamState)

        // Alles im Gleichstand mit dem letzten Schreiben: nichts zu tun. Der Platz steckt im
        // Abdruck - ein Platz, der aus GENAU diesem Ergebnis berechnet wurde, ist kein Konflikt.
        if (targetFingerprint == appliedFingerprint && teamFingerprint == appliedFingerprint) {
            return if (appliedFingerprint == null) Decision.SkipNothingToWrite else Decision.SkipUnchanged
        }

        // Ab hier würde sich etwas ändern. Ein fremder Stand am Team - auch ein bloß fremder
        // Platz - friert ein: Der Leitstand bleibt sichtbar "dirty", statt still zu überschreiben.
        if (teamFingerprint != appliedFingerprint) return Decision.SkipForeignResult

        return when {
            target.hasResult -> Decision.WriteResult
            appliedFingerprint != null -> Decision.ClearResult
            else -> Decision.SkipNothingToWrite
        }
    }

    /**
     * Ob die Zeile nach dieser Entscheidung als "weicht vom Lauf ab" gilt. Geschriebene und
     * unveränderte Stände sind sauber; fremde Stände zeigen die Abweichung; bei ausgeschaltetem
     * Schalter genau dann, wenn das Wiedereinschalten etwas nachzuziehen hätte.
     */
    fun dirtyAfter(
        decision: Decision,
        hasTarget: Boolean,
        targetFingerprint: String?,
        appliedFingerprint: String?,
    ): Boolean = when (decision) {
        Decision.WriteResult,
        Decision.ClearResult,
        Decision.SkipUnchanged,
        Decision.SkipNothingToWrite,
        -> false

        Decision.SkipForeignResult -> true

        Decision.SkipDisabled -> (if (hasTarget) targetFingerprint else null) != appliedFingerprint
    }
}
