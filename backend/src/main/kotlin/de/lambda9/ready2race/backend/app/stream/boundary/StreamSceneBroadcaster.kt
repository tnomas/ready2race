package de.lambda9.ready2race.backend.app.stream.boundary

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneViewDto
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
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import java.time.Duration
import java.time.LocalDateTime
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

typealias StreamSceneSubscriber = suspend (String) -> Unit

/**
 * Verteilt den FERTIGEN Szenenstand ([StreamSceneViewDto]) an alle Bühnen und Panels einer Szene
 * (Kanal `/api/ws/event/{eventId}/stream/{sceneId}`, siehe `Sockets.kt`).
 *
 * Aufbau und Begründung sind die des [de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardViewBroadcaster]
 * — bewusst dieselbe Bauart, nicht eine zweite:
 *  * Je SZENE ein Kanal ([SceneChannel]) mit einer CONFLATED-Auslöserqueue und GENAU EINER
 *    Render-Coroutine. Der Stand wird einmal je Szene gebaut und dann verteilt, nicht einmal je
 *    Abonnent — an einer Szene hängen Bühne (Wirecast) und Kontroll-Panel gleichzeitig, und
 *    beide sollen per Konstruktion denselben Stand sehen (Spec-Entscheidung 3).
 *  * Je ABONNENT eine CONFLATED-Queue mit eigener Schreiber-Coroutine. Jede Nachricht trägt den
 *    vollständigen Stand, ältere sind damit wertlos — ein hängender Client überspringt
 *    Zwischenstände, statt die anderen aufzuhalten.
 *  * Gerechnet wird nur für Szenen, die auch jemand abonniert hat: ohne Abonnent kein Kanal,
 *    keine Render-Coroutine, kein Wecker.
 *
 * Ausgelöst wird von zwei Seiten:
 *  * [broadcast] aus [de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker.bump] —
 *    dieselbe eine Quelle, an der auch der Board-Kanal hängt (Start, Zwischenzeit, Zieleinlauf,
 *    Zustandswechsel, Sequenzstart);
 *  * [broadcastScene] aus den Schreibwegen des [StreamSceneService] — Regie-Eingriffe,
 *    Grafik-Konfiguration und Probemodus betreffen genau EINE Szene und zählen den
 *    Änderungsmarker der Veranstaltung bewusst nicht hoch.
 *
 * Dazu kommt als Einziges gegenüber dem Board-Muster der **Timer-Wecker**: Auto-Out-Fenster und
 * Override-Abläufe sind Umschaltpunkte, die von SELBST fällig werden, ohne dass irgendwo etwas
 * geschrieben wird. Statt eines Sekundentakts stellt sich die Render-Schleife nach jedem Aufbau
 * genau einen Wecker auf den nächsten fälligen Zeitpunkt (siehe [renderLoop]).
 *
 * Zweiter Unterschied zum Board-Muster: der **Herzschlag** ([heartbeatLoop]). Eine ruhige, aber
 * gesunde Szene bekommt sonst tagelang keinen einzigen Push (kein Start, keine Zwischenzeit,
 * kein Regie-Eingriff) — für die Veraltet-Erkennung der Bühne und des Kontroll-Panels sähe das
 * ununterscheidbar von einer gestörten Verbindung aus. Der Herzschlag ist ein eigener, INHALTS-
 * LOSER Nachrichtentyp im selben Kanal, im festen Takt, unabhängig vom Zustandsaufbau — er löst
 * NIE [render] aus.
 */
object StreamSceneBroadcaster {

    private val logger = KotlinLogging.logger {}

    /**
     * Sammelfenster vor dem Bau des Stands — Begründung wie beim Board-Kanal: ein Massen-Ereignis
     * löst im Sekundenbruchteil mehrfach aus, und die CONFLATED-Queue macht daraus ohnehin ein
     * Signal. Bewusst kurz; im Livestream ist eine Zehntelsekunde keine Verzögerung.
     */
    private const val BURST_WINDOW_MILLIS = 150L

