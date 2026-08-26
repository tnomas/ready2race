package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingBroadcaster
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingToneSetService
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import kotlinx.coroutines.runBlocking
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Ton-Sätze gegen echtes Postgres: der jsonb-Roundtrip aller vier Töne, der (event, name)-Vorbau
 * und - der eigentliche Grund für diesen Test - die Regel „genau ein Vorgabesatz je
 * Veranstaltung". Zwei verhindert der partielle Unique-Index; keinen zu haben verhindert der
 * Dienst, und das lässt sich nur hier prüfen.
 */
class TimingToneSetServiceTest {

    private fun request(
        name: String = "Laut fürs Wasser",
        isDefault: Boolean = false,
    ) = TimingToneSetRequest(name = name, isDefault = isDefault)

    private fun addToneSet(
        request: TimingToneSetRequest,
        userId: UUID,
        eventId: UUID,
    ) = TimingToneSetService.addToneSet(request, userId, eventId)

    @Test
    fun `der erste Satz einer Veranstaltung wird immer die Vorgabe`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        // Ausdrücklich OHNE isDefault angelegt - trotzdem muss er die Vorgabe werden, sonst
        // erbte ihn niemand und er wäre beim Anlegen schon toter Ballast.
        !addToneSet(request(), userId, eventId)

