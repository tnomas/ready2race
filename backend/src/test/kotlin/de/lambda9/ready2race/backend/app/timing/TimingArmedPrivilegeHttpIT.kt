package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.entity.TimingCaptureMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStationRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_HAS_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PRIVILEGE
import de.lambda9.ready2race.backend.database.generated.tables.references.ROLE
import de.lambda9.ready2race.backend.database.generated.tables.references.ROLE_HAS_PRIVILEGE
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.ClientProvider
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Die Berechtigungsgrenze der Scharfschaltung mit SITZUNG (der Geräte-Token-Zweig steht in
 * [TimingArmedDeviceTokenAuthTest]).
 *
 * Die Entscheidung, die hier festgehalten wird: Schalten verlangt ein Zeitnahme- oder
 * Veranstaltungsrecht, READ EVENT genügt NICHT. Das ist keine Formalie - Entschärfen sperrt jede
 * zugeordnete Erfassung, ein reiner Lesenutzer könnte mitten im Rennen einen Posten totlegen. Die
 * Nachbarn dieses Endpunkts (GET /stations, /matches, /state) lassen READ EVENT bewusst zu; genau
 * dieser Unterschied ist die Falle, in die eine wörtlich von einem Leseweg übernommene Weiche
 * läuft.
 *
 * Läuft als `IT` nicht in der normalen Suite mit (kein Failsafe im POM, Surefire nimmt nur
 * `*Test`), weil `testApplicationComprehension` die Datenbank zurücksetzt. Gezielt starten:
 *
 * ```
 * ./mvnw -o test -Dtest=TimingArmedPrivilegeHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class TimingArmedPrivilegeHttpIT {

    private val now: LocalDateTime = LocalDateTime.of(2026, 8, 25, 12, 0)
    private val readerPassword = "nurlesen"

    /** Die Sitzung reist im Header, nicht im Cookie (Sessions.kt: header<UserSession>). */
    private suspend fun ClientProvider.login(email: String, password: String): String {
        val response = client.post("/api/login") {
            contentType(ContentType.Application.Json)
            setBody("""{"email":"$email","password":"$password"}""")
        }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
        return assertNotNull(response.headers["X-Api-Session"], "Login muss eine Sitzung ausgeben")
    }

    @Test
    fun readEventGlobalMayNotArmAStation() = testApplicationComprehension {
        val eventId = UUID.randomUUID()
        val stationId = UUID.randomUUID()
        val readerEmail = "nurlesen@example.org"

        !EVENT.insert(EventRecord(id = eventId, name = "Testregatta", createdAt = now, updatedAt = now))
        !TIMING_STATION.insert(
            TimingStationRecord(
                id = stationId,
                event = eventId,
                name = "Ziel",
                type = TimingStationType.FINISH.name,
                sorting = 0,
                captureMode = TimingCaptureMode.ARMED.name,
                armed = true,
                createdAt = now,
                updatedAt = now,
            )
        )

        // Ein Konto mit genau einem Recht: READ EVENT - das Recht, mit dem man die Postenliste und
        // den Zeitnahme-Zustand lesen darf. Kein UPDATE EVENT, kein Zeitnahme-Recht.
        val readerId = UUID.randomUUID()
        val readerRole = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = readerId,
                email = readerEmail,
                firstname = "Lena",
                lastname = "Leserin",
                password = !PasswordUtilities.hash(readerPassword),
                language = "DE",
                createdAt = now,
                updatedAt = now,
            )
        )
        !ROLE.insert(RoleRecord(id = readerRole, name = "Zuschauerin", static = false, createdAt = now, updatedAt = now))
        !APP_USER_HAS_ROLE.insert(AppUserHasRoleRecord(appUser = readerId, role = readerRole))

        val readPrivilege = Privilege.ReadEventGlobal
        val privilegeId = assertNotNull(
            !Jooq.query {
                select(PRIVILEGE.ID)
                    .from(PRIVILEGE)
                    .where(PRIVILEGE.ACTION.eq(readPrivilege.action.name))
                    .and(PRIVILEGE.RESOURCE.eq(readPrivilege.resource.name))
                    .and(PRIVILEGE.SCOPE.eq(readPrivilege.scope.name))
                    .fetchOne(PRIVILEGE.ID)
            },
            "initializeDatabase legt alle Privilegien an",
        )
        !ROLE_HAS_PRIVILEGE.insert(RoleHasPrivilegeRecord(role = readerRole, privilege = privilegeId))

        val readerSession = login(readerEmail, readerPassword)

        // Lesen darf sie - dafür ist das Recht da.
        val read = client.get("/api/event/$eventId/timing/stations") {
            header("X-Api-Session", readerSession)
        }
        assertEquals(HttpStatusCode.OK, read.status, read.bodyAsText())

        // Entschärfen nicht.
        val disarm = client.put("/api/event/$eventId/timing/stations/$stationId/armed") {
            header("X-Api-Session", readerSession)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }
        assertEquals(HttpStatusCode.Forbidden, disarm.status, disarm.bodyAsText())

        // Ohne Sitzung erst recht nicht.
        val anonymous = client.put("/api/event/$eventId/timing/stations/$stationId/armed") {
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status, anonymous.bodyAsText())

        // Der Gegenbeleg, ohne den die 403 nichts wert wäre: dieselbe Anfrage geht durch, sobald
        // sie aus dem Regattabüro kommt. Die Ablehnung oben liegt also am Recht und nicht daran,
        // dass an der Anfrage selbst etwas nicht stimmt.
        val officeSession = login("admin", "admin")
        val fromOffice = client.put("/api/event/$eventId/timing/stations/$stationId/armed") {
            header("X-Api-Session", officeSession)
            contentType(ContentType.Application.Json)
            setBody("""{"armed":false}""")
        }
        assertEquals(HttpStatusCode.NoContent, fromOffice.status, fromOffice.bodyAsText())
    }
}