    /**
     * Takt des Herzschlags (siehe [heartbeatLoop]) — deutlich unter der kleineren der beiden
     * Veraltet-Schwellen (Panel: 30 s), damit ein einzelner verzögerter/verlorener Herzschlag
     * (Netz-Ruckler) noch nicht sofort in eine Warnung läuft.
     *
     * `internal var` statt `const val`: ein Test senkt sie kurzzeitig, um den Herzschlag ohne
     * echte 20 Sekunden Wartezeit zu beobachten (siehe `StreamSceneSocketTest`).
     */
    internal var HEARTBEAT_INTERVAL_MILLIS = 20_000L

    // Spiegelt die Serialisierung von plugins/Serialization.kt (NON_ABSENT sticht das dortige
    // NON_NULL), damit die gepushte Nutzlast Feld für Feld so aussieht wie die HTTP-Antwort
    // desselben DTOs. `copy` lässt den geteilten `jsonMapper` unberührt.
    private val mapper: ObjectMapper = jsonMapper.copy()
        .setSerializationInclusion(JsonInclude.Include.NON_ABSENT)

    private val scope =
        CoroutineScope(SupervisorJob() + Dispatchers.IO + CoroutineName("stream-scene-broadcaster"))

    /** Die Kanäle, streng je Szene — Schlüssel ist die Szenen-Kennung. */
    private val channels = ConcurrentHashMap<UUID, SceneChannel>()

    /**
     * Welche Szenen einer Veranstaltung gerade einen Kanal haben. Nur damit [broadcast] die
     * betroffenen Szenen findet, ohne über alle Kanäle zu laufen; gepflegt ausschließlich
     * innerhalb der [channels]-`compute`-Blöcke (siehe dort).
     */
    private val scenesByEvent = ConcurrentHashMap<UUID, MutableSet<UUID>>()

    /**
     * Die Nachricht des Kanals: ein Umschlag mit Typ und dem kompletten Stand. Der Typ lässt
     * spätere Nachrichtenarten zu, ohne die Bühnen im Feld zu brechen (die verwerfen Unbekanntes).
     */
    private data class StreamSceneMessage(
        val type: String = "streamSceneView",
        val view: StreamSceneViewDto,
    )

    /**
     * Lebendigkeits-Rahmen ohne Stand — [heartbeatLoop] schickt ihn in einem festen Takt, damit
     * eine ruhige (aber gesunde) Szene nicht als "veraltet" erscheint, nur weil sich am Renn-
     * geschehen gerade nichts ändert (siehe dortige KDoc). Bühne und Panel verwerfen unbekannte
     * Typen ohnehin (`parseStreamSceneMessage`), ein eigener Typ bricht also nichts.
     */
    private data class StreamHeartbeatMessage(val type: String = "heartbeat")

    /** Für Tests und den Begrüßungsrahmen sichtbar: die fertige Nachricht zu einem Stand. */
    fun message(view: StreamSceneViewDto): String = mapper.writeValueAsString(StreamSceneMessage(view = view))

    /** Für Tests sichtbar: dieselbe Nachricht, die [heartbeatLoop] tatsächlich verschickt. */
    internal fun heartbeatMessage(): String = mapper.writeValueAsString(StreamHeartbeatMessage())

    class StreamSceneSubscription internal constructor(
        internal val eventId: UUID,
        internal val sceneId: UUID,
    ) {
        // CONFLATED: jede Nachricht trägt den vollständigen Stand, ältere sind damit wertlos.
        internal val queue = Channel<String>(Channel.CONFLATED)

        // EIGENER Kanal statt derselben Warteschlange wie [queue]: ein Herzschlag darf einen
        // bereits wartenden, noch nicht zugestellten Zustandsstand NIE überschreiben (CONFLATED
        // kennt nur "der jüngste Wert zählt" - träfen beide denselben Kanal, könnte ein
        // Herzschlag einen echten Stand verdrängen, der sonst erst beim nächsten Ereignis
        // nachgeholt würde). Selbst-Konflation EINES Herzschlags mit dem nächsten ist dagegen
        // unbedenklich - er trägt ohnehin keinen Inhalt.
        internal val heartbeat = Channel<String>(Channel.CONFLATED)

        // Synchron in [subscribe] gesetzt, bevor die (lazy gestartete) Coroutine je läuft.
        internal lateinit var job: Job
    }

