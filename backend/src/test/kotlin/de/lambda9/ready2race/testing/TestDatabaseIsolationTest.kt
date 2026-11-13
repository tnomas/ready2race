package de.lambda9.ready2race.testing

import de.lambda9.ready2race.backend.app.appuser.control.AppUserRepo
import de.lambda9.ready2race.backend.app.auth.control.PrivilegeRepo
import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.club.control.ClubRepo
import de.lambda9.ready2race.backend.database.SYSTEM_USER
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.tailwind.jooq.Jooq
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.TestMethodOrder
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Der Test-Runner setzt die Datenbank nach committenden Tests per Kopie einer Template-Datenbank
 * zurück. Hier der Beleg, dass die Kopie vollständig ist (Migration + initializeDatabase) und dass
 * Committetes nicht in den nächsten Test leckt.
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class TestDatabaseIsolationTest {

    companion object {
        private val probeId: UUID = UUID.randomUUID()
    }

    @Test
    @Order(1)
    fun `frische Datenbank traegt Systemkonto und alle Privilegien`() = testComprehension {
        assertTrue(!AppUserRepo.exists(SYSTEM_USER))
        assertEquals(Privilege.entries.size, (!PrivilegeRepo.all()).size)
    }

    @Test
    @Order(2)
    fun `committender Test schreibt einen Verein`() = testCommittingComprehension {
        val now = LocalDateTime.now()
        !ClubRepo.create(ClubRecord(id = probeId, name = "Isolationsprobe $probeId", createdAt = now, updatedAt = now))
        assertEquals(1, !Jooq.query { fetchCount(CLUB, CLUB.ID.eq(probeId)) })
    }

    @Test
    @Order(3)
    fun `der naechste Test sieht ihn nicht mehr, die Grunddaten aber schon`() = testComprehension {
        assertEquals(0, !Jooq.query { fetchCount(CLUB, CLUB.ID.eq(probeId)) })
        assertTrue(!AppUserRepo.exists(SYSTEM_USER))
    }
}
