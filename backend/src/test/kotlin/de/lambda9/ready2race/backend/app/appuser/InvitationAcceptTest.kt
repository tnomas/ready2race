package de.lambda9.ready2race.backend.app.appuser

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.boundary.AppUserService
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserInvitationHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserInvitationRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.appuser.entity.AcceptInvitationRequest
import de.lambda9.ready2race.backend.app.appuser.entity.AppUserError
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserInvitationHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserInvitationRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.backend.security.RandomUtilities
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Das Einlösen einer Einladung, und zwar an der Stelle, die sich nicht in reinem Kotlin zeigt:
 * `app_user_invitation.created_by` hängt mit `on delete set null` am einladenden Konto. Wird das
 * Konto gelöscht, steht die Einladung ohne Absender da - und dann darf sie ihre Rollen nicht mehr
 * vergeben (fail-closed), weil niemand mehr für die damals geprüfte Teilmengenregel einsteht.
 */
class InvitationAcceptTest {

    private val email = "eingeladen@example.com"
    private val password = "5kFlg09?\$!dF"

    private fun TestComprehensionScope<JEnv>.seedInviter(): UUID {
        val id = UUID.randomUUID()
        !AppUserRepo.create(
            AppUserRecord(
                id = id,
                email = "einladende-$id@example.org",
                firstname = "Ilka",
                lastname = "Regattaleitung",
                password = !PasswordUtilities.hash(password),
                language = EmailLanguage.DE.name,
                createdAt = LocalDateTime.now(),
                createdBy = SYSTEM_USER,
                updatedAt = LocalDateTime.now(),
                updatedBy = SYSTEM_USER,
            )
        )
        return id
    }

    private fun TestComprehensionScope<JEnv>.seedInvitation(inviter: UUID?, token: String): UUID {
        val id = !AppUserInvitationRepo.create(
            AppUserInvitationRecord(
                id = UUID.randomUUID(),
                token = token,
                email = email,
                firstname = "Neue",
                lastname = "Person",
                language = EmailLanguage.DE.name,
                expiresAt = LocalDateTime.now().plusDays(7),
                createdAt = LocalDateTime.now(),
                createdBy = inviter,
            )
        )
        !AppUserInvitationHasRoleRepo.create(
            listOf(AppUserInvitationHasRoleRecord(appUserInvitation = id, role = Job.Timekeeper.roleId))
        )
        return id
    }

    /** Der Normalfall: das einladende Konto steht noch, die eingeladenen Rollen werden vergeben. */
    @Test
    fun acceptingAnInvitationAssignsTheInvitedRoles() = testComprehension {
        val token = RandomUtilities.token()
        seedInvitation(seedInviter(), token)

        val created = !AppUserService.acceptInvitation(AcceptInvitationRequest(token = token, password = password))

        val roles = (!AppUserHasRoleRepo.getRoleIds(created.id)).toSet()
        assertTrue(roles.contains(USER_ROLE), "Jedes Konto trägt die USER-Rolle")
        assertTrue(roles.contains(Job.Timekeeper.roleId), "Die eingeladene Rolle muss ankommen")
    }

    /**
     * Der Prüfpunkt: das einladende Konto ist weg, `created_by` steht auf null. Dann gilt die
     * Einladung nicht mehr - lieber eine neue verschicken, als eine Vergabe ohne Absender
     * auszuführen.
     */
    @Test
    fun acceptingAnInvitationWithoutItsInviterFails() = testComprehension {
        val inviter = seedInviter()
        val token = RandomUtilities.token()
        seedInvitation(inviter, token)

        assertEquals(1, !Jooq.query { deleteFrom(APP_USER).where(APP_USER.ID.eq(inviter)).execute() })

        assertKIOFails(AppUserError.InvitationNotFound) {
            AppUserService.acceptInvitation(AcceptInvitationRequest(token = token, password = password))
        }
    }
}
