package de.lambda9.ready2race.backend.app.timing.entity

/**
 * What a station's board should assume for the work it is about to do.
 *
 * Wrapped instead of returning the bare race type so "no race type applies" stays a 200 with an
 * explicit null - a board polling this must be able to tell "nothing assigned" from "request failed"
 * without reading a status code.
 */
data class CurrentRaceTypeDto(
    val raceType: TimingRaceTypeDto?,
)