    /**
     * Eine Szene mit mindestens einem Abonnenten: die Auslöserqueue, die Abonnenten und die eine
     * Render-Coroutine.
     *
     * [env] kommt vom ersten Abonnenten — die Ktor-Anwendung hält genau eine Umgebung, jeder
     * Socket bekommt dieselbe gereicht.
     */
    private class SceneChannel(
        val env: JEnv,
        val eventId: UUID,
        val sceneId: UUID,
    ) {
        val subscribers: MutableSet<StreamSceneSubscription> = ConcurrentHashMap.newKeySet()

        // CONFLATED: „es gibt etwas Neues zu bauen" ist nicht zählbar.
        val dirty = Channel<Unit>(Channel.CONFLATED)

        lateinit var job: Job

        /**
         * Der Herzschlag-Wecker dieser Szene — dieselbe Lebensdauer-Disziplin wie [job]: lazy
         * gestartet, zusammen mit [job] gestartet und abgebrochen, nie eigenständig verwaltet.
         * Baut NIE einen Stand ([heartbeatLoop] ruft [render] nicht) - eine ruhige Szene bleibt
         * ruhig, nur der Kanal bleibt sichtbar lebendig.
         */
        lateinit var heartbeatJob: Job

        /**
         * Der eine ausstehende Timer-Wecker dieser Szene. Ausschließlich von der Render-Coroutine
         * gesetzt (deshalb genügt Sichtbarkeit, keine Sperre) und als KIND der Render-Coroutine
         * gestartet: Wird der Kanal abgeräumt, nimmt das Abbrechen von [job] den Wecker mit —
         * ein Wecker kann eine abgeräumte Szene nicht überleben.
         */
        @Volatile
        var wakeUp: Job? = null
    }

