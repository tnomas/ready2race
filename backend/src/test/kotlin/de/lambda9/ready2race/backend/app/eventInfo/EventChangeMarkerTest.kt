package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingWsMessage
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.Collections
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds

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

    @Test
    fun `current verändert den Stand nicht`() {
        val eventId = UUID.randomUUID()
        EventChangeMarker.bump(eventId)

        // Lesen ist frei von Nebenwirkungen - genau darauf verlassen sich die Cache-Prüfungen,
        // die je Abruf einmal lesen.
        repeat(3) { EventChangeMarker.current(eventId) }
        assertEquals(1L, EventChangeMarker.current(eventId))
    }

    // --- Drossel für den `eventStateChanged`-Push (PORT-T6) -------------------------------------
    // claimBroadcastSlot ist eine reine Funktion von `now` - hier ohne jede Wartezeit mit
    // frei gewählten synthetischen Zeitstempeln geprüft, unabhängig vom eigentlichen Versand.

    @Test
    fun `claimBroadcastSlot belegt das erste Fenster einer Veranstaltung sofort`() {
        val eventId = UUID.randomUUID()
        assertTrue(EventChangeMarker.claimBroadcastSlot(eventId, now = 1_000L))
    }

    @Test
    fun `claimBroadcastSlot verweigert ein zweites Fenster innerhalb der Sperrfrist`() {
        val eventId = UUID.randomUUID()
        assertTrue(EventChangeMarker.claimBroadcastSlot(eventId, now = 1_000L))
        assertFalse(
            EventChangeMarker.claimBroadcastSlot(
                eventId,
                now = 1_000L + EventChangeMarker.BROADCAST_WINDOW_MILLIS - 1,
            ),
        )
    }

    @Test
    fun `claimBroadcastSlot erlaubt das naechste Fenster genau an der Sperrfrist`() {
        val eventId = UUID.randomUUID()
        assertTrue(EventChangeMarker.claimBroadcastSlot(eventId, now = 1_000L))
        assertTrue(
            EventChangeMarker.claimBroadcastSlot(
                eventId,
                now = 1_000L + EventChangeMarker.BROADCAST_WINDOW_MILLIS,
            ),
        )
    }

    @Test
    fun `claimBroadcastSlot belegt Veranstaltungen unabhaengig voneinander`() {
        val eventA = UUID.randomUUID()
        val eventB = UUID.randomUUID()

        assertTrue(EventChangeMarker.claimBroadcastSlot(eventA, now = 1_000L))
        // eventB hat noch nie ein Fenster belegt - die Sperrfrist von A darf B nicht betreffen.
        assertTrue(EventChangeMarker.claimBroadcastSlot(eventB, now = 1_000L))
    }

    @Test
    fun `ein verweigertes Fenster veraendert den gemerkten Zeitpunkt nicht`() {
        val eventId = UUID.randomUUID()
        assertTrue(EventChangeMarker.claimBroadcastSlot(eventId, now = 1_000L))
        // Innerhalb der Sperrfrist verweigert, darf also den Stand von 1_000 nicht auf z.B.
        // 1_500 vorziehen - sonst verschöbe sich das nächste erlaubte Fenster grundlos nach hinten.
        assertFalse(EventChangeMarker.claimBroadcastSlot(eventId, now = 1_500L))
        assertFalse(
            EventChangeMarker.claimBroadcastSlot(
                eventId,
                now = 1_000L + EventChangeMarker.BROADCAST_WINDOW_MILLIS - 1,
            ),
        )
        assertTrue(
            EventChangeMarker.claimBroadcastSlot(
                eventId,
                now = 1_000L + EventChangeMarker.BROADCAST_WINDOW_MILLIS,
            ),
        )
    }

    // --- bump() löst den WS-Push aus (und drosselt ihn) ------------------------------------------
    // Kein AfterCommit-Puffer installiert (kein HTTP-Request drumherum) - der Push aus bump() läuft
    // deshalb sofort, siehe AfterCommit.register.

    @Test
    fun `bump sendet eventStateChanged an Abonnenten der Veranstaltung`() = runBlocking {
        val eventId = UUID.randomUUID()
        val received = Collections.synchronizedList(mutableListOf<String>())
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            EventChangeMarker.bump(eventId)
            withTimeout(5.seconds) {
                while (received.isEmpty()) {
                    delay(5)
                }
            }
            assertTrue(received.single().contains("eventStateChanged"))
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun `bump sendet innerhalb der Sperrfrist keinen zweiten Push`() = runBlocking {
        val eventId = UUID.randomUUID()
        val received = Collections.synchronizedList(mutableListOf<String>())
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            EventChangeMarker.bump(eventId)
            withTimeout(5.seconds) {
                while (received.isEmpty()) {
                    delay(5)
                }
            }
            // Unmittelbar folgende Bumps (Import, Poll) dürfen keinen zweiten Push auslösen.
            repeat(5) { EventChangeMarker.bump(eventId) }
            delay(200)
            assertEquals(1, received.size)
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    // --- Das Sendefenster wird erst beim tatsächlichen Versand belegt -----------------------------
    // (nach dem AfterCommit-Flush-Entscheid bzw. der Abonnenten-Prüfung), nicht schon in [bump]
    // selbst - siehe Klassendoc von `broadcastEventStateChanged`.

    @Test
    fun `bump ohne Abonnenten verbraucht das Sendefenster nicht`() = runBlocking {
        val eventId = UUID.randomUUID()

        // Kein Abonnent zum Zeitpunkt dieses ersten bump - er darf das Sendefenster nicht belegen.
        EventChangeMarker.bump(eventId)

        val received = Collections.synchronizedList(mutableListOf<String>())
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }
        try {
            // Käme das Fenster schon vom ersten (abonnentenlosen) bump belegt an, würde dieser
            // zweite bump - jetzt mit Abonnent - noch innerhalb der Sperrfrist verworfen.
            EventChangeMarker.bump(eventId)
            withTimeout(5.seconds) {
                while (received.isEmpty()) {
                    delay(5)
                }
            }
            assertTrue(received.single().contains("eventStateChanged"))
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun `ein zurückgerollter bump verbraucht das Sendefenster nicht`() = runBlocking {
        val eventId = UUID.randomUUID()
        val received = Collections.synchronizedList(mutableListOf<String>())
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }
        try {
            // Simuliert eine Transaktion, die am Ende zurückrollt: die registrierten Effekte werden
            // eingesammelt, aber absichtlich nie geflusht.
            AfterCommit.collect {
                EventChangeMarker.bump(eventId)
            }
            delay(50)
            assertTrue(received.isEmpty())

            // Ein echter, nicht zurückgerollter bump danach muss sofort senden - der verworfene
            // Versuch darf das Sendefenster nicht belegt haben.
            EventChangeMarker.bump(eventId)
            withTimeout(5.seconds) {
                while (received.isEmpty()) {
                    delay(5)
                }
            }
            assertTrue(received.single().contains("eventStateChanged"))
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }
}
