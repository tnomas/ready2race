package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_DEVICE_TOKEN
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingDeviceTokenRepo {

    fun create(record: TimingDeviceTokenRecord) = TIMING_DEVICE_TOKEN.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_DEVICE_TOKEN.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_DEVICE_TOKEN.select { EVENT.eq(eventId) }

    /**
     * Nur die POSTEN-Tokens der Veranstaltung: seit Migration V202608250900 trägt dieselbe
     * Tabelle auch Board-Tokens (station null, board gesetzt).
     *
     * Der Geräte-Reiter der Zeitnahme führt eine Postenspalte und wäre mit einem Board-Token
     * nur verwirrend; wichtiger noch: `TimingDeviceTokenRecord.toDto()` liest station als
     * gesetzt. Dieser Filter ist die Zusage, die das dortige `!!` trägt.
     */
    fun getStationTokensByEvent(eventId: UUID) =
        TIMING_DEVICE_TOKEN.select { EVENT.eq(eventId).and(STATION.isNotNull) }

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
     * gesetzt) und nicht widerrufen. Der Service stellt kein zweites aus, solange eines lebt
     * (Wiederverwendung statt Inflation) - aber zwei GLEICHZEITIGE erste Klicks können sich am
     * Check vorbeimogeln und je ein Token anlegen (real passiert am 23.08.2026 durch Reacts
     * StrictMode-Doppeleffekt im Teilen-Dialog). Deshalb kein selectOne, das an Duplikaten mit
     * TooManyRows stürbe: deterministisch das älteste Token nehmen, damit jeder weitere Klick
     * wieder denselben Link liefert. Überzählige Duplikate bleiben im Geräte-Reiter sichtbar
     * und widerrufbar.
     */
    fun getActiveShareLinkByStation(stationId: UUID): JIO<TimingDeviceTokenRecord?> = Jooq.query {
        selectFrom(TIMING_DEVICE_TOKEN)
            .where(
                TIMING_DEVICE_TOKEN.STATION.eq(stationId)
                    .and(TIMING_DEVICE_TOKEN.REVOKED.isFalse)
                    .and(TIMING_DEVICE_TOKEN.SHARE_LINK_TOKEN.isNotNull)
            )
            .orderBy(TIMING_DEVICE_TOKEN.CREATED_AT.asc(), TIMING_DEVICE_TOKEN.ID.asc())
            .limit(1)
            .fetchOne()
    }

    /**
     * Dasselbe für ein Board (Migration V202608250900): das wiederverwendbare Link-Token einer
     * Anzeige. Wort für Wort dieselbe Regel wie bei den Posten - automatisch ausgestellt, nicht
     * widerrufen, deterministisch das älteste, damit jeder weitere Klick denselben Link liefert
     * und ein Doppeleffekt im Teilen-Dialog nicht mit TooManyRows stirbt.
     */
    fun getActiveShareLinkByBoard(boardId: UUID): JIO<TimingDeviceTokenRecord?> = Jooq.query {
        selectFrom(TIMING_DEVICE_TOKEN)
            .where(
                TIMING_DEVICE_TOKEN.BOARD.eq(boardId)
                    .and(TIMING_DEVICE_TOKEN.REVOKED.isFalse)
                    .and(TIMING_DEVICE_TOKEN.SHARE_LINK_TOKEN.isNotNull)
            )
            .orderBy(TIMING_DEVICE_TOKEN.CREATED_AT.asc(), TIMING_DEVICE_TOKEN.ID.asc())
            .limit(1)
            .fetchOne()
    }
}
