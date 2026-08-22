package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.ready2race.backend.app.timing.control.TimingStationRepo
import de.lambda9.ready2race.backend.app.timing.control.toDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenIssuedDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.security.MessageDigest
import java.time.LocalDateTime
import java.util.UUID

/**
 * Station-scoped credentials for timing hardware (light barriers, transponder decoders) that cannot
 * log in as an app user.
 *
 * A token is bearer material, so it is treated like one: the plaintext exists only in the issue
 * response, the database keeps a hash, and every rejection - unknown, revoked, wrong event, wrong
 * station - produces the same [TimingError.DeviceTokenInvalid] without echoing anything about the
 * presented value.
 */
object TimingDeviceTokenService {

    /** Long enough that guessing is hopeless, short enough to be typed into a device's config. */
    private const val TOKEN_LENGTH = 48

    /**
     * Issues a new token for a station of [eventId] and returns the plaintext exactly once.
     */
    fun issue(
        eventId: UUID,
        request: TimingDeviceTokenRequest,
        userId: UUID,
    ): App<ServiceError, ApiResponse.Dto<TimingDeviceTokenIssuedDto>> = KIO.comprehension {
        val station = !TimingStationRepo.get(request.station).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val plain = RandomUtilities.alphanumerical(TOKEN_LENGTH)
        val record = TimingDeviceTokenRecord(
            id = UUID.randomUUID(),
            event = eventId,
            station = request.station,
            name = request.name,
            tokenHash = hash(plain),
            revoked = false,
            createdAt = LocalDateTime.now(),
            createdBy = userId,
        )
        !TimingDeviceTokenRepo.create(record).orDie()

        KIO.ok(ApiResponse.Dto(TimingDeviceTokenIssuedDto(deviceToken = record.toDto(), token = plain)))
    }

    fun list(
        eventId: UUID,
    ): App<ServiceError, ApiResponse.ListDto<TimingDeviceTokenDto>> = KIO.comprehension {
        val records = !TimingDeviceTokenRepo.getByEvent(eventId).orDie()
        KIO.ok(ApiResponse.ListDto(records.sortedBy { it.createdAt }.map { it.toDto() }))
    }

    /**
     * Revokes a token. Kept as a flag rather than a delete so the Leitstand can still show that a
     * device once existed (and which marks it produced).
     */
    fun revoke(
        eventId: UUID,
        tokenId: UUID,
    ): App<ServiceError, ApiResponse.NoData> = KIO.comprehension {
        val record = !TimingDeviceTokenRepo.get(tokenId).orDie().onNullFail { TimingError.DeviceTokenNotFound }
        !KIO.failOn(record.event != eventId) { TimingError.EventMismatch }

        !TimingDeviceTokenRepo.update(tokenId) {
            revoked = true
        }.orDie().onNullFail { TimingError.DeviceTokenNotFound }
        noData
    }

    /**
     * Resolves a presented plaintext token to its record, requiring it to belong to [eventId] and
     * [stationId] and not to be revoked.
     *
     * The lookup goes through the (indexed, unique) hash column; the digest is compared again with
     * [MessageDigest.isEqual] so the decision itself does not depend on how many leading characters
     * of a hash happen to match.
     */
    fun validate(
        plainToken: String,
        eventId: UUID,
        stationId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
        ) && record.revoked != true && record.event == eventId && record.station == stationId

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * Wie [validate], aber nur an die Veranstaltung gebunden, nicht an einen Posten.
     *
     * Für die Lese-Endpunkte der Zeitnahme (Zustand, Teams, Posten, aktive Sequenz) und den
     * WebSocket: ein geteilter Posten-Link (Erfassung oder Startbildschirm) trägt das Geräte-Token
     * in der URL, und die Boards lesen den Zustand der ganzen Veranstaltung — dieselbe
     * Sichtbarkeit, die jede angemeldete Zeitnahme-Rolle hat. Schreibend bleibt das Token auf den
     * Posten von [validate] beschränkt (Zeitmarken-POST); alle weiteren Mutationen verlangen
     * weiterhin eine Nutzersitzung. Jede Ablehnung ist auch hier das eine
     * [TimingError.DeviceTokenInvalid], ohne etwas über den präsentierten Wert zu verraten.
     */
    fun validateForEvent(
        plainToken: String,
        eventId: UUID,
    ): App<TimingError, TimingDeviceTokenRecord> = KIO.comprehension {
        val expected = hash(plainToken)
        val record = !TimingDeviceTokenRepo.getByHash(expected).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }

        val valid = MessageDigest.isEqual(
            record.tokenHash.toByteArray(Charsets.UTF_8),
            expected.toByteArray(Charsets.UTF_8),
        ) && record.revoked != true && record.event == eventId

        !KIO.failOn(!valid) { TimingError.DeviceTokenInvalid }
        KIO.ok(record)
    }

    /**
     * SHA-256, hex encoded.
     *
     * Unlike a user password this is high-entropy machine-generated material, so a fast digest is
     * enough - and it has to be deterministic (unsalted) for the token to be findable by a single
     * indexed lookup on every captured mark.
     */
    private fun hash(plain: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(plain.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte) }
}
