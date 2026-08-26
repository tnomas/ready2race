package de.lambda9.ready2race.backend.app.timing.entity

import java.util.UUID

/** The ids that the explicit "delete times" action physically removed. */
data class DeletedTimeMarksDto(
    val timeMarks: List<UUID>,
)
