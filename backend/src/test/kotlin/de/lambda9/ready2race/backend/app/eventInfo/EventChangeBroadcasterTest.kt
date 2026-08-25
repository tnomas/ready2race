package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeBroadcaster
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.Collections
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

class EventChangeBroadcasterTest {

    @Test
    fun messageCarriesTypeAndMarker() {
        assertEquals("""{"type":"changed","marker":7}""", EventChangeBroadcaster.message(7))
    }

    @Test
    fun broadcastReachesOnlySubscribersOfSameEvent() = runBlocking {
        val eventA = UUID.randomUUID()
        val eventB = UUID.randomUUID()
        val receivedA = concurrentList()
        val receivedB = concurrentList()

        val subA = EventChangeBroadcaster.subscribe(eventA) { receivedA.add(it) }
        val subB = EventChangeBroadcaster.subscribe(eventB) { receivedB.add(it) }

        EventChangeBroadcaster.broadcast(eventA, 1)

        awaitSize(receivedA, 1)
        assertEquals("""{"type":"changed","marker":1}""", receivedA[0])
        assertEquals(0, receivedB.size)

        EventChangeBroadcaster.unsubscribe(subA)
        EventChangeBroadcaster.unsubscribe(subB)

        // Der Eintrag der Veranstaltung fällt mit ihrem letzten Abonnenten weg.
        assertNull(EventChangeBroadcaster.subscriptionCount(eventA))
        assertNull(EventChangeBroadcaster.subscriptionCount(eventB))

        EventChangeBroadcaster.broadcast(eventA, 2)
        delay(quietPeriod)
        assertEquals(1, receivedA.size)
    }

    /**
     * Die CONFLATED-Queue ist die serverseitige Hälfte der Entprellung: hängt ein Client, fallen
     * zwischenzeitliche Marker auf den jüngsten Stand zusammen, statt sich aufzustauen.
     */
    @Test
    fun burstCollapsesToLatestMarkerForABlockedSubscriber() = runBlocking {
        val eventId = UUID.randomUUID()
        val received = concurrentList()
        val firstDelivered = CompletableDeferred<Unit>()
        val gate = CompletableDeferred<Unit>()

        val subscription = EventChangeBroadcaster.subscribe(eventId) { json ->
            received.add(json)
            if (received.size == 1) {
                firstDelivered.complete(Unit)
                gate.await() // Der Schreiber hängt — alles Weitere muss konflatieren.
            }
        }

        try {
            EventChangeBroadcaster.broadcast(eventId, 1)
            withTimeout(awaitTimeout) { firstDelivered.await() }
            (2L..5L).forEach { EventChangeBroadcaster.broadcast(eventId, it) }
            gate.complete(Unit)

            awaitSize(received, 2)
            delay(quietPeriod)
            assertEquals(2, received.size, "intermediate markers must conflate: $received")
            assertEquals("""{"type":"changed","marker":5}""", received[1])
        } finally {
            EventChangeBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun failingSubscriberIsDroppedWhileOthersKeepReceiving() = runBlocking {
        val eventId = UUID.randomUUID()
        val healthy = concurrentList()
        val failed = CompletableDeferred<Unit>()

        val dead = EventChangeBroadcaster.subscribe(eventId) {
            failed.complete(Unit)
            // Simuliert eine Session, deren send scheitert (Client weg).
            throw IllegalStateException("socket closed")
        }
        val alive = EventChangeBroadcaster.subscribe(eventId) { healthy.add(it) }
        assertEquals(2, EventChangeBroadcaster.subscriptionCount(eventId))

        EventChangeBroadcaster.broadcast(eventId, 1)
        withTimeout(awaitTimeout) { failed.await() }
        awaitSize(healthy, 1)

        awaitCondition { EventChangeBroadcaster.subscriptionCount(eventId) == 1 }

        EventChangeBroadcaster.broadcast(eventId, 2)
        awaitSize(healthy, 2)
        assertTrue(healthy[1].contains("\"marker\":2"))

        EventChangeBroadcaster.unsubscribe(dead)
        EventChangeBroadcaster.unsubscribe(alive)
    }

    companion object {

        private val awaitTimeout = 5.seconds
        private val quietPeriod = 200.milliseconds

        fun concurrentList(): MutableList<String> = Collections.synchronizedList(mutableListOf())

        suspend fun awaitSize(received: List<String>, size: Int, timeout: Duration = awaitTimeout) =
            awaitCondition(timeout) { received.size >= size }

        suspend fun awaitCondition(timeout: Duration = awaitTimeout, condition: () -> Boolean) {
            withTimeout(timeout) {
                while (!condition()) {
                    delay(5)
                }
            }
        }
    }
}
