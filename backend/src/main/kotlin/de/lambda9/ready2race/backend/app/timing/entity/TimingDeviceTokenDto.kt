package de.lambda9.ready2race.backend.app.timing.entity

import java.time.LocalDateTime
import java.util.UUID

/** Metadata of a hardware device token. Deliberately carries neither the token nor its hash. */
data class TimingDeviceTokenDto(
    val id: UUID,
    val event: UUID,
    val station: UUID,
    val name: String,
    val revoked: Boolean,
    val createdAt: LocalDateTime,
)

/**
 * Response of an issue call: the only moment the plaintext [token] exists outside the device. Only
 * its hash is stored, so a lost token cannot be recovered - it has to be revoked and reissued.
 */
data class TimingDeviceTokenIssuedDto(
    val deviceToken: TimingDeviceTokenDto,
    val token: String,
)
