package de.lambda9.ready2race.backend.app.eventInfo.boundary

import de.lambda9.ready2race.backend.app.stream.boundary.StreamSceneBroadcaster
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
     * gepusht ([EventChangeBroadcaster]) — zentral hier statt an den ~30 Aufrufstellen.
     * Inkrement UND Push laufen zusammen über [AfterCommit]: die Clients laden auf den
     * Fingerzeig hin sofort nach, und ein Push vor dem Commit ließe sie den alten Stand lesen.
     * Dasselbe gilt für das Inkrement allein — ein Abruf zwischen Bump und Commit läse noch die
     * alten Daten, legte sie aber unter dem NEUEN Stand ab, und der Cache hielte den alten
     * Inhalt bis zum TTL-Ablauf für frisch. Erst nach dem Commit zählt der Marker hoch; ein
     * Rollback zählt gar nicht. Außerhalb eines Requests (Jobs, Tests) wirkt beides sofort.
     *
     * Aus derselben Quelle speist sich der Board-Kanal ([BoardViewBroadcaster]), der die
     * fertige Ansicht schickt statt nur den Fingerzeig. Er hängt bewusst hier und nicht an
     * eigenen Auslösern quer durch den Code: „was diese Anzeigen speist" ist genau die Menge
     * der Schreibpfade, die schon [bump] rufen — ein zweites, parallel gepflegtes Verzeichnis
     * davon würde unweigerlich auseinanderlaufen. Der Aufruf kostet nichts, wenn niemand
     * zusieht (ohne Abonnenten kehrt er sofort zurück), und rechnet nie im Request-Thread.
     *
     * Genau dasselbe gilt für den Szenen-Kanal des Livestream-Overlays
     * ([StreamSceneBroadcaster]): dieselben Ereignisse (Start, Zwischenzeit, Zieleinlauf,
     * Zustandswechsel, Sequenzstart) sind es, die eine Einblendung kommen und gehen lassen.
     * Was NUR eine einzelne Szene betrifft (Regie-Eingriff, Grafik-Konfiguration, Probemodus),
     * läuft dagegen über `StreamSceneBroadcaster.broadcastScene` in `StreamSceneService` — wie
     * die Board-Konfiguration über `broadcastBoard`.
     */
    fun bump(eventId: UUID) {
        AfterCommit.register {
            val stand = counters.computeIfAbsent(eventId) { AtomicLong(0) }.incrementAndGet()
            EventChangeBroadcaster.broadcast(eventId, stand)
            BoardViewBroadcaster.broadcast(eventId)
            StreamSceneBroadcaster.broadcast(eventId)
        }
    }

    /**
     * Der aktuelle Markerstand der Veranstaltung; 0, solange nie gebumpt wurde. Monoton
     * steigend — ein Cache-Eintrag vergleicht den Stand von seinem Bauzeitpunkt mit diesem.
     */
    fun current(eventId: UUID): Long = counters[eventId]?.get() ?: 0L
}
