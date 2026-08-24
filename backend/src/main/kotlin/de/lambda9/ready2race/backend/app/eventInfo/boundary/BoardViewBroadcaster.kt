package de.lambda9.ready2race.backend.app.eventInfo.boundary

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardViewDto
import de.lambda9.ready2race.backend.calls.serialization.jsonMapper
import de.lambda9.tailwind.core.KIO.Companion.unsafeRunSync
import de.lambda9.tailwind.core.extensions.exit.fold
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
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

typealias BoardViewSubscriber = suspend (String) -> Unit

/**
 * Verteilt die FERTIGE Board-Ansicht ([BoardViewDto]) an alle verbundenen Anzeigen eines Boards
 * (Kanal `/api/ws/event/{eventId}/board/{boardId}`, siehe `Sockets.kt`).
 *
 * Der Unterschied zum [EventChangeBroadcaster] ist der ganze Zweck dieses Kanals: der dortige
 * Fingerzeig (`{"type":"changed","marker":n}`) spart nur den Takt, nicht den HTTP-Nachschlag —
 * die Anzeige lädt auf den Fingerzeig hin erst noch. Für ein Livestream-Overlay ist genau dieser
 * Nachschlag die spürbare Verzögerung: Bild und Einblendung sollen im selben Moment umspringen,
 * in dem die Zeit fällt. Deshalb trägt DIESER Kanal dieselbe Nutzlast wie der HTTP-Endpunkt
 * (`GET /event/{eventId}/info/board/{boardId}`) — die Anzeige setzt sie direkt ein.
 *
 * Damit ist der Kanal nicht mehr öffentlich, sondern genauso geschützt wie sein HTTP-Zwilling
 * (Sitzung mit Board-Leserecht ODER Board-Geräte-Token); die Prüfung steht in `Sockets.kt`.
 *
 * Aufbau, von außen nach innen:
 *  * Je BOARD ein Kanal ([BoardChannel]) mit einer CONFLATED-Auslöserqueue und GENAU EINER
 *    Render-Coroutine. Die Ansicht wird also einmal je Board gebaut und dann verteilt, nicht
 *    einmal je Abonnent — vor einem Board können zwei Bildschirme und ein Streaming-Rechner
 *    hängen, die Rechnung ist dieselbe.
 *  * Je ABONNENT eine CONFLATED-Queue mit eigener Schreiber-Coroutine (Muster aus
 *    [EventChangeBroadcaster]). Ein hängender Client staut nichts auf: weil jede Nachricht den
 *    VOLLSTÄNDIGEN Stand trägt, ist der jüngste immer auch der einzige, der ihn interessiert —
 *    CONFLATED ist hier nicht nur Notbremse, sondern fachlich richtig. Weder die anderen
 *    Abonnenten noch der auslösende Request warten auf ihn.
 *  * Gerechnet wird nur für Boards, die auch jemand abonniert hat: ohne Abonnent gibt es keinen
 *    Kanal und damit keine Render-Coroutine. Der Aufbau einer Ansicht ist nicht gratis (mehrere
 *    Abfragen, Vereinsnamen, Bedingungen), und die meisten Boards einer Veranstaltung hängen an
 *    keinem Bildschirm.
 *
 * Ausgelöst wird alles an genau einer Stelle: [EventChangeMarker.bump] — dieselbe Quelle, die
 * schon den Änderungsmarker hochzählt und die Zwischenspeicher entwertet. Kein einziger
 * Schreibpfad muss von diesem Kanal wissen.
 */
object BoardViewBroadcaster {

    private val logger = KotlinLogging.logger {}

    /**
     * Sammelfenster vor dem Bau der Ansicht. Ein Massen-Ereignis (eine Welle wertet acht Boote)
     * bumpt im Sekundenbruchteil mehrfach; ohne Fenster baute die Render-Coroutine die Ansicht
     * mehrmals hintereinander neu, für ein Ergebnis, das der Client ohnehin nur einmal sieht.
     * Bewusst kurz — der Kanal ist für die Unmittelbarkeit da, und ein Zehntelsekunde ist im
     * Livestream keine.
     */
    private const val BURST_WINDOW_MILLIS = 150L

    // Spiegelt die Serialisierung von plugins/Serialization.kt (NON_ABSENT sticht das dortige
    // NON_NULL), damit die gepushte Nutzlast Feld für Feld so aussieht wie die HTTP-Antwort
    // desselben DTOs — die Anzeige setzt beide durch dieselbe Zuweisung ein. `copy` lässt den
    // geteilten `jsonMapper` unberührt.
    private val mapper: ObjectMapper = jsonMapper.copy()
        .setSerializationInclusion(JsonInclude.Include.NON_ABSENT)

