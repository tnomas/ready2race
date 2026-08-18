package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/**
 * A reusable race type of an event ("Zeitfahren", "Finale Massenstart", "Show-Lauf").
 *
 * It answers the two questions a timekeeper would otherwise have to be told for every heat: is this
 * run measured at all ([timed]), and how is it started ([startMode] plus its defaults). Rounds of a
 * competition setup point at one of these, and the boards read the mode from the schedule instead of
 * asking the operator again.
 */
data class TimingRaceTypeDto(
    val id: UUID,
    val event: UUID,
    val name: String,
    /** false for runs that are held but not measured - the boards then offer no capture at all. */
    val timed: Boolean,
    val startMode: SequenceMode,
    /** Cadence preset for [SequenceMode.INTERVAL]; null means the operator still picks one. */
    val intervalMillis: Long?,
    /** Countdown preset; null means the sequence service keeps its own default. */
    val leadInMillis: Long?,
    val sorting: Int,
)
