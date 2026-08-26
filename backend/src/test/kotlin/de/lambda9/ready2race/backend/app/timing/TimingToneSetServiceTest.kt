package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingToneSetService
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
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
}
