package de.lambda9.ready2race.backend.app.timing.boundary

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import com.fasterxml.jackson.databind.ObjectMapper
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimeMarkDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingSequenceDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingSettingsDto
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(TimingWsMessage.TimeMarkCreated::class, name = "timeMarkCreated"),
    JsonSubTypes.Type(TimingWsMessage.TimeMarkRetracted::class, name = "timeMarkRetracted"),
    JsonSubTypes.Type(TimingWsMessage.TimeMarkReactivated::class, name = "timeMarkReactivated"),
    JsonSubTypes.Type(TimingWsMessage.AssignmentChanged::class, name = "assignmentChanged"),
    JsonSubTypes.Type(TimingWsMessage.StationsChanged::class, name = "stationsChanged"),
    JsonSubTypes.Type(TimingWsMessage.SequenceChanged::class, name = "sequenceChanged"),
    JsonSubTypes.Type(TimingWsMessage.OfficialTimeChanged::class, name = "officialTimeChanged"),
    JsonSubTypes.Type(TimingWsMessage.TimesDeleted::class, name = "timesDeleted"),
    JsonSubTypes.Type(TimingWsMessage.SettingsChanged::class, name = "settingsChanged"),
)
sealed class TimingWsMessage {
    data class TimeMarkCreated(val mark: TimeMarkDto) : TimingWsMessage()
    data class TimeMarkRetracted(val id: UUID) : TimingWsMessage()

    /** Eine zurückgenommene Marke ist wieder ACTIVE - das Gegenstück zu [TimeMarkRetracted]. */
    data class TimeMarkReactivated(val id: UUID) : TimingWsMessage()
    data class AssignmentChanged(
        val timeMark: UUID,
        // Always emitted, even when null (a detach): the mapper below uses NON_ABSENT, which would
        // otherwise drop a null competitionMatchTeam entirely and leave clients unable to tell a
        // detach from a message that doesn't carry this field at all.
        @field:JsonInclude(JsonInclude.Include.ALWAYS)
        val competitionMatchTeam: UUID?,
    ) : TimingWsMessage()
    data object StationsChanged : TimingWsMessage()
    data class SequenceChanged(val sequence: TimingSequenceDto) : TimingWsMessage()

    /**
     * Official times that changed - recomputed, overridden, pushed, or flagged dirty by a timing
     * edit. Carries a list because a recompute or a batch push changes many rows at once, and one
     * message per row would flood every connected board.
     */
    data class OfficialTimeChanged(val officialTimes: List<OfficialTimeDto>) : TimingWsMessage()

    /** Ids of time marks that were physically deleted by the explicit "delete times" action. */
    data class TimesDeleted(val timeMarks: List<UUID>) : TimingWsMessage()

    /**
     * Die Zeitnahme-Einstellungen der Veranstaltung haben sich geändert (Schalter „Automatische
     * Übernahme" oder Genauigkeit). Trägt den kompletten neuen Stand, damit Leitstand und Boards
     * ihre Anzeige sofort umstellen können, ohne den Settings-GET erneut zu rufen.
     */
    data class SettingsChanged(val settings: TimingSettingsDto) : TimingWsMessage()
}

typealias TimingSubscriber = suspend (String) -> Unit

/**
 * Fans timing updates out to all websocket sessions subscribed to an event.
 *
 * Every subscriber gets its own bounded queue that is drained by a single writer coroutine, so
 * messages are delivered to each client in the order they were broadcast and a slow or stalled
 * client can never delay the others (nor the request that triggered the broadcast). A subscriber
 * that cannot keep up with [QUEUE_CAPACITY] pending messages, or whose sink fails, is dropped;
 * clients recover by reconnecting and refetching `/timing/state`.
 */
object TimingBroadcaster {

    private const val QUEUE_CAPACITY = 64

    private val logger = KotlinLogging.logger {}

    // Mirrors the serialization inclusion of plugins/Serialization.kt (NON_ABSENT supersedes the
    // NON_NULL set there) so websocket payloads look exactly like the HTTP responses of the same
    // DTOs. `copy` keeps the shared `jsonMapper` untouched.
    private val mapper: ObjectMapper = jsonMapper.copy()
        .setSerializationInclusion(JsonInclude.Include.NON_ABSENT)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("timing-broadcaster"))

    private val subscribers = ConcurrentHashMap<UUID, MutableSet<TimingSubscription>>()

    class TimingSubscription internal constructor(
        internal val eventId: UUID,
    ) {
        internal val queue = Channel<String>(QUEUE_CAPACITY)

        // Assigned synchronously in [subscribe] before the writer coroutine is started (it is
        // launched lazily so this happens-before its body ever runs), so it is always initialized
        // by the time [unsubscribe] can observe this subscription.
        internal lateinit var job: Job
    }

    /**
     * Registers [subscriber] for [eventId] and starts its writer coroutine. Callers must pass the
     * returned subscription to [unsubscribe] when the session ends.
     */
    fun subscribe(eventId: UUID, subscriber: TimingSubscriber): TimingSubscription {
        val subscription = TimingSubscription(eventId)

        // Adding must happen atomically with creating the per-event set: computeIfAbsent-then-add
        // would let a concurrent unsubscribe() observe and remove an empty set in between, so this
        // subscription is added to an orphaned set that never receives broadcasts again.
        subscribers.compute(eventId) { _, current ->
            (current ?: ConcurrentHashMap.newKeySet()).apply { add(subscription) }
        }

        subscription.job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                subscription.queue.consumeEach { subscriber(it) }
            } catch (ex: ClosedSendChannelException) {
                // The client's websocket sink is already closed (e.g. a disconnect racing the
                // broadcast). This is a normal disconnect, not a failure worth logging.
                unsubscribe(subscription)
            } catch (ex: CancellationException) {
                throw ex
            } catch (ex: Exception) {
                logger.warn(ex) { "Failed to deliver timing ws message for event $eventId, dropping subscriber" }
                unsubscribe(subscription)
            }
        }
        subscription.job.start()

        return subscription
    }

    /** Visible for tests: number of subscribers of [eventId], or `null` if the event has no entry. */
    internal fun subscriptionCount(eventId: UUID): Int? = subscribers[eventId]?.size

    fun unsubscribe(subscription: TimingSubscription) {
        subscribers.compute(subscription.eventId) { _, current ->
            current?.apply { remove(subscription) }?.takeIf { it.isNotEmpty() }
        }
        subscription.queue.close()
        // Guards against a writer that is stuck sending to a stalled (not yet detected as closed)
        // session from outliving the unsubscribe call.
        subscription.job.cancel()
    }

    /**
     * Enqueues [message] for every subscriber of [eventId]. Never suspends and never fails, so it
     * is safe to call from a request thread (see [de.lambda9.ready2race.backend.calls.responses.AfterCommit]).
     */
    fun broadcast(eventId: UUID, message: TimingWsMessage) {
        val current = subscribers[eventId]
        if (current.isNullOrEmpty()) return

        val json = try {
            mapper.writeValueAsString(message)
        } catch (ex: Exception) {
            logger.error(ex) { "Failed to serialize timing ws message ${message::class.simpleName}, dropping it" }
            return
        }

        current.forEach { subscription ->
            val result = subscription.queue.trySend(json)
            when {
                result.isSuccess -> Unit
                result.isClosed -> unsubscribe(subscription)
                else -> {
                    logger.warn { "Timing ws subscriber of event $eventId is not keeping up, dropping subscriber" }
                    unsubscribe(subscription)
                }
            }
        }
    }
}
