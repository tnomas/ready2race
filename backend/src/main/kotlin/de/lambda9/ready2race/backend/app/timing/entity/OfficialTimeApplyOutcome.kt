package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Was ein Lauf der Echtzeit-Übernahme
 * ([de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService.recomputeAndApply])
 * nach draußen meldet.
 *
 * [officialTimes] ist der frische Stand aller berührten Teams - auch ohne Schreibvorgang, denn
 * Leitstand und Boards folgen jeder Mutation live (siehe Doku an `recomputeAndApply`).
 *
 * [resultsWritten] sagt dagegen, ob die Übernahme tatsächlich an `competition_match_team`
 * geschrieben oder geräumt hat. Die Unterscheidung trägt den `EventChangeMarker`-Bump für die
 * öffentlichen Anzeigen: nur ein echter Schreibvorgang entwertet deren Zwischenspeicher - ein
 * No-op (Idempotenz, Schalter aus, fremde/dirty Zeile) darf die Boards nicht wachtrommeln.
 * Der Bump selbst liegt beim Aufrufer, weil der Sequenz-Scheduler ihn erst nach seinem Commit
 * auslösen darf (FireResult-Muster), während HTTP-Wege sofort bumpen.
 */
data class OfficialTimeApplyOutcome(
    val officialTimes: List<OfficialTimeDto>,
    val resultsWritten: Boolean,
) {
    companion object {
        val empty = OfficialTimeApplyOutcome(emptyList(), false)
    }
}
