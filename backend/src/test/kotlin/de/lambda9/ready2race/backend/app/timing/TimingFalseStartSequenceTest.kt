package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingToneSetService
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TONE_SET
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.JSONB
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Fehlstart-FOLGE gegen echtes Postgres - vor allem der Bestandsschutz OHNE Migration.
 *
 * Bis zum 24.08.2026 war der Fehlstart-Ton ein Einzelton und liegt in bestehenden Datenbanken als
 * jsonb-OBJEKT; seither schreibt der Dienst immer ein ARRAY. Statt einer Migration, die jede Zeile
 * anfassen (und beim Rollback wieder zurueckmuessen) wuerde, entscheidet die GESTALT des
 * gespeicherten Werts.
 *
 * Geprueft wird das seit dem 26.08.2026 am TON-SATZ: Der Wert stand frueher in
 * `event.timing_false_start_tone` und ist mit V202608261200 unveraendert - also gegebenenfalls
 * samt seiner alten Gestalt - nach `timing_tone_set.false_start_tone` gewandert; die
 * Veranstaltungs-Spalte ist mit V202608261210 gefallen. Der Alt-Stand wird deshalb hier in die
 * Spalte des Satzes geschrieben, genau wie die Migration ihn dort abgelegt haette, und die ganze
 * Kette geprueft: Formular-Sicht (getToneSets), Board-Sicht (getSettings) und das Ueberschreiben.
 */
class TimingFalseStartSequenceTest {

    /** Genau der produktiv gespeicherte Alt-Stand: 200-Hz-Saegezahn, 2000 ms, gehalten mit 0 ms. */
    private val storedSingleTone =
        JSONB.jsonb("""{"frequencyHz":200,"durationMillis":2000,"releaseMillis":0,"waveform":"SAWTOOTH"}""")

    private val ownSequence = listOf(
        ToneStep(offsetMillis = 0, frequencyHz = 300, durationMillis = 200, releaseMillis = 0, waveform = ToneWaveform.SQUARE),
        ToneStep(offsetMillis = 500, frequencyHz = 260, durationMillis = 900, releaseMillis = 250, waveform = ToneWaveform.SQUARE),
    )

    /**
     * Ein Vorgabesatz ohne eigene Toene - der Stand, den die Migration fuer jede Veranstaltung
     * anlegt. Der erste Satz wird ungefragt die Vorgabe, deshalb liest ihn GET /timing/settings.
     */
    private fun createDefaultToneSet(eventId: UUID, userId: UUID): App<Any?, UUID> =
        TimingToneSetService.addToneSet(TimingToneSetRequest(name = "Standard"), userId, eventId)
            .map { (it as ApiResponse.Created).id }

    /** Den Alt-Stand direkt in die Spalte schreiben - so, wie ihn die Migration hinterlassen hat. */
    private fun storeRaw(setId: UUID, value: JSONB?): App<Any?, Unit> = Jooq.query {
        update(TIMING_TONE_SET)
            .set(TIMING_TONE_SET.FALSE_START_TONE, value)
            .where(TIMING_TONE_SET.ID.eq(setId))
            .execute()
    }.map { }

    private fun readRaw(setId: UUID): App<Any?, JSONB?> = Jooq.query {
        select(TIMING_TONE_SET.FALSE_START_TONE).from(TIMING_TONE_SET).where(TIMING_TONE_SET.ID.eq(setId))
            .fetchOne()?.value1()
    }

    private fun saveSequence(
        eventId: UUID,
        userId: UUID,
        setId: UUID,
        sequence: List<ToneStep>?,
    ): App<Any?, Unit> = TimingToneSetService.updateToneSet(
        TimingToneSetRequest(name = "Standard", isDefault = true, falseStartTone = sequence),
        userId,
        setId,
        eventId,
    ).map { }

    // ---------------------------------------------------------------- Bestandsschutz

    @Test
    fun aStoredSingleToneSurvivesAsAOneElementSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val setId = !createDefaultToneSet(eventId, userId)
        !storeRaw(setId, storedSingleTone)

        // Formular-Sicht: unaufgeloest, aber schon als Folge - der Editor zeigt EINE Zeile.
        val gespeichert = (!TimingToneSetService.getToneSets(eventId)).data.single()
        assertEquals(
            listOf(
                ToneStep(
                    offsetMillis = 0,
                    frequencyHz = 200,
                    durationMillis = 2000,
                    releaseMillis = 0,
                    waveform = ToneWaveform.SAWTOOTH,
                )
            ),
            gespeichert.falseStartTone,
        )

        // Board-Sicht: derselbe Klang, aufgeloest ausgeliefert - kein Board faellt auf den
        // eingebauten Standard zurueck, nur weil die Spalte noch die alte Gestalt hat.
        val settings = (!TimingOfficialTimeService.getSettings(eventId)).dto
        assertEquals(gespeichert.falseStartTone, settings.defaultToneSet.falseStartTone)
        assertEquals(2000, settings.defaultToneSet.falseStartTone.single().durationMillis)

        // Und in der Datenbank steht immer noch der unangetastete Alt-Stand: Lesen migriert nicht.
        assertTrue((!readRaw(setId))!!.data().trimStart().startsWith("{"))
    }

    @Test
    fun savingOverAStoredSingleToneWritesAnArray() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val setId = !createDefaultToneSet(eventId, userId)
        !storeRaw(setId, storedSingleTone)
        !saveSequence(eventId, userId, setId, ownSequence)

        // Ab dem ersten Speichern liegt die neue Gestalt in der Spalte ...
        assertTrue((!readRaw(setId))!!.data().trimStart().startsWith("["))
        // ... und kommt unveraendert wieder hoch.
        assertEquals(ownSequence, (!TimingToneSetService.getToneSets(eventId)).data.single().falseStartTone)
        assertEquals(
            ownSequence,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.falseStartTone,
        )
    }

    // ---------------------------------------------------------------- Standard und Zuruecksetzen

    @Test
    fun anUnconfiguredToneSetGetsTheBuiltInSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !createDefaultToneSet(eventId, userId)

        // Unaufgeloest bleibt null - nur so kann das Formular "Standard wiederherstellen" anbieten.
        assertNull((!TimingToneSetService.getToneSets(eventId)).data.single().falseStartTone)
        // Aufgeloest liefert der Server die eingebaute kurz-kurz-lang-Folge.
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.falseStartTone,
        )
    }

    @Test
    fun savingNullClearsTheColumnAndRestoresTheBuiltInSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val setId = !createDefaultToneSet(eventId, userId)
        !saveSequence(eventId, userId, setId, ownSequence)
        assertNotNull(!readRaw(setId))

        !saveSequence(eventId, userId, setId, null)

        assertNull(!readRaw(setId))
        assertNull((!TimingToneSetService.getToneSets(eventId)).data.single().falseStartTone)
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.defaultToneSet.falseStartTone,
        )
    }

    @Test
    fun theBuiltInSequenceRoundTripsThroughTheColumn() = testComprehension {
        // Der Standard muss auch als AUSDRUECKLICH gespeicherter Wert durchkommen (wer ihn im
        // Editor nachbaut und speichert, statt zurueckzusetzen).
        val (eventId, userId) = !createTestEventWithAdmin()
        val setId = !createDefaultToneSet(eventId, userId)
        !saveSequence(eventId, userId, setId, TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE)
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingToneSetService.getToneSets(eventId)).data.single().falseStartTone,
        )
    }
}
