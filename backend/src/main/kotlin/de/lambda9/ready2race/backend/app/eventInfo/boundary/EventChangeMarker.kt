package de.lambda9.ready2race.backend.app.eventInfo.boundary

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingWsMessage
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Änderungsmarker je Veranstaltung für die Zwischenspeicher der öffentlichen Anzeigen
 * ([BoardService], [MyEventService], `EventInfoService.getLiveMatches`).
 *
 * Die Zwischenspeicher dort schützen die Datenbank vor dem Poll-Takt der Zuschauer — frischere
 * Daten liefern sie nie. Damit eine neue Zeit nicht bis zu TTL-Länge im Cache versauert, merkt
 * sich jeder Cache-Eintrag beim Bau den Markerstand seiner Veranstaltung und gilt nur als
 * frisch, solange der Stand unverändert ist. Die TTL bleibt als Obergrenze für den
 * Nichts-passiert-Fall bestehen.
 *
 * Jeder schreibende Pfad, der diese Anzeigen speist (Ergebnisse, Aktivierung, Beenden,
 * Zeitplan-Aktionen, Hinweisbanner, RaceClocker-Abruf), ruft [bump] — reine
 * Konfigurations-Schreiber (Board-Konfiguration, Abfrage-Takte, Prüfungs-Einstellungen)
 * bewusst nicht.
 *
 * In-memory ist hier korrekt und keine Abkürzung: die Zwischenspeicher, die dieser Marker
 * entwertet, liegen selbst im Speicher derselben Instanz (Ein-Instanz-Betrieb). Eine zweite
 * Instanz hätte ihre eigenen Caches UND ihren eigenen Marker — konsistent falsch wäre nur
 * ein geteilter Cache ohne geteilten Marker.
 *
 * Die Karte wächst nur mit der Zahl der Veranstaltungen mit Schreibaktivität und wird nie
 * aufgeräumt — ein Long je Veranstaltung, dieselbe Größenordnung wie die Caches selbst.
 *
 * Seit PORT-T6 ist [bump] außerdem die EINE zentrale Stelle, die den WS-Kanal der Veranstaltung
 * über `eventStateChanged` (siehe [TimingWsMessage.EventStateChanged]) informiert — bewusst
 * hier und nicht an jeder einzelnen Aufrufstelle, denn genau die Aufrufer, die mit der
 * Zeitnahme nichts zu tun haben (Zeitplan, RaceClocker, Hinweisbanner, ...), sollen die
 * gepollten Live-Ansichten (LiveDashboard, Speaker-Board, Board-Anzeigen) ebenso sofort
 * anstoßen können wie die Zeitnahme selbst.
 */
object EventChangeMarker {

    private val counters = ConcurrentHashMap<UUID, AtomicLong>()

    /**
     * Letzter tatsächlich gesendeter `eventStateChanged`-Zeitpunkt (Epoch-Millis) je Veranstaltung
     * — die Drossel für [broadcastEventStateChanged].
     */
    private val lastBroadcastAt = ConcurrentHashMap<UUID, Long>()

    /**
     * Mindestabstand zwischen zwei `eventStateChanged`-Pushes derselben Veranstaltung. Ein Import
     * oder ein RaceClocker-Poll kann [bump] in kurzer Folge viele Male aufrufen; ohne Drossel würde
     * jeder einzelne Aufruf einen Push auslösen und die gepollten Ansichten mit Refetches fluten.
     * Verpasste Zwischenstände sind unschädlich - die betroffenen Ansichten pollen ohnehin weiter
     * und holen den letzten Stand spätestens im nächsten Takt.
     */
    internal const val BROADCAST_WINDOW_MILLIS = 2000L

    /** Meldet eine Änderung an der Veranstaltung — alle Cache-Einträge davor sind damit alt. */
    fun bump(eventId: UUID) {
        counters.computeIfAbsent(eventId) { AtomicLong(0) }.incrementAndGet()
        broadcastEventStateChanged(eventId)
    }

    /**
     * Der aktuelle Markerstand der Veranstaltung; 0, solange nie gebumpt wurde. Monoton
     * steigend — ein Cache-Eintrag vergleicht den Stand von seinem Bauzeitpunkt mit diesem.
     */
    fun current(eventId: UUID): Long = counters[eventId]?.get() ?: 0L

    /**
     * Stößt (gedrosselt) den `eventStateChanged`-Push für [eventId] an.
     *
     * [bump] läuft innerhalb laufender Transaktionen (siehe Klassendoc) - der eigentliche Versand
     * geht deshalb, genau wie bei [TimingBroadcaster] selbst, über [AfterCommit]: erst nach einem
     * erfolgreichen Commit sichtbar, bei einem Rollback verworfen, und außerhalb einer HTTP-Anfrage
     * (Scheduler, Tests) sofort ausgeführt.
     *
     * [claimBroadcastSlot] wird bewusst ERST innerhalb des registrierten Effekts aufgerufen, nicht
     * schon hier: ein zurückgerollter Bump darf das Sendefenster nicht verbrauchen (der Effekt läuft
     * dann nie), und ein Bump ohne einen einzigen Abonnenten der Veranstaltung ebenfalls nicht - sonst
     * würde ein Import ohne offenes Board oder eine zufällig verworfene Transaktion das Fenster für den
     * nächsten, tatsächlich sichtbaren Push blockieren. Das Abonnenten-Prüfen selbst kostet kein Fenster,
     * da es vor dem Belegungsversuch steht.
     */
    private fun broadcastEventStateChanged(eventId: UUID, now: Long = System.currentTimeMillis()) {
        AfterCommit.register {
            if ((TimingBroadcaster.subscriptionCount(eventId) ?: 0) > 0 && claimBroadcastSlot(eventId, now)) {
                TimingBroadcaster.broadcast(eventId, TimingWsMessage.EventStateChanged)
            }
        }
    }

    /**
     * Versucht, für [eventId] zum Zeitpunkt [now] ein Sendefenster zu belegen: liefert `true` und
     * merkt sich [now], wenn der letzte Versand mindestens [BROADCAST_WINDOW_MILLIS] zurückliegt
     * (oder noch nie stattfand) — sonst `false`, ohne den gemerkten Zeitpunkt zu verändern.
     *
     * Reine Funktion von [now] (kein `Thread.sleep`, kein Timer) und deshalb ohne Wartezeit
     * testbar; atomar über [ConcurrentHashMap.compute], damit zwei gleichzeitige [bump]-Aufrufe
     * derselben Veranstaltung nicht beide das Fenster belegen.
     *
     * Intern sichtbar für Tests, die die Drossel unabhängig vom Versand selbst prüfen wollen.
     */
    internal fun claimBroadcastSlot(eventId: UUID, now: Long): Boolean {
        var claimed = false
        lastBroadcastAt.compute(eventId) { _, previous ->
            if (previous == null || now - previous >= BROADCAST_WINDOW_MILLIS) {
                claimed = true
                now
            } else {
                previous
            }
        }
        return claimed
    }
}
