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
    JsonSubTypes.Type(TimingWsMessage.MatchesChanged::class, name = "matchesChanged"),
    JsonSubTypes.Type(TimingWsMessage.SequenceChanged::class, name = "sequenceChanged"),
    JsonSubTypes.Type(TimingWsMessage.OfficialTimeChanged::class, name = "officialTimeChanged"),
    JsonSubTypes.Type(TimingWsMessage.TimesDeleted::class, name = "timesDeleted"),
    JsonSubTypes.Type(TimingWsMessage.SettingsChanged::class, name = "settingsChanged"),
    JsonSubTypes.Type(TimingWsMessage.AttemptRetracted::class, name = "attemptRetracted"),
    JsonSubTypes.Type(TimingWsMessage.FalseStart::class, name = "falseStart"),
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

    /**
     * Die Partienmenge der Posten-Startliste hat sich geändert: ein Lauf ist dazugekommen
     * (Rundenerzeugung, Folgerunden-Automatik), weggefallen (Runde gelöscht, Freilos) oder
     * verschoben worden (Zeitplan-Slot, Startzeit, Startnummern) - oder der wirksame Zeitnahmetyp
     * einer Partie ist ein anderer.
     *
     * Reiner Auslöser ohne Rumpf, genau wie [StationsChanged]: die Startliste ist eine gerechnete
     * Sicht (Sortierung über die Rundenkette, aufgelöster Typ, Zeitnahme-Fortschritt je Team), und
     * sie als Nachrichtenrumpf zu verschicken hieße, diese Rechnung an jeder Schreibstelle noch
     * einmal anzustoßen. Die Boards holen sich stattdessen `GET /timing/matches` - entprellt, ein
     * Schub aus einer Rundenerzeugung kostet damit eine Anfrage.
     *
     * Vorher erreichte eine solche Änderung die Boards gar nicht: die übrigen Nachrichten taugen
     * nur als Auffrischungs-Trigger für Partien, die es schon gibt (eine Marke, eine Zuordnung, eine
     * Sequenz setzt eine Partie voraus). Ein frisch erzeugter Lauf blieb bis zum nächsten Neuladen
     * unsichtbar.
     */
    data object MatchesChanged : TimingWsMessage()
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

    /**
     * Ein GANZER Versuch wurde zurückgenommen („Start zurücknehmen", TimingService.retractMatchAttempt)
     * — eine der beiden Fehlstart-Gesten. Eigene Nachricht zusätzlich zu den einzelnen
     * [TimeMarkRetracted]-Echos, weil die auch bei der Einzelmarken-Korrektur in der Zeitenliste
     * feuern und die Boards den Fehlstart-Ton sonst nicht vom Aufräumen unterscheiden könnten.
     * Trägt die Partie und die Teams der tatsächlich zurückgenommenen Marken (kann leer sein,
     * wenn nur noch der Ist-Start-Stempel fiel) — die Boards prüfen damit, ob ihre gerade
     * geführte Sequenz betroffen ist.
     */
    data class AttemptRetracted(
        val competitionSetupMatch: UUID,
        val competitionMatchTeams: List<UUID>,
    ) : TimingWsMessage()

    /**
     * AUSDRÜCKLICHER Fehlstart: der Startposten hat den Lauf zurückgerufen
     * (TimingService.falseStart). Mechanisch passiert dabei nichts Neues - die laufende Sequenz
     * wird abgebrochen und der Versuch zurückgenommen, beide Wege gab es schon -, aber die ABSICHT
     * ist eine andere, und genau die trägt diese Nachricht.
     *
     * Warum sie neben [AttemptRetracted] steht und nicht in ihr aufgeht: [AttemptRetracted] feuert
     * auch beim stillen Aufräumen („Start zurücknehmen und neu starten" nach einer verpatzten
     * Erfassung), und ein Aufräumen darf die Anzeigen am Steg nicht rot blinken lassen. Umgekehrt
     * bleibt [AttemptRetracted] bei einem Fehlstart erhalten - die Boards, die daran ihre
     * Markenlisten und ihren Fehlstart-Ton hängen, merken davon nichts.
     *
     * Trägt nur die betroffene Partie: die Anzeige braucht die Antwort auf „bin ich gemeint?", und
     * das ist eine Partie-Frage (die Anzeige zeigt einen Lauf, nicht ein Boot). Die Teams stehen
     * ohnehin schon in der [AttemptRetracted] derselben Rücknahme.
     */
    data class FalseStart(
        val competitionSetupMatch: UUID,
    ) : TimingWsMessage()
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
