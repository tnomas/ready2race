package de.lambda9.ready2race.backend.app.role

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.appuser.control.AppUserHasRoleRepo
import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.email.entity.EmailLanguage
import de.lambda9.ready2race.backend.app.role.control.RoleHasPrivilegeRepo
import de.lambda9.ready2race.backend.app.role.control.RoleRepo
import de.lambda9.ready2race.backend.app.role.entity.Job
import de.lambda9.ready2race.backend.database.SUPERADMIN_ROLE
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.USER_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.testing.TestApplicationComprehensionScope
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Die Rechte an der Rollenverwaltung, über die Route geprüft - dort fällt die Entscheidung,
 * nicht im Service. Seit dem Rechtekonzept (Schritt 1) hängen Anlegen, Lesen, Ändern und
 * Löschen von Rollen an eigenen Privilegien (CREATE/READ/UPDATE/DELETE ROLE), das Vergeben
 * an Konten an UPDATE STAFF, und das alte `admin`-Flag der Einladung gibt es nicht mehr.
 *
 * Läuft als `IT` nicht in der normalen Suite mit (Surefire nimmt nur `*Test`), weil
 * `testApplicationComprehension` die Datenbank zurücksetzt. Gezielt starten:
 *
 * ```
 * ./mvnw -o test -Dtest=RolePrivilegeHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class RolePrivilegeHttpIT {

    private val now: LocalDateTime = LocalDateTime.of(2026, 9, 7, 9, 0)

    /**
     * Ein Konto mit genau den übergebenen Privilegien - über eine eigene Rolle, so wie die
     * Rechtevergabe in der Oberfläche auch läuft. Die Privileg-Zeilen selbst legt
     * `initializeDatabase` beim Start an; hier werden sie nur der Rolle zugeordnet.
     */
    private fun TestApplicationComprehensionScope<JEnv>.seedUser(
        password: String,
        privileges: List<Privilege>,
    ): String {
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
                it.action.name == record.action &&
                    it.resource.name == record.resource &&
                    it.scope.name == record.scope
            }
        }
        assertEquals(privileges.size, wanted.size, "Alle gewünschten Privilegien müssen existieren")

        !RoleHasPrivilegeRepo.create(
            wanted.map { RoleHasPrivilegeRecord(role = roleId, privilege = it.id) }
        )

        val userId = UUID.randomUUID()
        val email = "rolle-$userId@example.org"
        !AppUserRepo.create(
            AppUserRecord(
                id = userId,
                email = email,
                firstname = "Rollen",
                lastname = "Test",
                password = !PasswordUtilities.hash(password),
                language = EmailLanguage.DE.name,
                createdAt = now,
                createdBy = SYSTEM_USER,
                updatedAt = now,
                updatedBy = SYSTEM_USER,
            )
        )
        // USER_ROLE dazu, weil ein echtes Konto sie immer trägt (Eigenprofil lesen/ändern).
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = USER_ROLE))
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = userId, role = roleId))

        return email
    }

    private suspend fun TestApplicationComprehensionScope<JEnv>.login(
        email: String,
        password: String,
    ): String {
        val response = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$email","password":"$password"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status, "Anmeldung als $email")

        return assertNotNull(response.headers["X-Api-Session"], "Login muss eine Sitzung ausgeben")
    }

    /** UPDATE USER GLOBAL ist kein Admin mehr: Rollen anlegen verlangt CREATE ROLE. */
    @Test
    fun updateUserAloneNoLongerCreatesRoles() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.UpdateUserGlobal, Privilege.ReadUserGlobal)), password)
        val response = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Schleicher","description":null,"privileges":[],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status, response.bodyAsText())
    }

    /** Mit CREATE ROLE geht es, aber nur innerhalb der eigenen Privilegien. */
    @Test
    fun createRoleStaysWithinOwnPrivileges() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(
            seedUser(
                password,
                listOf(Privilege.CreateRoleGlobal, Privilege.ReadRoleGlobal, Privilege.UpdateAppTimingGlobal)
            ),
            password,
        )
        val all = !PrivilegeRepo.all()
        val timing = all.first { it.resource == "APP_TIMING" }.id
        val system = all.first { it.resource == "SYSTEM" }.id

        val ok = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Zeitnahme Kopie","description":null,"privileges":["$timing"],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Created, ok.status, ok.bodyAsText())

        val beyond = client.post("/api/role") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"name":"Schleicher","description":null,"privileges":["$timing","$system"],"job":"TIMEKEEPER"}""")
        }
        assertEquals(HttpStatusCode.Forbidden, beyond.status, beyond.bodyAsText())
        assertTrue(beyond.bodyAsText().contains("PRIVILEGES_BEYOND_OWN"), beyond.bodyAsText())
    }

    /** Die Jobliste hängt am Leserecht für Rollen. */
    @Test
    fun jobsAreListedWithReadRole() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(seedUser(password, listOf(Privilege.ReadRoleGlobal)), password)
        val response = client.get("/api/job") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        assertTrue(response.bodyAsText().contains("\"TIMEKEEPER\""), response.bodyAsText())

        val refused = login(seedUser(password, listOf(Privilege.ReadUserGlobal)), password)
        val denied = client.get("/api/job") { header("X-Api-Session", refused) }
        assertEquals(HttpStatusCode.Forbidden, denied.status, denied.bodyAsText())
    }

    /** Die Rollenseite zeigt jetzt auch die Jobs und markiert, was der Aufrufende vergeben darf. */
    @Test
    fun rolePageListsJobsWithAssignableFlag() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(
            seedUser(
                password,
                listOf(
                    Privilege.ReadRoleGlobal,
                    Privilege.UpdateStaffGlobal,
                    Privilege.UpdateAppTimingGlobal,
                    Privilege.ReadEventGlobal,
                )
            ),
            password,
        )
        val response = client.get("/api/role?limit=100") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        val body = response.bodyAsText()

        // Zeitnahme darf er vergeben (READ EVENT + UPDATE APP_TIMING deckt den Job), Superadmin nicht.
        assertEquals(true, assignableOf(body, "TIMEKEEPER"), body)
        assertEquals(false, assignableOf(body, "SUPERADMIN"), body)
    }

    /**
     * Liest `assignable` der Rolle mit dem gegebenen Job aus der Seitenantwort. `job`, `level`
     * und `assignable` stehen im RoleDto direkt hintereinander, deshalb reicht dieses kurze
     * Muster; ein weiter gefasstes würde über die eingebetteten Privilegien hinweglesen.
     */
    private fun assignableOf(body: String, job: String): Boolean? =
        Regex("\"job\":\"$job\",\"level\":\"[A-Z]+\",\"assignable\":(true|false)")
            .find(body)?.groupValues?.get(1)?.toBoolean()

    /** Einladen in eine Rolle verlangt STAFF plus Teilmenge; das alte admin-Flag gibt es nicht mehr. */
    @Test
    fun invitationCarriesOnlyAssignableRoles() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val session = login(
            seedUser(
                password,
                listOf(
                    Privilege.CreateUserGlobal,
                    Privilege.UpdateStaffGlobal,
                    Privilege.UpdateAppTimingGlobal,
                    Privilege.ReadEventGlobal,
                )
            ),
            password,
        )
        val ok = client.post("/api/user/invitation") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"email":"zeit@example.org","firstname":"Zeit","lastname":"Nahme","language":"DE","roles":["${Job.Timekeeper.roleId}"],"callbackUrl":"http://localhost/invitation/"}""")
        }
        assertEquals(HttpStatusCode.NoContent, ok.status, ok.bodyAsText())

        val beyond = client.post("/api/user/invitation") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"email":"chef@example.org","firstname":"Chef","lastname":"Chef","language":"DE","roles":["${Job.Admin.roleId}"],"callbackUrl":"http://localhost/invitation/"}""")
        }
        assertEquals(HttpStatusCode.Conflict, beyond.status, beyond.bodyAsText())
    }

    /**
     * Ein Admin sieht keine Superadmin-Konten, ein Superadmin schon. Geprüft an einem zweiten
     * Superadmin-Konto, weil das Systemkonto selbst aus der Nutzerliste ohnehin herausfällt
     * (`AppUserRepo.pageWithRolesIncludingAdmins` blendet es über seine Kennung aus).
     */
    @Test
    fun superadminAccountsAreHiddenFromAdmins() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"

        val superEmail = seedUser(password, emptyList())
        val superId = assertNotNull(!AppUserRepo.getByEmail(superEmail), "Konto muss angelegt sein").id!!
        !AppUserHasRoleRepo.create(AppUserHasRoleRecord(appUser = superId, role = SUPERADMIN_ROLE))

        val admin = login(seedUser(password, Job.Admin.privileges), password)
        val list = client.get("/api/user?limit=100") { header("X-Api-Session", admin) }
        assertEquals(HttpStatusCode.OK, list.status, list.bodyAsText())
        assertFalse(list.bodyAsText().contains(superEmail), list.bodyAsText())

        val boss = login("admin", "admin")
        val all = client.get("/api/user?limit=100") { header("X-Api-Session", boss) }
        assertEquals(HttpStatusCode.OK, all.status, all.bodyAsText())
        assertTrue(all.bodyAsText().contains(superEmail), all.bodyAsText())
    }

    /**
     * Die Rollen des Systemkontos sind per API nicht änderbar - auch nicht für den Superadmin
     * selbst. Sonst könnte ein Fehlgriff in der Maske dem Konto die Superadmin-Rolle nehmen und
     * die Anlage stünde ohne Notausgang da.
     */
    @Test
    fun theSystemUsersRolesCannotBeChanged() = testApplicationComprehension {
        val boss = login("admin", "admin")

        val response = client.put("/api/user/$SYSTEM_USER") {
            header("X-Api-Session", boss)
            contentType(ContentType.Application.Json)
            setBody("""{"firstname":"System","lastname":"User","roles":["${Job.Admin.roleId}"]}""")
        }
        assertEquals(HttpStatusCode.Forbidden, response.status, response.bodyAsText())
    }

    /**
     * Regel 2 ("nicht an sich selbst") darf das Speichern des eigenen Profils nicht blockieren:
     * solange die verwalteten Rollen gleich bleiben, ist das keine Vergabe.
     */
    @Test
    fun savingOwnProfileWithUnchangedRolesSucceeds() = testApplicationComprehension {
        val password = "einPasswortFuerDenTest"
        val email = seedUser(password, Job.Admin.privileges)
        val session = login(email, password)

        val own = !AppUserRepo.getByEmail(email)
        val userId = assertNotNull(own, "Das gesäte Konto muss auffindbar sein").id!!
        val roles = (!AppUserHasRoleRepo.getRoleIds(userId)).joinToString(",") { "\"$it\"" }

        val response = client.put("/api/user/$userId") {
            header("X-Api-Session", session)
            contentType(ContentType.Application.Json)
            setBody("""{"firstname":"Umbenannt","lastname":"Test","roles":[$roles]}""")
        }
        assertEquals(HttpStatusCode.NoContent, response.status, response.bodyAsText())
    }
}
