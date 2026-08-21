package de.lambda9.ready2race.backend.app.timing.entity

data class TimingStateDto(
    val stations: List<TimingStationDto>,
    val timeMarks: List<TimeMarkDto>,
)
