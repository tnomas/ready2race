package de.lambda9.ready2race.backend.app.eventInfo.boundary

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
 */
object EventChangeMarker {

    private val counters = ConcurrentHashMap<UUID, AtomicLong>()

    /**
     * Meldet eine Änderung an der Veranstaltung — alle Cache-Einträge davor sind damit alt.
     *
     * Zusätzlich wird der neue Stand über den Veranstaltungs-Kanal an verbundene Anzeigen
     * gepusht ([EventChangeBroadcaster]) — zentral hier statt an den ~30 Aufrufstellen. Der
     * Push läuft über [AfterCommit]: die Clients laden auf den Fingerzeig hin sofort nach,
     * und ein Push vor dem Commit ließe sie den alten Stand lesen und (mit dem neuen
     * Markerstand versehen) bis zum TTL-Ablauf im Cache festhalten. Das Inkrement selbst
     * bleibt bewusst sofort wirksam — ein zu früh entwerteter Cache kostet nur einen Abruf.
     */
    fun bump(eventId: UUID) {
        val stand = counters.computeIfAbsent(eventId) { AtomicLong(0) }.incrementAndGet()
        AfterCommit.register { EventChangeBroadcaster.broadcast(eventId, stand) }
    }

    /**
     * Der aktuelle Markerstand der Veranstaltung; 0, solange nie gebumpt wurde. Monoton
     * steigend — ein Cache-Eintrag vergleicht den Stand von seinem Bauzeitpunkt mit diesem.
     */
    fun current(eventId: UUID): Long = counters[eventId]?.get() ?: 0L
}
