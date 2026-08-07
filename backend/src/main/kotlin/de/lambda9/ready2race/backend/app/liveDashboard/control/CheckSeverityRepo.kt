package de.lambda9.ready2race.backend.app.liveDashboard.control

import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_CHECK_SEVERITY
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object CheckSeverityRepo {

    /** Alle abweichenden Schweregrade der Wettkämpfe einer Veranstaltung. */
    fun getByEvent(eventId: UUID) = Jooq.query {
        select(
            COMPETITION_CHECK_SEVERITY.COMPETITION,
            COMPETITION_CHECK_SEVERITY.CHECK_TYPE,
            COMPETITION_CHECK_SEVERITY.PARTICIPANT_REQUIREMENT,
            COMPETITION_CHECK_SEVERITY.SEVERITY,
        )
            .from(COMPETITION_CHECK_SEVERITY)
            .join(COMPETITION).on(COMPETITION_CHECK_SEVERITY.COMPETITION.eq(COMPETITION.ID))
            .where(COMPETITION.EVENT.eq(eventId))
            .fetch()
    }
}
