package de.lambda9.ready2race.backend.app.eventInfo.boundary

import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.consumeEach
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

typealias EventChangeSubscriber = suspend (String) -> Unit

/**
 * Verteilt den Änderungsmarker einer Veranstaltung ([EventChangeMarker]) an alle verbundenen
 * Anzeige-Clients (Kanal `/api/ws/event/{eventId}/info`, siehe `Sockets.kt`).
 *
 * Die Nachricht ist bewusst nur ein Fingerzeig — `{"type":"changed","marker":<n>}` — und trägt
 * keine Nutzdaten: die Anzeigen laden ihre Daten weiterhin über ihre bestehenden (gehärteten,
 * gecachten) HTTP-Endpunkte. Der Kanal macht Abrufe seltener, nie reicher.
 *
 * Jeder Abonnent hat eine CONFLATED-Queue mit eigenem Schreiber: mehrere Marker in kurzer Folge
 * fallen serverseitig auf den jüngsten Stand zusammen (mehr als „es hat sich etwas geändert"
 * gibt es hier nicht zu sagen), und ein langsamer Client kann weder die anderen Abonnenten noch
 * den auslösenden Request aufhalten. Scheitert die Zustellung, fliegt der Abonnent — Clients
 * erholen sich durch Reconnect samt Neuladen.
 */
object EventChangeBroadcaster {

    private val logger = KotlinLogging.logger {}

    private val scope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("event-change-broadcaster"))

    private val subscribers = ConcurrentHashMap<UUID, MutableSet<EventChangeSubscription>>()

    /**
     * Der Marker ist ein Long, sonst nichts — von Hand gebaut statt über Jackson, damit die
     * Nachricht keinerlei Serialisierungsfehlerpfad hat.
     */
    fun message(marker: Long): String = """{"type":"changed","marker":$marker}"""

    class EventChangeSubscription internal constructor(
        internal val eventId: UUID,
    ) {
        // CONFLATED: nur der jüngste Markerstand zählt, trySend kann nie „voll" melden.
        internal val queue = Channel<Long>(Channel.CONFLATED)

        // Synchron in [subscribe] gesetzt, bevor die (lazy gestartete) Schreiber-Coroutine je
        // läuft — beim [unsubscribe] ist das Feld deshalb immer initialisiert.
        internal lateinit var job: Job
    }

    /**
     * Registriert [subscriber] für [eventId] und startet dessen Schreiber. Der Aufrufer muss die
     * Subscription am Sitzungsende an [unsubscribe] geben.
     */
    fun subscribe(eventId: UUID, subscriber: EventChangeSubscriber): EventChangeSubscription {
        val subscription = EventChangeSubscription(eventId)

        // Anlegen und Einfügen atomar: computeIfAbsent-dann-add ließe ein nebenläufiges
        // unsubscribe() dazwischen die leere Menge abräumen — die frische Subscription hinge dann
        // an einer verwaisten Menge und bekäme nie wieder einen Broadcast.
        subscribers.compute(eventId) { _, current ->
            (current ?: ConcurrentHashMap.newKeySet()).apply { add(subscription) }
        }

        subscription.job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                subscription.queue.consumeEach { marker -> subscriber(message(marker)) }
            } catch (ex: CancellationException) {
                throw ex
            } catch (ex: Exception) {
                // Auch der normale Verbindungsabriss landet hier (send auf toter Session) —
                // deshalb kein warn samt Stacktrace für den Alltagsfall.
                logger.debug(ex) { "Event-change subscriber of event $eventId dropped" }
                unsubscribe(subscription)
            }
        }
        subscription.job.start()

        return subscription
    }

    /** Für Tests sichtbar: Abonnenten von [eventId], `null` ohne Eintrag. */
    internal fun subscriptionCount(eventId: UUID): Int? = subscribers[eventId]?.size

    fun unsubscribe(subscription: EventChangeSubscription) {
        subscribers.compute(subscription.eventId) { _, current ->
            current?.apply { remove(subscription) }?.takeIf { it.isNotEmpty() }
        }
        subscription.queue.close()
        // Ein Schreiber, der gerade an eine hängende (noch nicht als tot erkannte) Session
        // sendet, soll das unsubscribe nicht überleben.
        subscription.job.cancel()
    }

    /**
     * Stellt [marker] allen Abonnenten von [eventId] zu. Suspendiert nie und scheitert nie —
     * gefahrlos aus einem Request-Thread aufrufbar (vgl.
     * [de.lambda9.ready2race.backend.calls.responses.AfterCommit]).
     */
    fun broadcast(eventId: UUID, marker: Long) {
        val current = subscribers[eventId]
        if (current.isNullOrEmpty()) return

        current.forEach { subscription ->
            val result = subscription.queue.trySend(marker)
            // CONFLATED kennt kein „voll": nur eine bereits geschlossene Queue kann scheitern.
            if (result.isClosed) {
                unsubscribe(subscription)
            }
        }
    }
}