        val sets = (!TimingToneSetService.getToneSets(eventId)).data
        assertEquals(1, sets.size)
        assertTrue(sets.single().isDefault)
    }

    @Test
    fun `die Vorgabe wandert und der alte Satz verliert sie in derselben Schreib-Operation`() =
        testComprehension {
            val (eventId, userId) = !createTestEventWithAdmin()
            val ersterId = ((!addToneSet(request(name = "Laut"), userId, eventId)) as ApiResponse.Created).id

            // Ein zweiter Satz, gleich als Vorgabe angelegt: Der partielle Unique-Index lässt das
            // nur zu, wenn der erste seine Markierung dabei verliert.
            val zweiterId =
                ((!addToneSet(request(name = "Leise", isDefault = true), userId, eventId)) as ApiResponse.Created).id

            var sets = (!TimingToneSetService.getToneSets(eventId)).data.associateBy { it.id }
            assertFalse(sets.getValue(ersterId).isDefault)
            assertTrue(sets.getValue(zweiterId).isDefault)

            // Dasselbe über das Ändern - zurück auf den ersten.
            !TimingToneSetService.updateToneSet(request(name = "Laut", isDefault = true), userId, ersterId, eventId)
            sets = (!TimingToneSetService.getToneSets(eventId)).data.associateBy { it.id }
            assertTrue(sets.getValue(ersterId).isDefault)
            assertFalse(sets.getValue(zweiterId).isDefault)

            // Und die Vorgabe steht in der Liste oben - dort, wo „Erbt (Standard)" hinzeigt.
            assertEquals(ersterId, (!TimingToneSetService.getToneSets(eventId)).data.first().id)
        }

    @Test
    fun `die Vorgabe darf wandern, aber nicht verschwinden`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val vorgabeId = ((!addToneSet(request(name = "Laut"), userId, eventId)) as ApiResponse.Created).id
        !addToneSet(request(name = "Leise"), userId, eventId)

        // Die Markierung einfach abstreifen ginge: Alle erbenden Typen fielen still auf die
        // eingebauten Töne zurück, ohne dass jemand einen Ton verstellt hätte.
        assertKIOFails(TimingError.ToneSetDefaultRequired) {
            TimingToneSetService.updateToneSet(request(name = "Laut", isDefault = false), userId, vorgabeId, eventId)
        }
        // Löschen aus demselben Grund nicht.
        assertKIOFails(TimingError.ToneSetDefaultRequired) {
            TimingToneSetService.deleteToneSet(vorgabeId, eventId)
        }
    }

    @Test
    fun `der letzte Satz darf gehen, auch als Vorgabe`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val vorgabeId = ((!addToneSet(request(), userId, eventId)) as ApiResponse.Created).id

        // Dann hat die Veranstaltung wieder gar keine Sätze, und der Rückfall auf die eingebauten
        // Töne ist die richtige Antwort - kein Zustand „Sätze ohne Vorgabe".
        assertKIOSucceeds<ApiResponse.NoData> { TimingToneSetService.deleteToneSet(vorgabeId, eventId) }
        assertEquals(0, (!TimingToneSetService.getToneSets(eventId)).data.size)
    }

    @Test
    fun `ein gewöhnlicher Satz darf jederzeit gehen`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !addToneSet(request(name = "Laut"), userId, eventId)
        val zweiterId = ((!addToneSet(request(name = "Leise"), userId, eventId)) as ApiResponse.Created).id

        assertKIOSucceeds<ApiResponse.NoData> { TimingToneSetService.deleteToneSet(zweiterId, eventId) }
    }

    /**
     * Der ERSTE Ton-Satz einer Veranstaltung, gleich mit eigenem Startplan angelegt: Er wird
     * ungefragt Vorgabesatz, und damit lösen ab diesem Moment alle Typen ohne eigene Wahl gegen
     * ihn auf statt gegen den eingebauten Plan. Das ist hörbar - ein offenes Startposten-Board
     * spielte ohne die Nachricht bis zum nächsten Neuladen den alten Countdown.
     *
     * Der Fall stand ursprünglich als Ausnahme im Dienst („vorher gab es keinen Satz, den ein
     * Board schon gehört hätte") - er übersieht, dass vorher der eingebaute Standard galt. Dieser
     * Test hält die Korrektur fest.
     */
    @Test
    fun `schon der erste Satz benachrichtigt die Boards`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val received = TimingBroadcasterTest.concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            !addToneSet(
                TimingToneSetRequest(
                    name = "Laut fürs Wasser",
                    sequenceTonePlan = listOf(
                        ToneStep(offsetMillis = 0, frequencyHz = 900, durationMillis = 400),
                    ),
                ),
                userId,
                eventId,
            )

            // ZWEI Nachrichten: die Startliste trägt die Töne der PARTIEN, und der Vorgabesatz
            // in GET /timing/settings trägt den Rückfall des großen Erfassungsknopfs - der
            // gehört zu keiner Partie und bekäme über matchesChanged nichts mit.
            runBlocking { TimingBroadcasterTest.awaitSize(received, 2) }
            assertTrue(
                received.any { it.contains("matchesChanged") },
                "erwartet matchesChanged: $received",
            )
            assertTrue(
                received.any { it.contains("settingsChanged") },
                "erwartet settingsChanged: $received",
            )
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    /** Ändern und Löschen ebenso - beide verschieben den geerbten Klang. */
    @Test
    fun `Ändern und Löschen benachrichtigen die Boards`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !addToneSet(request(name = "Laut"), userId, eventId)
        val zweiterId = ((!addToneSet(request(name = "Leise"), userId, eventId)) as ApiResponse.Created).id

        val received = TimingBroadcasterTest.concurrentList()
        val subscription = TimingBroadcaster.subscribe(eventId) { received.add(it) }

        try {
            // Je Schreibvorgang zwei Nachrichten - matchesChanged für die Töne der Partien,
            // settingsChanged für den Vorgabesatz (siehe den Test darüber).
            !TimingToneSetService.updateToneSet(request(name = "Leiser"), userId, zweiterId, eventId)
            runBlocking { TimingBroadcasterTest.awaitSize(received, 2) }

            !TimingToneSetService.deleteToneSet(zweiterId, eventId)
            runBlocking { TimingBroadcasterTest.awaitSize(received, 4) }

            assertEquals(4, received.size)
            assertEquals(2, received.count { it.contains("matchesChanged") }, "erwartet zwei matchesChanged: $received")
            assertEquals(2, received.count { it.contains("settingsChanged") }, "erwartet zwei settingsChanged: $received")
        } finally {
            TimingBroadcaster.unsubscribe(subscription)
        }
    }

    @Test
    fun `alle vier Töne überleben den jsonb-Roundtrip`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val plan = listOf(
            ToneStep(offsetMillis = -10_000, frequencyHz = 600, durationMillis = 100),
            // Gehalten mit 0 ms Ausklingen: Die 0 wählt eine ANDERE Hüllkurve als null
            // (Abfallend) und muss den Roundtrip als echte 0 überleben, nicht als null.
            ToneStep(offsetMillis = -5_000, frequencyHz = 600, durationMillis = 100, releaseMillis = 0),
            ToneStep(offsetMillis = 0, frequencyHz = 880, durationMillis = 400, releaseMillis = 800),
            // Wellenform: gesetzt bleibt gesetzt, nicht gesetzt bleibt null (= Sinus) - auch
            // kombiniert mit einer Ausklingzeit (die Dimensionen sind unabhängig).
            ToneStep(offsetMillis = -2_000, frequencyHz = 440, durationMillis = 300, waveform = ToneWaveform.SQUARE),
            ToneStep(
                offsetMillis = -1_000,
                frequencyHz = 440,
                durationMillis = 300,
                releaseMillis = 500,
                waveform = ToneWaveform.SAWTOOTH,
            ),
        )
        val fehlstart = listOf(
            ToneStep(offsetMillis = 0, frequencyHz = 200, durationMillis = 300, releaseMillis = 0),
            ToneStep(offsetMillis = 400, frequencyHz = 180, durationMillis = 1500, releaseMillis = 400),
        )
        val split = CaptureTone(frequencyHz = 660, durationMillis = 120)
        val ziel = CaptureTone(frequencyHz = 990, durationMillis = 200, releaseMillis = 0, waveform = ToneWaveform.TRIANGLE)

        val id = ((!addToneSet(
            TimingToneSetRequest(
                name = "Laut fürs Wasser",
                sequenceTonePlan = plan,
                splitTone = split,
                falseStartTone = fehlstart,
                finishTone = ziel,
                tonePerBoat = false,
            ),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        val gelesen = (!TimingToneSetService.getToneSets(eventId)).data.single()
        assertEquals(plan, gelesen.sequenceTonePlan)
        assertEquals(fehlstart, gelesen.falseStartTone)
        assertEquals(split, gelesen.splitTone)
        assertEquals(ziel, gelesen.finishTone)
        assertFalse(gelesen.tonePerBoat)

        // Zurück auf „Standard wiederherstellen": null muss auch beim Ändern wirklich null werden,
        // sonst könnte eine künftige Standard-Änderung diesen Satz nie mehr erreichen.
        !TimingToneSetService.updateToneSet(request(name = "Laut fürs Wasser", isDefault = true), userId, id, eventId)
        val wiederhergestellt = (!TimingToneSetService.getToneSets(eventId)).data.single()
        assertNull(wiederhergestellt.sequenceTonePlan)
        assertNull(wiederhergestellt.falseStartTone)
        assertNull(wiederhergestellt.splitTone)
        assertNull(wiederhergestellt.finishTone)
        assertTrue(wiederhergestellt.tonePerBoat)
    }

    @Test
    fun `doppelte Namen innerhalb der Veranstaltung werden abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        !addToneSet(request(), userId, eventId)

        assertKIOFails(TimingError.ToneSetNameTaken) { addToneSet(request(), userId, eventId) }
        // In einer anderen Veranstaltung ist derselbe Name in Ordnung.
        assertKIOSucceeds<ApiResponse.Created> { addToneSet(request(), otherUserId, otherEventId) }
    }

    @Test
    fun `ein Satz einer anderen Veranstaltung lässt sich weder ändern noch löschen`() =
        testComprehension {
            val (eventId, userId) = !createTestEventWithAdmin()
            val (otherEventId, _) = !createTestEventWithAdmin()
            val id = ((!addToneSet(request(), userId, eventId)) as ApiResponse.Created).id

            assertKIOFails(TimingError.EventMismatch) {
                TimingToneSetService.updateToneSet(request(), userId, id, otherEventId)
            }
            assertKIOFails(TimingError.EventMismatch) { TimingToneSetService.deleteToneSet(id, otherEventId) }
        }

    /**
     * DER NOTAUSGANG. Der große Erfassungsknopf bankt eine Zeit OHNE Zuordnung - sie gehört zu
     * keiner Partie und damit zu keinem Zeitnahmetyp. Sein Ton kommt deshalb nicht über die
     * Startliste, sondern über den aufgelösten Vorgabesatz in GET /timing/settings. Bliebe der
     * aus, verstummte genau der Griff, der im Ernstfall zählt.
     */
    @Test
    fun `GET timing settings liefert den aufgelösten Vorgabesatz`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        // Zuerst ohne jeden Satz: Auch eine Veranstaltung, in der niemand je einen Ton-Satz
        // angelegt hat, muss einen spielbaren Ton bekommen.
        val ohneSätze = (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, ohneSätze.finishTone)
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, ohneSätze.splitTone)
        assertEquals(TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE, ohneSätze.falseStartTone)
        assertNull(ohneSätze.sequenceTonePlan)
        // ... und zwar denselben wie gestern: EIN Ton für alle Boote. Der Spalten-Default (an) ist
        // ein Vorschlag für neu angelegte Sätze; eine Veranstaltung ohne jeden Satz hat die
        // Tonleiter nie gehört und darf sie nicht ungefragt bekommen.
        assertFalse(ohneSätze.tonePerBoat)

        val eigenerZielton = CaptureTone(frequencyHz = 990, durationMillis = 200)
        !addToneSet(
            TimingToneSetRequest(name = "Laut fürs Wasser", finishTone = eigenerZielton, tonePerBoat = false),
            userId,
            eventId,
        )
        // Der erste Satz wird ungefragt die Vorgabe - ab jetzt bestätigt der Knopf mit SEINEM Ton.
        val mitVorgabe = (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet
        assertEquals(eigenerZielton, mitVorgabe.finishTone)
        assertFalse(mitVorgabe.tonePerBoat)
        // Der Zwischenton blieb im Satz leer: eingebauter Standard, nicht der Zielton daneben.
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, mitVorgabe.splitTone)

        // Ein ZWEITER Satz, der nicht die Vorgabe ist, ändert am Knopf nichts.
        !addToneSet(
            TimingToneSetRequest(
                name = "Leise für die Halle",
                finishTone = CaptureTone(frequencyHz = 440, durationMillis = 80),
            ),
            userId,
            eventId,
        )
        assertEquals(
            eigenerZielton,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.finishTone,
        )
    }

    /**
     * Der zweite Weg in den satzlosen Zustand - und der heimtückischere: Wer den LETZTEN Ton-Satz
     * löscht (erlaubt, siehe „der letzte Satz darf gehen"), hat bis zum Klick „Ein Ton für alle
     * Boote" auf der Zeile gelesen. Fiele die Auflösung ohne Satz auf den Spalten-Default (an)
     * zurück, schaltete genau dieses Löschen still die Tonleiter EIN - ein Klangwechsel, den
     * niemand bestellt hat, an einer Stelle, an der niemand ihn vermutet.
     */
    @Test
    fun `das Löschen des letzten Satzes schaltet die Tonleiter nicht ein`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val id = ((!addToneSet(
            TimingToneSetRequest(name = "Laut fürs Wasser", tonePerBoat = false),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        assertFalse((!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.tonePerBoat)

        !TimingToneSetService.deleteToneSet(id, eventId)

        // Kein Satz mehr - und trotzdem derselbe Klang wie eben.
        assertFalse((!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.tonePerBoat)
    }
}
