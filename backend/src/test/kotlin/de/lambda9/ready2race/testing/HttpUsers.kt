package de.lambda9.ready2race.testing

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.security.PasswordUtilities
import io.ktor.client.request.*
import io.ktor.http.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

const val TEST_PASSWORD = "einPasswortFuerDenTest"

/**
 * Ein Konto mit genau diesen Privilegien (über eine eigene Rolle) und optional einem Verein;
 * liefert die Sitzung für den Kopf `X-Api-Session`.
 */
suspend fun TestApplicationComprehensionScope<JEnv>.loginWith(
    privileges: List<Privilege>,
    club: UUID? = null,
): String {
    val now = LocalDateTime.now()
    val roleId = UUID.randomUUID()
    !RoleRepo.create(
        RoleRecord(
            id = roleId,
            name = "Testrolle $roleId",
            description = null,
            static = false,
            createdAt = now,
            createdBy = SYSTEM_USER,
            updatedAt = now,
            updatedBy = SYSTEM_USER,
        )
    )
    val all = !PrivilegeRepo.all()
    val wanted = all.filter { record ->
        privileges.any {
            it.action.name == record.action && it.resource.name == record.resource && it.scope.name == record.scope
        }
    }
    assertEquals(privileges.size, wanted.size, "Alle gewünschten Privilegien müssen existieren")
    !RoleHasPrivilegeRepo.create(wanted.map { RoleHasPrivilegeRecord(role = roleId, privilege = it.id) })

    val userId = UUID.randomUUID()
    val email = "http-$userId@example.org"
    !AppUserRepo.create(
        AppUserRecord(
            id = userId,
            email = email,
            firstname = "Http",
            lastname = "Test",
            password = !PasswordUtilities.hash(TEST_PASSWORD),
            language = EmailLanguage.DE.name,
            club = club,
            createdAt = now,
            createdBy = SYSTEM_USER,
            updatedAt = now,
            updatedBy = SYSTEM_USER,
        )
    )
    !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = USER_ROLE))
    !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = roleId))

    val response = client.post("/api/login") {
        contentType(ContentType.Application.Json)
        setBody("""{"email":"$email","password":"$TEST_PASSWORD"}""")
    }
    assertEquals(HttpStatusCode.OK, response.status, "Anmeldung als $email")
    return assertNotNull(response.headers["X-Api-Session"], "Login muss eine Sitzung ausgeben")
}
