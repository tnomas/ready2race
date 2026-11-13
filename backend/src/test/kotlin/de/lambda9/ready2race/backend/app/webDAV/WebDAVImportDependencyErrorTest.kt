package de.lambda9.ready2race.backend.app.webDAV

import de.lambda9.ready2race.backend.app.webDAV.boundary.WebDAVImportService
import de.lambda9.ready2race.backend.database.generated.tables.records.WebdavImportDataRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.WebdavImportDependencyRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.WebdavImportProcessRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.WEBDAV_IMPORT_DATA
import de.lambda9.ready2race.backend.database.generated.tables.references.WEBDAV_IMPORT_DEPENDENCY
import de.lambda9.ready2race.backend.database.generated.tables.references.WEBDAV_IMPORT_PROCESS
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Scheitert ein Import, bekommen ALLE transitiv abhängigen Importe einen Fehler - nicht nur die
 * direkten. Sonst stehen die tieferen für immer als offen da: [getNextImport] nimmt nur Importe,
 * deren Abhängigkeiten alle importiert sind, und markiert sie auch nie als fehlerhaft.
 */
class WebDAVImportDependencyErrorTest {

    @Test
    fun errorPropagatesThroughTheWholeChain() = testComprehension {
        val processId = UUID.randomUUID()
        !WEBDAV_IMPORT_PROCESS.insert(WebdavImportProcessRecord(processId, "Ordner", LocalDateTime.now()))
        val (a, b, c) = List(3) { UUID.randomUUID() }
        val unrelated = UUID.randomUUID()
        listOf(a, b, c, unrelated).forEach {
            !WEBDAV_IMPORT_DATA.insert(WebdavImportDataRecord(it, processId, "DOC", "/$it"))
        }
        // A <- B <- C: B hängt an A, C an B.
        !WEBDAV_IMPORT_DEPENDENCY.insert(WebdavImportDependencyRecord(b, a))
        !WEBDAV_IMPORT_DEPENDENCY.insert(WebdavImportDependencyRecord(c, b))

        !WebDAVImportService.setErrorOnDependentDataImports(a, "kaputt")

        fun errorAt(id: UUID) = !Jooq.query {
            select(WEBDAV_IMPORT_DATA.ERROR_AT).from(WEBDAV_IMPORT_DATA).where(WEBDAV_IMPORT_DATA.ID.eq(id))
                .fetchOne(WEBDAV_IMPORT_DATA.ERROR_AT)
        }
        assertNotNull(errorAt(b), "direkt abhängig")
        assertNotNull(errorAt(c), "transitiv abhängig")
        assertNull(errorAt(unrelated))
    }
}
