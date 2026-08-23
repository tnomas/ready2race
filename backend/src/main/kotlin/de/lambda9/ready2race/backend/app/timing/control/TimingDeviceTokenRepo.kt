package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_DEVICE_TOKEN
import java.util.UUID

object TimingDeviceTokenRepo {

    fun create(record: TimingDeviceTokenRecord) = TIMING_DEVICE_TOKEN.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_DEVICE_TOKEN.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_DEVICE_TOKEN.select { EVENT.eq(eventId) }

    /**
     * Looks a token up by its hash. The hash is deterministic (see
     * [de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService]) precisely so
     * this can be a single indexed lookup instead of a scan over every token of the event.
     *
     * Deliberately does not filter revoked tokens or scope the query to an event/station: the
     * service compares those itself so that every rejection reason produces the same opaque error.
     */
    fun getByHash(tokenHash: String) = TIMING_DEVICE_TOKEN.selectOne { TOKEN_HASH.eq(tokenHash) }

    fun update(id: UUID, f: TimingDeviceTokenRecord.() -> Unit) = TIMING_DEVICE_TOKEN.update(f) { ID.eq(id) }

    /**
     * Das wiederverwendbare Link-Token eines Postens: automatisch ausgestellt (share_link_token
     * gesetzt) und nicht widerrufen. Höchstens eines je Posten - der Service stellt nie ein
     * zweites aus, solange dieses lebt (Wiederverwendung statt Inflation).
     */
    fun getActiveShareLinkByStation(stationId: UUID) = TIMING_DEVICE_TOKEN.selectOne {
        STATION.eq(stationId).and(REVOKED.isFalse).and(SHARE_LINK_TOKEN.isNotNull)
    }
}
