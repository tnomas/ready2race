package de.lambda9.ready2race.backend.app.timing.entity

enum class SequenceMode {
    /** One signal starts every entry at the same instant. */
    MASS,

    /** One entry every `intervalMillis`, slot index = entry position. */
    INTERVAL,
}