    /**
     * Registriert [subscriber] für [sceneId] und startet dessen Schreiber; legt bei Bedarf den
     * Kanal der Szene samt Render-Coroutine an. Der Aufrufer muss die Subscription am
     * Sitzungsende an [unsubscribe] geben.
     */
    fun subscribe(
        env: JEnv,
        eventId: UUID,
        sceneId: UUID,
        subscriber: StreamSceneSubscriber,
    ): StreamSceneSubscription {
        val subscription = StreamSceneSubscription(eventId, sceneId)
        subscription.job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                // Zwei Quellen, EIN Schreiber: `select` nimmt, was zuerst da ist, aus Zustands-
                // UND Herzschlag-Kanal - eine reine `consumeEach` kennt nur eine Quelle. Beide
                // Kanäle werden gemeinsam geschlossen (siehe unsubscribe), `onReceiveCatching`
                // liefert dann ein geschlossenes Ergebnis statt zu werfen; `getOrNull() == null`
                // beendet die Schleife genauso still wie das Ende einer `consumeEach` am Vorbild.
                while (true) {
                    val next = select<String?> {
                        subscription.queue.onReceiveCatching { it.getOrNull() }
                        subscription.heartbeat.onReceiveCatching { it.getOrNull() }
                    } ?: break
                    subscriber(next)
                }
            } catch (ex: CancellationException) {
                throw ex
            } catch (ex: Exception) {
                // Auch der normale Verbindungsabriss landet hier (send auf toter Session) —
                // deshalb kein warn samt Stacktrace für den Alltagsfall.
                logger.debug(ex) { "Stream-scene subscriber of scene $sceneId dropped" }
                unsubscribe(subscription)
            }
        }

        // Der Kanal wird VOLLSTÄNDIG (samt lazy gestarteter Render- UND Herzschlag-Coroutine)
        // gebaut, bevor er in die Karte geht. Ihn erst danach zu vervollständigen, ließe ein
        // nebenläufiges unsubscribe() auf ein noch nicht gesetztes `job` treffen.
        val fresh = SceneChannel(env, eventId, sceneId)
        fresh.job = scope.launch(start = CoroutineStart.LAZY) { renderLoop(fresh) }
        fresh.heartbeatJob = scope.launch(start = CoroutineStart.LAZY) { heartbeatLoop(fresh) }

        val channel = channels.compute(sceneId) { _, current ->
            (current ?: fresh).apply {
                subscribers.add(subscription)
                // Innerhalb desselben compute-Blocks gepflegt, damit „Kanal da" und „in
                // scenesByEvent vermerkt" nie auseinanderfallen — sonst bliebe eine Szene mit
                // Abonnenten von [broadcast] unbemerkt. Die Schachtelung geht immer nur in diese
                // Richtung (channels → scenesByEvent), nie umgekehrt.
                scenesByEvent.compute(eventId) { _, scenes ->
                    (scenes ?: ConcurrentHashMap.newKeySet()).apply { add(sceneId) }
                }
            }
        }!!

        if (channel === fresh) {
            channel.job.start()
            channel.heartbeatJob.start()
            // Ein Aufbau SOFORT beim Entstehen des Kanals - nicht wegen des Stands (den trägt
            // der Begrüßungsrahmen), sondern wegen des Weckers: Der wird ausschließlich in der
            // Render-Schleife gestellt. Ohne diesen einen Anstoß liefe sie erst beim nächsten
            // fremden Auslöser los, und eine Bühne, die sich mitten in ein Einblendfenster
            // verbindet, sähe die Startliste nie wieder verschwinden. Der doppelte Aufbau kostet
            // nichts Nennenswertes - das Sammelfenster fasst ihn ohnehin mit allem zusammen, was
            // in derselben Zehntelsekunde hereinkommt.
            channel.dirty.trySend(Unit)
        } else {
            // Der Kanal stand schon: die eben gebaute Hülle wieder abräumen. Sein Wecker UND sein
            // Herzschlag laufen bereits, der neue Abonnent braucht keinen zweiten Anstoß.
            fresh.job.cancel()
            fresh.heartbeatJob.cancel()
            fresh.dirty.close()
        }

        subscription.job.start()
        return subscription
    }

    /** Für Tests sichtbar: Abonnenten von [sceneId], `null` ohne Kanal. */
    internal fun subscriptionCount(sceneId: UUID): Int? = channels[sceneId]?.subscribers?.size

    fun unsubscribe(subscription: StreamSceneSubscription) {
        subscription.queue.close()
        subscription.heartbeat.close()
        // Ein Schreiber, der gerade an eine hängende (noch nicht als tot erkannte) Session
        // sendet, soll das unsubscribe nicht überleben.
        subscription.job.cancel()

        channels.compute(subscription.sceneId) { _, current ->
            if (current == null) return@compute null
            current.subscribers.remove(subscription)
            if (current.subscribers.isNotEmpty()) return@compute current

            // Letzter Abonnent weg: der Kanal verschwindet mitsamt seiner Render-Coroutine, ihrem
            // Herzschlag UND deren ausstehendem Wecker (beide sind ihr Kind, das Abbrechen nimmt
            // sie mit). Ab jetzt wird für diese Szene nichts mehr gerechnet und nichts mehr
            // geschickt.
            current.job.cancel()
            current.heartbeatJob.cancel()
            current.dirty.close()
            scenesByEvent.compute(subscription.eventId) { _, scenes ->
                scenes?.apply { remove(subscription.sceneId) }?.takeIf { it.isNotEmpty() }
            }
            null
        }
    }

    /**
     * Meldet allen abonnierten Szenen von [eventId], dass sich etwas geändert hat.
     *
     * Suspendiert nie und scheitert nie — gefahrlos aus einem Request-Thread aufrufbar (vgl.
     * [de.lambda9.ready2race.backend.calls.responses.AfterCommit]). Gebaut wird der Stand erst in
     * der Render-Coroutine der jeweiligen Szene, der auslösende Request wartet auf nichts.
     */
    fun broadcast(eventId: UUID) {
        val scenes = scenesByEvent[eventId] ?: return
        scenes.forEach { sceneId -> channels[sceneId]?.dirty?.trySend(Unit) }
    }

    /**
     * Wie [broadcast], aber für eine einzelne Szene — für Änderungen, die genau eine Szene
     * betreffen und deshalb den Änderungsmarker der Veranstaltung nicht hochzählen (Regie,
     * Grafik-Konfiguration, Probemodus).
     */
    fun broadcastScene(sceneId: UUID) {
        channels[sceneId]?.dirty?.trySend(Unit)
    }

    /**
     * Der aktuelle Stand als fertige Nachricht, oder `null`, wenn er sich nicht bauen ließ
     * (unbekannte Szene, Datenbankfehler).
     *
     * Für den Begrüßungsrahmen beim Verbinden: eine Bühne, die eben erst (oder nach einem
     * Funkloch wieder) verbunden ist, hat sofort den vollen Stand und braucht keinen
     * HTTP-Nachschlag.
     */
    fun currentView(env: JEnv, eventId: UUID, sceneId: UUID): String? =
        render(env, eventId, sceneId)?.json

    /** Ergebnis eines Aufbaus: die fertige Nachricht und der Zeitpunkt, an dem sie von selbst veraltet. */
    private data class Rendered(val json: String, val nextEvaluationAt: LocalDateTime?)

    private suspend fun renderLoop(channel: SceneChannel) = coroutineScope {
        channel.dirty.consumeEach {
            // Sammelfenster: alles, was in diesen Millisekunden noch hereinkommt, fällt durch
            // die CONFLATED-Queue ohnehin auf ein Signal zusammen — das eine wartende holen wir
            // gleich mit ab, sonst bauten wir unmittelbar danach ein zweites Mal dasselbe.
            delay(BURST_WINDOW_MILLIS)
            channel.dirty.tryReceive()

            // Scheitert der Aufbau, bleibt der alte Wecker ausdrücklich stehen: er ist dann der
            // einzige Versuch, es später noch einmal zu probieren.
            val rendered = render(channel.env, channel.eventId, channel.sceneId) ?: return@consumeEach

            channel.subscribers.forEach { subscription ->
                // CONFLATED kennt kein „voll": nur eine bereits geschlossene Queue kann scheitern.
                if (subscription.queue.trySend(rendered.json).isClosed) {
                    unsubscribe(subscription)
                }
            }

            // TIMER-WECKER: Auto-Out-Fenster (STARTLIST/LAPS/RESULT) und Override-Abläufe werden
            // fällig, ohne dass jemand schreibt — ohne sie bliebe eine Einblendung stehen, bis
            // zufällig das nächste Ereignis kommt. Statt eines Sekundentakts über alle Szenen
            // schläft die Schleife bis zum nächsten Umschaltpunkt, den der Resolver selbst
            // ausgerechnet hat, und löst sich dann einmal selbst aus. Jeder neue Aufbau ersetzt
            // den Wecker: der Umschaltpunkt kann sich mit jedem Ereignis verschieben.
            scheduleWakeUp(this, channel, rendered.nextEvaluationAt)
        }
    }

    /**
     * Der Herzschlag-Wecker EINER Szene: schickt allen aktuellen Abonnenten im festen Takt
     * [HEARTBEAT_INTERVAL_MILLIS] einen [heartbeatMessage] — OHNE jemals [render] aufzurufen.
     * Das ist der ganze Punkt: eine Szene, an der real nichts passiert (kein Start, keine
     * Zwischenzeit, kein Regie-Eingriff), soll ruhig bleiben — nicht alle 20 s neu aus der
     * Datenbank aufgelöst werden, nur um denselben Stand noch einmal zu verschicken.
     *
     * Bühne UND Panel lesen daraus: „der Kanal lebt", unabhängig davon, ob sich der INHALT
     * ändert. Ohne das würde eine gesunde, aber ruhige Szene nach der Veraltet-Schwelle
     * (`isStreamStale`/`isPanelStale`, je 15 bzw. 30 s) fälschlich als gestört erscheinen — die
     * Automatik pusht schließlich nur bei Änderungen/Timern, nicht auf Zuruf.
     *
     * `while (true)` statt einer Endlosschleife über `delay` + Bedingung: die Coroutine selbst
     * IST die Lebensdauer, ihr Abbruch (siehe [unsubscribe]/`heartbeatJob.cancel()`) beendet die
     * Schleife von außen — dieselbe Bauart wie [renderLoop].
     */
    private suspend fun heartbeatLoop(channel: SceneChannel) {
        val payload = heartbeatMessage()
        while (true) {
            delay(HEARTBEAT_INTERVAL_MILLIS)
            channel.subscribers.forEach { subscription ->
                // Eigener Kanal (siehe StreamSceneSubscription.heartbeat) - kann den Zustands-
                // Rahmen nicht verdrängen. Eine bereits geschlossene Subscription (Abriss
                // zwischen den beiden Server-Ticks) räumt sich über [unsubscribe] ohnehin selbst
                // aus [channel.subscribers] - trySend auf eine geschlossene Queue ist dann
                // wirkungslos, kein Grund, hier zusätzlich abzuräumen.
                subscription.heartbeat.trySend(payload)
            }
        }
    }

    /**
     * Stellt den Wecker der Szene auf [at] und wirft den vorigen weg; [at] `null` heißt „nichts
     * läuft von selbst ab" und lässt die Szene bis zum nächsten echten Ereignis ruhen.
     *
     * Der Wecker läuft als KIND der Render-Coroutine ([scope] wäre schwerer aufzuräumen): so
     * nimmt das Abbrechen des Kanals ihn zuverlässig mit. Ein bereits verstrichener Zeitpunkt
     * weckt sofort — ein Kreisen kann daraus nicht werden, weil der Resolver nur Umschaltpunkte
     * IN DER ZUKUNFT meldet und ein verstrichener beim nächsten Aufbau schlicht verschwindet.
     */
    private fun scheduleWakeUp(loop: CoroutineScope, channel: SceneChannel, at: LocalDateTime?) {
        channel.wakeUp?.cancel()
        channel.wakeUp = null
        if (at == null) return

        val millis = Duration.between(LocalDateTime.now(), at).toMillis().coerceAtLeast(0L)
        channel.wakeUp = loop.launch {
            delay(millis)
            channel.dirty.trySend(Unit)
        }
    }

    private fun render(env: JEnv, eventId: UUID, sceneId: UUID): Rendered? =
        StreamSceneLogic.buildResolvedView(eventId, sceneId).unsafeRunSync(env).fold(
            onSuccess = { resolved ->
                try {
                    Rendered(message(resolved.view), resolved.nextEvaluationAt)
                } catch (ex: Exception) {
                    logger.error(ex) { "Failed to serialize stream scene view of scene $sceneId, dropping it" }
                    null
                }
            },
            onError = { error ->
                // Unbekannte Szene, Veranstaltung gelöscht: kein Grund zu lärmen, der Kanal
                // verschwindet mit seinem letzten Abonnenten von selbst.
                logger.debug { "Skipping stream scene push for scene $sceneId: $error" }
                null
            },
            onDefect = { defect ->
                logger.warn(defect) { "Failed to build stream scene view of scene $sceneId" }
                null
            },
        )
}
