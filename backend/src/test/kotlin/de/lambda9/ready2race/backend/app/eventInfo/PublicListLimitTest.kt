package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.PUBLIC_LIST_DEFAULT_LIMIT
import de.lambda9.ready2race.backend.app.eventInfo.boundary.PUBLIC_LIST_MAX_LIMIT
import de.lambda9.ready2race.backend.app.eventInfo.boundary.publicListLimit
import kotlin.test.Test
import kotlin.test.assertEquals

/** `limit` der öffentlichen Laufliste wird begrenzt, bevor es Postgres erreicht. */
class PublicListLimitTest {

    @Test
    fun unusableAndNonPositiveValuesFallBackToTheDefault() {
        assertEquals(PUBLIC_LIST_DEFAULT_LIMIT, publicListLimit("-1"))
        assertEquals(PUBLIC_LIST_DEFAULT_LIMIT, publicListLimit("0"))
        assertEquals(PUBLIC_LIST_DEFAULT_LIMIT, publicListLimit("zehn"))
        assertEquals(PUBLIC_LIST_DEFAULT_LIMIT, publicListLimit(""))
    }

    @Test
    fun largeValuesAreCapped() {
        assertEquals(PUBLIC_LIST_MAX_LIMIT, publicListLimit("100000"))
        assertEquals(PUBLIC_LIST_MAX_LIMIT, publicListLimit("${Int.MAX_VALUE}"))
    }

    @Test
    fun valuesTheFrontendUsesPassUnchanged() {
        listOf(1, 8, 100, 500).forEach { assertEquals(it, publicListLimit("$it")) }
    }
}
