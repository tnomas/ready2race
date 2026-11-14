package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

/**
 * Schaltet eine Test-Veranstaltung auf „veröffentlicht". Die öffentlichen Info-Endpunkte
 * antworten für unveröffentlichte Veranstaltungen mit 404 - eine Vorrichtung, die eine
 * Veranstaltung nur anlegt (etwa die der Zeitnahme), braucht deshalb diesen zweiten Schritt,
 * bevor ein Test die öffentlichen Wege benutzt.
 */
fun publishEvent(eventId: UUID): JIO<Int> = Jooq.query {
    update(EVENT)
        .set(EVENT.PUBLISHED, true)
        .where(EVENT.ID.eq(eventId))
        .execute()
}
