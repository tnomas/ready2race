package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingWsMessage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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

class TimingBroadcasterTest {

    @Test
    fun broadcastReachesOnlySubscribersOfSameEvent() = runBlocking {
        val eventA = UUID.randomUUID()
        val eventB = UUID.randomUUID()
        val receivedA = concurrentList()
        val receivedB = concurrentList()

        val subA = TimingBroadcaster.subscribe(eventA) { receivedA.add(it) }
        val subB = TimingBroadcaster.subscribe(eventB) { receivedB.add(it) }

        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))

        awaitSize(receivedA, 1)
        assertEquals(1, receivedA.size)
        assertTrue(receivedA[0].contains("timeMarkRetracted"))
        assertEquals(0, receivedB.size)

        TimingBroadcaster.unsubscribe(subA)
        TimingBroadcaster.unsubscribe(subB)

        // The per-event entry is dropped together with its last subscriber.
        assertNull(TimingBroadcaster.subscriptionCount(eventA))
        assertNull(TimingBroadcaster.subscriptionCount(eventB))

        TimingBroadcaster.broadcast(eventA, TimingWsMessage.TimeMarkRetracted(UUID.randomUUID()))
        delay(quietPeriod)
        assertEquals(1, receivedA.size)
    }

    @Test
    fun messagesAreDeliveredInBroadcastOrder() = runBlocking {
        val eventId = UUID.randomUUID()
        val received = concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        val ids = List(10) { UUID.randomUUID() }
        ids.forEach { TimingBroadcaster.broadcast(eventId, TimingWsMessage.TimeMarkRetracted(it)) }

        awaitSize(received, ids.size)
        ids.forEachIndexed { index, id ->
            assertTrue(received[index].contains(id.toString()), "message $index was delivered out of order")
        }

        TimingBroadcaster.unsubscribe(subscription)
    }

    @Test
    fun failingSubscriberIsDroppedWhileOthersKeepReceiving() = runBlocking {
        val eventId = UUID.randomUUID()
        val healthy = concurrentList()
        val failed = CompletableDeferred<Unit>()
        var deadCalls = 0

        val dead = TimingBroadcaster.subscribe(eventId) {
            deadCalls++
            failed.complete(Unit)
            // Simulates a websocket session whose send fails (client gone).
            throw IllegalStateException("socket closed")
        }
        val alive = TimingBroadcaster.subscribe(eventId) { healthy.add(it) }
        assertEquals(2, TimingBroadcaster.subscriptionCount(eventId))

        TimingBroadcaster.broadcast(eventId, TimingWsMessage.StationsChanged)
        withTimeout(awaitTimeout) { failed.await() }
        awaitSize(healthy, 1)

        // The failing subscriber is removed, the healthy one stays registered.
        awaitCondition { TimingBroadcaster.subscriptionCount(eventId) == 1 }
        assertEquals(1, TimingBroadcaster.subscriptionCount(eventId))

        TimingBroadcaster.broadcast(eventId, TimingWsMessage.StationsChanged)
        awaitSize(healthy, 2)
        assertEquals(2, healthy.size)
        assertEquals(1, deadCalls)

        TimingBroadcaster.unsubscribe(dead)
        TimingBroadcaster.unsubscribe(alive)
    }

    @Test
    fun concurrentSubscribeRacingUnsubscribeNeverOrphansTheNewSubscriber() = runBlocking(Dispatchers.Default) {
        // Regression test for a lost-subscription race: subscribing used to do
        // computeIfAbsent(eventId){ newKeySet() }.add(subscription) as two separate steps, so a
        // concurrent unsubscribe() of the event's only other subscriber could observe the
        // now-empty set in between and drop the whole map entry, orphaning the just-added
        // subscription (it would never receive another broadcast). Repeated with real parallelism
        // (Dispatchers.Default) to actually exercise the interleaving.
        repeat(500) {
            val eventId = UUID.randomUUID()
            val departing = TimingBroadcaster.subscribe(eventId) { }

            val newSubscription = CompletableDeferred<TimingBroadcaster.TimingSubscription>()
            val received = CompletableDeferred<String>()

            val subscribeJob = launch {
                newSubscription.complete(
                    TimingBroadcaster.subscribe(eventId) { msg -> received.complete(msg) }
                )
            }
            val unsubscribeJob = launch {
                TimingBroadcaster.unsubscribe(departing)
            }
            subscribeJob.join()
            unsubscribeJob.join()

            TimingBroadcaster.broadcast(eventId, TimingWsMessage.StationsChanged)
            withTimeout(awaitTimeout) { received.await() }

            TimingBroadcaster.unsubscribe(newSubscription.await())
        }
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