    private val scope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("board-view-broadcaster"))

    /** Die Kanäle, streng je Board — Schlüssel ist die Board-Kennung. */
    private val channels = ConcurrentHashMap<UUID, BoardChannel>()

    /**
     * Welche Boards einer Veranstaltung gerade einen Kanal haben. Nur damit [broadcast] die
     * betroffenen Boards findet, ohne über alle Kanäle zu laufen; gepflegt ausschließlich
     * innerhalb der [channels]-`compute`-Blöcke (siehe dort).
     */
    private val boardsByEvent = ConcurrentHashMap<UUID, MutableSet<UUID>>()

    /**
     * Die Nachricht des Kanals: ein Umschlag mit Typ und der kompletten Ansicht.
     *
     * Der Typ steht dabei nicht zum Spaß — er lässt spätere Nachrichtenarten zu, ohne die
     * Anzeigen im Feld zu brechen (die verwerfen alles Unbekannte, siehe `boardViewPush.ts`).
     */
    private data class BoardViewMessage(
        val type: String = "boardView",
        val view: BoardViewDto,
    )

    /** Für Tests und den Begrüßungsrahmen sichtbar: die fertige Nachricht zu einer Ansicht. */
    fun message(view: BoardViewDto): String = mapper.writeValueAsString(BoardViewMessage(view = view))

    class BoardViewSubscription internal constructor(
        internal val eventId: UUID,
        internal val boardId: UUID,
    ) {
        // CONFLATED: jede Nachricht trägt den vollständigen Stand, ältere sind damit wertlos —
        // ein langsamer Client überspringt Zwischenstände statt aufzulaufen.
        internal val queue = Channel<String>(Channel.CONFLATED)

        // Synchron in [subscribe] gesetzt, bevor die (lazy gestartete) Coroutine je läuft.
        internal lateinit var job: Job
    }

    /**
     * Ein Board mit mindestens einem Abonnenten: die Auslöserqueue, die Abonnenten und die eine
     * Render-Coroutine.
     *
     * [env] kommt vom ersten Abonnenten. Das ist keine Abkürzung: die Ktor-Anwendung hält genau
     * eine Umgebung, jeder Socket bekommt dieselbe gereicht.
     */
    private class BoardChannel(
        val env: JEnv,
        val eventId: UUID,
        val boardId: UUID,
    ) {
        val subscribers: MutableSet<BoardViewSubscription> = ConcurrentHashMap.newKeySet()

        // CONFLATED: „es gibt etwas Neues zu bauen" ist nicht zählbar; zehn Auslöser in Folge
        // ergeben einen Bau.
        val dirty = Channel<Unit>(Channel.CONFLATED)

        lateinit var job: Job
    }

    /**
     * Registriert [subscriber] für [boardId] und startet dessen Schreiber; legt bei Bedarf den
     * Kanal des Boards samt Render-Coroutine an. Der Aufrufer muss die Subscription am
     * Sitzungsende an [unsubscribe] geben.
     */
    fun subscribe(
        env: JEnv,
        eventId: UUID,
        boardId: UUID,
        subscriber: BoardViewSubscriber,
    ): BoardViewSubscription {
        val subscription = BoardViewSubscription(eventId, boardId)
        subscription.job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                subscription.queue.consumeEach { subscriber(it) }
            } catch (ex: CancellationException) {
                throw ex
            } catch (ex: Exception) {
                // Auch der normale Verbindungsabriss landet hier (send auf toter Session) —
                // deshalb kein warn samt Stacktrace für den Alltagsfall.
                logger.debug(ex) { "Board-view subscriber of board $boardId dropped" }
                unsubscribe(subscription)
            }
        }

        // Der Kanal wird VOLLSTÄNDIG (samt lazy gestarteter Render-Coroutine) gebaut, bevor er in
        // die Karte geht. Ihn erst danach zu vervollständigen, ließe ein nebenläufiges
        // unsubscribe() auf ein noch nicht gesetztes `job` treffen.
        val fresh = BoardChannel(env, eventId, boardId)
        fresh.job = scope.launch(start = CoroutineStart.LAZY) { renderLoop(fresh) }

        val channel = channels.compute(boardId) { _, current ->
            (current ?: fresh).apply {
                subscribers.add(subscription)
                // Innerhalb desselben compute-Blocks gepflegt, damit „Kanal da" und „in
                // boardsByEvent vermerkt" nie auseinanderfallen — sonst bliebe ein Board mit
                // Abonnenten von [broadcast] unbemerkt. Die Schachtelung geht immer nur in diese
                // Richtung (channels → boardsByEvent), nie umgekehrt.
                boardsByEvent.compute(eventId) { _, boards ->
                    (boards ?: ConcurrentHashMap.newKeySet()).apply { add(boardId) }
                }
            }
        }!!

        if (channel === fresh) {
            channel.job.start()
        } else {
            // Der Kanal stand schon: die eben gebaute Hülle wieder abräumen.
            fresh.job.cancel()
            fresh.dirty.close()
        }

        subscription.job.start()
        return subscription
    }

    /** Für Tests sichtbar: Abonnenten von [boardId], `null` ohne Kanal. */
    internal fun subscriptionCount(boardId: UUID): Int? = channels[boardId]?.subscribers?.size

    fun unsubscribe(subscription: BoardViewSubscription) {
        subscription.queue.close()
        // Ein Schreiber, der gerade an eine hängende (noch nicht als tot erkannte) Session
        // sendet, soll das unsubscribe nicht überleben.
        subscription.job.cancel()

        channels.compute(subscription.boardId) { _, current ->
            if (current == null) return@compute null
            current.subscribers.remove(subscription)
            if (current.subscribers.isNotEmpty()) return@compute current

            // Letzter Abonnent weg: der Kanal verschwindet mitsamt seiner Render-Coroutine. Ab
            // jetzt wird für dieses Board nichts mehr gerechnet — das ist die Zusage „nur für
            // Boards, die auch jemand ansieht".
            current.job.cancel()
            current.dirty.close()
            boardsByEvent.compute(subscription.eventId) { _, boards ->
                boards?.apply { remove(subscription.boardId) }?.takeIf { it.isNotEmpty() }
            }
            null
        }
    }

    /**
     * Meldet allen abonnierten Boards von [eventId], dass sich etwas geändert hat.
     *
     * Suspendiert nie und scheitert nie — gefahrlos aus einem Request-Thread aufrufbar (vgl.
     * [de.lambda9.ready2race.backend.calls.responses.AfterCommit]). Gebaut wird die Ansicht erst
     * in der Render-Coroutine des jeweiligen Boards, der auslösende Request wartet auf nichts.
     */
    fun broadcast(eventId: UUID) {
        val boards = boardsByEvent[eventId] ?: return
        boards.forEach { boardId -> channels[boardId]?.dirty?.trySend(Unit) }
    }

    /**
     * Wie [broadcast], aber für ein einzelnes Board — für Änderungen, die genau eine Anzeige
     * betreffen und deshalb den Änderungsmarker der Veranstaltung nicht hochzählen (die
     * Board-Konfiguration selbst).
     */
    fun broadcastBoard(boardId: UUID) {
        channels[boardId]?.dirty?.trySend(Unit)
    }

    /**
     * Die aktuelle Ansicht als fertige Nachricht, oder `null`, wenn sie sich nicht bauen ließ
     * (unbekanntes Board, Datenbankfehler).
     *
     * Für den Begrüßungsrahmen beim Verbinden: ein Client, der eben erst (oder nach einem
     * Funkloch wieder) verbunden ist, bekommt den vollen Stand sofort — deshalb braucht er nach
     * dem Verbinden auch keinen HTTP-Nachschlag. Der Zwischenspeicher in [BoardService] trägt
     * dabei die Kosten, wenn mehrere Bildschirme gleichzeitig hochfahren.
     */
    fun currentView(env: JEnv, eventId: UUID, boardId: UUID): String? =
        render(env, eventId, boardId)

    private suspend fun renderLoop(channel: BoardChannel) {
        channel.dirty.consumeEach {
            // Sammelfenster: alles, was in diesen Millisekunden noch hereinkommt, fällt durch
            // die CONFLATED-Queue ohnehin auf ein Signal zusammen — das eine wartende holen wir
            // gleich mit ab, sonst bauten wir unmittelbar danach ein zweites Mal dasselbe.
            delay(BURST_WINDOW_MILLIS)
            channel.dirty.tryReceive()

            val json = render(channel.env, channel.eventId, channel.boardId) ?: return@consumeEach

            channel.subscribers.forEach { subscription ->
                // CONFLATED kennt kein „voll": nur eine bereits geschlossene Queue kann scheitern.
                if (subscription.queue.trySend(json).isClosed) {
                    unsubscribe(subscription)
                }
            }
        }
    }

    private fun render(env: JEnv, eventId: UUID, boardId: UUID): String? =
        BoardService.getBoardView(eventId, boardId).unsafeRunSync(env).fold(
            onSuccess = { response ->
                try {
                    message(response.dto)
                } catch (ex: Exception) {
                    logger.error(ex) { "Failed to serialize board view of board $boardId, dropping it" }
                    null
                }
            },
            onError = { error ->
                // Unbekanntes Board, Veranstaltung gelöscht: kein Grund zu lärmen, der Kanal
                // verschwindet mit seinem letzten Abonnenten von selbst.
                logger.debug { "Skipping board-view push for board $boardId: $error" }
                null
            },
            onDefect = { defect ->
                logger.warn(defect) { "Failed to build board view of board $boardId" }
                null
            },
        )
}
