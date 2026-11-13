package de.lambda9.ready2race.backend.app.appuser

import de.lambda9.ready2race.backend.app.appuser.boundary.AppUserService
import de.lambda9.ready2race.backend.app.appuser.entity.PasswordResetRequest
import de.lambda9.ready2race.backend.app.auth.boundary.AuthService
import de.lambda9.ready2race.backend.app.auth.entity.AuthError
import de.lambda9.ready2race.backend.app.competitionRegistration.seedClubWithUser
import de.lambda9.ready2race.backend.app.competitionRegistration.seedEvent
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserPasswordResetRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserSessionRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_PASSWORD_RESET
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_SESSION
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import kotlin.test.Test

/** Nach einem Passwort-Reset gilt keine alte Sitzung des Kontos mehr. */
class PasswordResetEndsSessionsTest {

    @Test
    fun resettingThePasswordEndsAllSessionsOfTheAccount() = testComprehension {
        val now = LocalDateTime.now()
        val owner = seedClubWithUser(seedEvent(), "A").user.id!!
        val bystander = seedClubWithUser(seedEvent(), "B").user.id!!

        val ownerSession = RandomUtilities.token().take(30)
        val otherSession = RandomUtilities.token().take(30)
        !APP_USER_SESSION.insert(AppUserSessionRecord(ownerSession, owner, now.plusDays(1), now))
        !APP_USER_SESSION.insert(AppUserSessionRecord(otherSession, bystander, now.plusDays(1), now))

        val resetToken = RandomUtilities.token()
        !APP_USER_PASSWORD_RESET.insert(AppUserPasswordResetRecord(resetToken, owner, now.plusHours(1)))

        !AppUserService.resetPassword(resetToken, PasswordResetRequest(password = "ein-neues-Passwort-123"))

        assertKIOFails(AuthError.TokenInvalid) { AuthService.useSessionToken(ownerSession) }
        !AuthService.useSessionToken(otherSession) // fremde Konten bleiben angemeldet
    }
}
