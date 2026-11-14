package de.lambda9.ready2race.backend.app.club

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.loginWith
import de.lambda9.ready2race.testing.testApplicationComprehension
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Offene Anträge auf Vereinsvertretung tragen Namen und E-Mail-Adressen. Mit READ CLUB OWN darf
 * man nur die des eigenen Vereins sehen. Gezielt starten:
 * `./mvnw test -Dtest=ClubRepresentativeApprovalHttpIT -DfailIfNoSpecifiedTests=false`
 */
class ClubRepresentativeApprovalHttpIT {

    @Test
    fun ownScopeSeesOnlyTheOwnClub() = testApplicationComprehension {
        val now = LocalDateTime.now()
        val a = UUID.randomUUID()
        val b = UUID.randomUUID()
        !CLUB.insert(ClubRecord(id = a, name = "Verein A", createdAt = now, updatedAt = now))
        !CLUB.insert(ClubRecord(id = b, name = "Verein B", createdAt = now, updatedAt = now))

        val session = loginWith(listOf(Privilege.ReadClubOwn), club = a)

        val own = client.get("/api/club/$a/clubRepresentative") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, own.status, own.bodyAsText())

        val foreign = client.get("/api/club/$b/clubRepresentative") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.Forbidden, foreign.status, foreign.bodyAsText())
    }

    @Test
    fun globalScopeSeesEveryClub() = testApplicationComprehension {
        val now = LocalDateTime.now()
        val b = UUID.randomUUID()
        !CLUB.insert(ClubRecord(id = b, name = "Verein B", createdAt = now, updatedAt = now))

        val session = loginWith(listOf(Privilege.ReadClubGlobal))
        val response = client.get("/api/club/$b/clubRepresentative") { header("X-Api-Session", session) }
        assertEquals(HttpStatusCode.OK, response.status, response.bodyAsText())
    }
}
