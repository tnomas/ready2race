package de.lambda9.ready2race.backend.app.timing.boundary

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
 * Ein vergebener Platz (`place` / `places_calculated`) friert zusätzlich ein, sobald sich etwas
 * ändern würde: dieselbe Grenze, die auch die manuelle Übernahme ohne `force` respektiert.
 */
object TimingApplyLogic {

    /**
     * Ein Ergebnisstand, wie ihn die Rückschreibung an das Team schreibt bzw. am Team vorfindet:
     * Zeit (inkl. Strafe), Ausfallstatus (`failed_reason`, null = Zeitergebnis), und die beiden
     * Anzeige-Spalten der Strafe.
     */
    data class ResultState(
        val timeMillis: Long?,
        val statusText: String?,
        val penaltySeconds: Int?,
        val penaltyNote: String?,
    ) {
        /** Am Team steht gar nichts - weder Zeit noch Ausfall noch Strafe. */
        val isEmpty: Boolean
            get() = timeMillis == null && statusText == null && penaltySeconds == null && penaltyNote == null

        /** Ob dieser Stand überhaupt ein schreibbares Ergebnis trägt (Zeit oder Ausfallstatus). */
        val hasResult: Boolean
            get() = timeMillis != null || statusText != null

        companion object {
            val empty = ResultState(null, null, null, null)
        }
    }

    sealed interface Decision {
        /** Ziel-Stand an das Team schreiben (Timecode, failed, Strafspalten). */
        data object WriteResult : Decision

        /** Unser früheres Ergebnis vom Team entfernen - die Grundlage (Marke/Status) ist weg. */
        data object ClearResult : Decision

        /** Ziel-Stand und Team-Stand entsprechen dem letzten Schreiben - nichts zu tun. */
        data object SkipUnchanged : Decision

        /** Platz vergeben und es würde sich etwas ändern - eingefroren wie beim manuellen Weg. */
        data object SkipFrozen : Decision

        /** Am Team steht ein Ergebnis, das nicht (mehr) von uns stammt - nie überschreiben. */
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
     */
    fun fingerprint(state: ResultState): String = listOf(
        state.timeMillis?.toString(),
        state.statusText,
        state.penaltySeconds?.toString(),
        state.penaltyNote,
    ).joinToString("|") { field -> if (field == null) "_" else "${field.length}:$field" }

    /**
     * Die Anzeige-Spalte `penalty_seconds` aus den millisekundengenauen Leitstand-Strafen:
     * kaufmännisch gerundet, und nur bei einer tatsächlichen Strafe gesetzt - dieselbe Konvention,
     * die der manuelle Übernahme-Weg seit jeher verwendet.
     */
    fun penaltySecondsFor(penaltyMillis: Long?): Int? = penaltyMillis
        ?.takeIf { it > 0 }
        ?.let { ((it + 500) / 1000).toInt() }

    fun decide(
        autoApply: Boolean,
        target: ResultState,
        appliedFingerprint: String?,
        teamState: ResultState,
        teamHasPlace: Boolean,
    ): Decision {
        if (!autoApply) return Decision.SkipDisabled

        val targetFingerprint = if (target.hasResult) fingerprint(target) else null
        val teamFingerprint = if (teamState.isEmpty) null else fingerprint(teamState)

        // Alles im Gleichstand mit dem letzten Schreiben: nichts zu tun - unabhängig vom Platz,
        // denn ein Platz, der aus GENAU diesem Ergebnis berechnet wurde, ist kein Konflikt.
        if (targetFingerprint == appliedFingerprint && teamFingerprint == appliedFingerprint) {
            return if (appliedFingerprint == null) Decision.SkipNothingToWrite else Decision.SkipUnchanged
        }

        // Ab hier würde sich etwas ändern. Ein vergebener Platz friert ein (wie der manuelle Weg
        // ohne force), ein fremder Stand am Team ebenso - in beiden Fällen bleibt der Leitstand
        // sichtbar "dirty" statt still etwas zu überschreiben.
        if (teamHasPlace) return Decision.SkipFrozen
        if (teamFingerprint != appliedFingerprint) return Decision.SkipForeignResult

        return when {
            target.hasResult -> Decision.WriteResult
            appliedFingerprint != null -> Decision.ClearResult
            else -> Decision.SkipNothingToWrite
        }
    }

    /**
     * Ob die Zeile nach dieser Entscheidung als "weicht vom Lauf ab" gilt. Geschriebene und
     * unveränderte Stände sind sauber; eingefrorene und fremde Stände zeigen die Abweichung; bei
     * ausgeschaltetem Schalter genau dann, wenn das Wiedereinschalten etwas nachzuziehen hätte.
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

        Decision.SkipFrozen,
        Decision.SkipForeignResult,
        -> true

        Decision.SkipDisabled -> (if (hasTarget) targetFingerprint else null) != appliedFingerprint
    }
}
