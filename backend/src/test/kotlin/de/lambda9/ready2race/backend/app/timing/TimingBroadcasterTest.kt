package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingWsMessage
import kotlinx.coroutines.runBlocking
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TimingBroadcasterTest {

    @Test
    fun broadcastReachesOnlySubscribersOfSameEvent() = runBlocking {
        val eventA = UUID.randomUUID()
        val eventB = UUID.randomUUID()
        val receivedA = mutableListOf<String>()
        val receivedB = mutableListOf<String>()

        val subA = TimingBroadcaster.subscribe(eventA) { receivedA.add(it) }
        val subB = TimingBroadcaster.subscribe(eventB) { receivedB.add(it) }

        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))

        assertEquals(1, receivedA.size)
        assertTrue(receivedA[0].contains("timeMarkRetracted"))
        assertEquals(0, receivedB.size)

        TimingBroadcaster.unsubscribe(eventA, subA)
        TimingBroadcaster.unsubscribe(eventB, subB)
        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))
        assertEquals(1, receivedA.size)
    }
}
