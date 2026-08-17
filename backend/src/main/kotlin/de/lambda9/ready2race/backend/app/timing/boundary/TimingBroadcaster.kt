package de.lambda9.ready2race.backend.app.timing.boundary

import com.fasterxml.jackson.annotation.JsonSubTypes
import com.fasterxml.jackson.annotation.JsonTypeInfo
import de.lambda9.ready2race.backend.app.timing.entity.TimeMarkDto
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import io.github.oshai.kotlinlogging.KotlinLogging
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes(
    JsonSubTypes.Type(TimingWsMessage.TimeMarkCreated::class, name = "timeMarkCreated"),
    JsonSubTypes.Type(TimingWsMessage.TimeMarkRetracted::class, name = "timeMarkRetracted"),
    JsonSubTypes.Type(TimingWsMessage.AssignmentChanged::class, name = "assignmentChanged"),
    JsonSubTypes.Type(TimingWsMessage.StationsChanged::class, name = "stationsChanged"),
)
sealed class TimingWsMessage {
    data class TimeMarkCreated(val mark: TimeMarkDto) : TimingWsMessage()
    data class TimeMarkRetracted(val id: UUID) : TimingWsMessage()
    data class AssignmentChanged(val timeMark: UUID, val competitionMatchTeam: UUID?) : TimingWsMessage()
    data object StationsChanged : TimingWsMessage()
}

typealias TimingSubscriber = suspend (String) -> Unit

object TimingBroadcaster {

    private val logger = KotlinLogging.logger {}
    private val subscribers = ConcurrentHashMap<UUID, MutableSet<TimingSubscriber>>()

    fun subscribe(eventId: UUID, subscriber: TimingSubscriber): TimingSubscriber {
        subscribers.computeIfAbsent(eventId) { ConcurrentHashMap.newKeySet() }.add(subscriber)
        return subscriber
    }

    fun unsubscribe(eventId: UUID, subscriber: TimingSubscriber) {
        subscribers[eventId]?.remove(subscriber)
    }

    suspend fun broadcast(eventId: UUID, message: TimingWsMessage) {
        val json = jsonMapper.writeValueAsString(message)
        subscribers[eventId]?.forEach { subscriber ->
            try {
                subscriber(json)
            } catch (ex: Exception) {
                logger.warn(ex) { "Failed to deliver timing ws message, dropping subscriber" }
                subscribers[eventId]?.remove(subscriber)
            }
        }
    }
}
