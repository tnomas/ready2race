package de.lambda9.ready2race.backend.app.timing.entity

/**
 * Wrapper for "the sequence currently owning a station, if any".
 *
 * A station without an armed or running sequence is the normal case (the board then shows its setup
 * form), not a missing resource - hence a 200 with a null [sequence] rather than a 404.
 */
data class ActiveSequenceDto(
    val sequence: TimingSequenceDto?,
)
