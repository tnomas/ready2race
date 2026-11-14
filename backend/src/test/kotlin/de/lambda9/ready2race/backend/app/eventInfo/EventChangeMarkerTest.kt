package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Reine Tests des Änderungsmarkers - keine Datenbank, keine Umgebung. Der Marker ist ein
 * globales Singleton; die Tests arbeiten deshalb mit frischen Zufalls-Ids und vergleichen
 * relativ zum Ausgangsstand statt gegen absolute Werte.
 */
class EventChangeMarkerTest {

    @Test
    fun `eine unbekannte Veranstaltung steht auf 0`() {
        assertEquals(0L, EventChangeMarker.current(UUID.randomUUID()))
    }

    @Test
    fun `bump erhöht den Stand monoton`() {
        val eventId = UUID.randomUUID()
        val before = EventChangeMarker.current(eventId)

        EventChangeMarker.bump(eventId)
        assertEquals(before + 1, EventChangeMarker.current(eventId))

        EventChangeMarker.bump(eventId)
        assertEquals(before + 2, EventChangeMarker.current(eventId))
    }

    @Test
    fun `Veranstaltungen zählen unabhängig voneinander`() {
        val bumped = UUID.randomUUID()
        val untouched = UUID.randomUUID()

        EventChangeMarker.bump(bumped)

        assertEquals(1L, EventChangeMarker.current(bumped))
        assertEquals(0L, EventChangeMarker.current(untouched))
    }

    /**
     * Der Bump gehört zum Commit, nicht zum Schreibbefehl: Ein Abruf zwischen beiden liest noch
     * die alten Daten und legte sie - wäre der Stand schon erhöht - unter dem NEUEN Stand ab. Der
     * Cache hielte dann den alten Inhalt bis zum TTL-Ablauf für frisch, obwohl gerade etwas
     * passiert ist. Erst der Commit-Nachlauf zählt hoch; ein Rollback zählt gar nicht.
     */
    @Test
    fun `ein Abruf zwischen Bump und Commit sieht den alten Stand`() {
        val eventId = UUID.randomUUID()
        EventChangeMarker.bump(eventId)
        val before = EventChangeMarker.current(eventId)

        val (_, effects) = AfterCommit.collect {
            EventChangeMarker.bump(eventId)
            assertEquals(before, EventChangeMarker.current(eventId), "vor dem Commit bleibt der Stand")
        }
        assertEquals(before, EventChangeMarker.current(eventId))

        AfterCommit.flush(effects)
        assertEquals(before + 1, EventChangeMarker.current(eventId), "der Commit-Nachlauf zählt hoch")

        // Rollback: die gesammelten Nachläufe werden verworfen - kein Bump.
        AfterCommit.collect { EventChangeMarker.bump(eventId) }
        assertEquals(before + 1, EventChangeMarker.current(eventId), "ein Rollback zählt nicht")
    }

    @Test
    fun `current verändert den Stand nicht`() {
        val eventId = UUID.randomUUID()
        EventChangeMarker.bump(eventId)

        // Lesen ist frei von Nebenwirkungen - genau darauf verlassen sich die Cache-Prüfungen,
        // die je Abruf einmal lesen.
        repeat(3) { EventChangeMarker.current(eventId) }
        assertEquals(1L, EventChangeMarker.current(eventId))
    }
}
