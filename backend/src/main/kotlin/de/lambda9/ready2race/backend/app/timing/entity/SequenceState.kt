package de.lambda9.ready2race.backend.app.timing.entity

enum class SequenceState {
    ARMED,
    RUNNING,
    DONE,
    ABORTED;

    /** ARMED and RUNNING sequences occupy their station; DONE/ABORTED ones are history. */
    val isActive: Boolean get() = this == ARMED || this == RUNNING
}
