package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.app.timing.control.TimingDeviceTokenRepo
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserHasRoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleHasPrivilegeRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RoleRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER_HAS_ROLE
import de.lambda9.ready2race.backend.database.generated.tables.references.PRIVILEGE
import de.lambda9.ready2race.backend.database.generated.tables.references.ROLE
import de.lambda9.ready2race.backend.database.generated.tables.references.ROLE_HAS_PRIVILEGE
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.security.PasswordUtilities
import de.lambda9.ready2race.testing.testApplicationComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.jooq.Jooq
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.ClientProvider
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Die Berechtigungsgrenze des Token-Widerrufs über die Route
 * (`DELETE /event/{eventId}/timing/deviceTokens/{tokenId}`): `authenticateAny(UpdateEventGlobal,
 * UpdateStreamGlobal, UpdateBoardGlobal)` lässt drei Rollen an die Tür, der Service schneidet je
 * Rolle auf den eigenen Token-Typ zu. Die Service-Fälle stehen in [TimingDeviceTokenServiceTest];
 * hier geht es darum, dass die Route die Flags richtig aus der Sitzung ableitet - eine reine
 * Board-Rolle kommt überhaupt erst seit dieser Änderung durch die Tür.
 *
 * Läuft als `IT` nicht in der normalen Suite mit (kein Failsafe im POM, Surefire nimmt nur
 * `*Test`), weil `testApplicationComprehension` die Datenbank zurücksetzt. Gezielt starten:
 *
 * ```
 * ./mvnw -o test -Dtest=TimingDeviceTokenRevokePrivilegeHttpIT -DfailIfNoSpecifiedTests=false
 * ```
 */
class TimingDeviceTokenRevokePrivilegeHttpIT {

    private val now: LocalDateTime = LocalDateTime.of(2026, 9, 7, 12, 0)
    private val password = "geheim"

    private fun boardRequest(name: String) = BoardRequest(
        name = name,
        config = BoardConfig(
            columns = 1,
            tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.CLOCK)))),
        ),
    )

    /** Ein Konto mit genau diesen Rechten und sonst keinen. */
    private fun seedUser(email: String, privileges: List<Privilege>): App<Any?, UUID> = KIO.comprehension {
        val userId = UUID.randomUUID()
        val roleId = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = userId,
                email = email,
                firstname = "Rolle",
                lastname = "Testerin",
                password = !PasswordUtilities.hash(password),
                language = "DE",
                createdAt = now,
                updatedAt = now,
            )
        )
        !ROLE.insert(RoleRecord(id = roleId, name = "Rolle $email", static = false, createdAt = now, updatedAt = now))
        !APP_USER_HAS_ROLE.insert(AppUserHasRoleRecord(appUser = userId, role = roleId))
        for (privilege in privileges) {
            val privilegeId = assertNotNull(
                !Jooq.query {
                    select(PRIVILEGE.ID)
                        .from(PRIVILEGE)
                        .where(PRIVILEGE.ACTION.eq(privilege.action.name))
                        .and(PRIVILEGE.RESOURCE.eq(privilege.resource.name))
                        .and(PRIVILEGE.SCOPE.eq(privilege.scope.name))
                        .fetchOne(PRIVILEGE.ID)
                },
                "initializeDatabase legt alle Privilegien an",
            )
            !ROLE_HAS_PRIVILEGE.insert(RoleHasPrivilegeRecord(role = roleId, privilege = privilegeId))
        }
        KIO.ok(userId)
    }

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
    fun boardRoleRevokesBoardTokensOnly() = testApplicationComprehension {
        val (eventId, adminId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, adminId)
        val boardId = (!BoardService.createBoard(eventId, boardRequest("Anzeige Steg"))).dto.id
        val board = (!TimingDeviceTokenService.shareLinkForBoard(eventId, boardId, adminId)).dto
        val station = (!TimingDeviceTokenService.shareLink(eventId, stationId, adminId)).dto

        !seedUser("board@example.org", listOf(Privilege.ReadBoardGlobal, Privilege.UpdateBoardGlobal))
        !seedUser("stream@example.org", listOf(Privilege.UpdateStreamGlobal))
        val boardSession = login("board@example.org", password)
        val streamSession = login("stream@example.org", password)

        // Die Stream-Rolle kommt durch die Tür, aber nicht an ein Board-Token.
        val streamOnBoard = client.delete("/api/event/$eventId/timing/deviceTokens/${board.deviceTokenId}") {
            header("X-Api-Session", streamSession)
        }
        assertEquals(HttpStatusCode.Forbidden, streamOnBoard.status, streamOnBoard.bodyAsText())

        // Die Board-Rolle nicht an ein Posten-Token ...
        val boardOnStation = client.delete("/api/event/$eventId/timing/deviceTokens/${station.deviceToken.id}") {
            header("X-Api-Session", boardSession)
        }
        assertEquals(HttpStatusCode.Forbidden, boardOnStation.status, boardOnStation.bodyAsText())
        assertFalse((!TimingDeviceTokenRepo.get(station.deviceToken.id))!!.revoked!!)

        // ... aber an das Board-Token.
        val boardOnBoard = client.delete("/api/event/$eventId/timing/deviceTokens/${board.deviceTokenId}") {
            header("X-Api-Session", boardSession)
        }
        assertEquals(HttpStatusCode.NoContent, boardOnBoard.status, boardOnBoard.bodyAsText())
        assertTrue((!TimingDeviceTokenRepo.get(board.deviceTokenId))!!.revoked!!)

        // Ohne Sitzung gar nicht.
        val anonymous = client.delete("/api/event/$eventId/timing/deviceTokens/${station.deviceToken.id}")
        assertEquals(HttpStatusCode.Unauthorized, anonymous.status, anonymous.bodyAsText())

        // Der Gegenbeleg: aus dem Regattabüro geht das Posten-Token weiterhin.
        val officeSession = login("admin", "admin")
        val fromOffice = client.delete("/api/event/$eventId/timing/deviceTokens/${station.deviceToken.id}") {
            header("X-Api-Session", officeSession)
        }
        assertEquals(HttpStatusCode.NoContent, fromOffice.status, fromOffice.bodyAsText())
    }
}
