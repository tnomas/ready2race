package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.timing.boundary.TimingOfficialTimeService
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
import de.lambda9.ready2race.backend.app.timingConfig.boundary.TimingConfigService
import de.lambda9.ready2race.backend.app.timingConfig.entity.EventTimingConfigRequest
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingPrecision
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
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
 * jsonb-OBJEKT in `event.timing_false_start_tone`; seither schreibt der Dienst immer ein ARRAY.
 * Statt einer Migration, die jede Zeile anfassen (und beim Rollback wieder zurueckmuessen) wuerde,
 * entscheidet die GESTALT des gespeicherten Werts. Dieser Test schreibt den Alt-Stand mit der
 * gleichen jsonb-Spalte in dieselbe Datenbank, die die App benutzt, und prueft die ganze Kette:
 * Formular-Sicht (getEventTimingConfig), Board-Sicht (getSettings) und das Ueberschreiben.
 */
class TimingFalseStartSequenceTest {

    /** Genau der produktiv gespeicherte Alt-Stand: 200-Hz-Saegezahn, 2000 ms, gehalten mit 0 ms. */
    private val storedSingleTone =
        JSONB.jsonb("""{"frequencyHz":200,"durationMillis":2000,"releaseMillis":0,"waveform":"SAWTOOTH"}""")

    private val ownSequence = listOf(
        ToneStep(offsetMillis = 0, frequencyHz = 300, durationMillis = 200, releaseMillis = 0, waveform = ToneWaveform.SQUARE),
        ToneStep(offsetMillis = 500, frequencyHz = 260, durationMillis = 900, releaseMillis = 250, waveform = ToneWaveform.SQUARE),
    )

    /** Den Alt-Stand direkt in die Spalte schreiben - so, wie ihn die alte Fassung hinterliess. */
    private fun storeRaw(eventId: UUID, value: JSONB?): App<Any?, Unit> = Jooq.query {
        update(EVENT).set(EVENT.TIMING_FALSE_START_TONE, value).where(EVENT.ID.eq(eventId)).execute()
    }.map { }

    private fun readRaw(eventId: UUID): App<Any?, JSONB?> = Jooq.query {
        select(EVENT.TIMING_FALSE_START_TONE).from(EVENT).where(EVENT.ID.eq(eventId)).fetchOne()
            ?.value1()
    }

    private fun saveSequence(
        eventId: UUID,
        userId: UUID,
        sequence: List<ToneStep>?,
    ): App<Any?, Unit> = TimingConfigService.updateEventTimingConfig(
        eventId,
        userId,
        EventTimingConfigRequest(
            timingSystem = TimingSystem.INTERN,
            startlistConfig = null,
            resultImportConfig = null,
            autoPull = false,
            intervalActiveSeconds = 5,
            intervalUpcomingSeconds = 60,
            watchBeforeMinutes = 15,
            watchAfterMinutes = 120,
            timingPrecision = TimingPrecision.ZEHNTEL,
            finishTone = null,
            splitTone = null,
            falseStartTone = sequence,
            showManualCapture = false,
            startDisplay = null,
        ),
    ).map { }

    // ---------------------------------------------------------------- Bestandsschutz

    @Test
    fun aStoredSingleToneSurvivesAsAOneElementSequence() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()
        !storeRaw(eventId, storedSingleTone)

        // Formular-Sicht: unaufgeloest, aber schon als Folge - der Editor zeigt EINE Zeile.
        val form = (!TimingConfigService.getEventTimingConfig(eventId)).dto
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
            form.falseStartTone,
        )

        // Board-Sicht: derselbe Klang, aufgeloest ausgeliefert - kein Board faellt auf den
        // eingebauten Standard zurueck, nur weil die Spalte noch die alte Gestalt hat.
        val settings = (!TimingOfficialTimeService.getSettings(eventId)).dto
        assertEquals(form.falseStartTone, settings.falseStartTone)
        assertEquals(2000, settings.falseStartTone.single().durationMillis)

        // Und in der Datenbank steht immer noch der unangetastete Alt-Stand: Lesen migriert nicht.
        assertTrue((!readRaw(eventId))!!.data().trimStart().startsWith("{"))
    }

    @Test
    fun savingOverAStoredSingleToneWritesAnArray() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !storeRaw(eventId, storedSingleTone)
        !saveSequence(eventId, userId, ownSequence)

        // Ab dem ersten Speichern liegt die neue Gestalt in der Spalte ...
        assertTrue((!readRaw(eventId))!!.data().trimStart().startsWith("["))
        // ... und kommt unveraendert wieder hoch.
        assertEquals(ownSequence, (!TimingConfigService.getEventTimingConfig(eventId)).dto.falseStartTone)
        assertEquals(ownSequence, (!TimingOfficialTimeService.getSettings(eventId)).dto.falseStartTone)
    }

    // ---------------------------------------------------------------- Standard und Zuruecksetzen

    @Test
    fun anUnconfiguredEventGetsTheBuiltInSequence() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        // Unaufgeloest bleibt null - nur so kann das Formular "Standard wiederherstellen" anbieten.
        assertNull((!TimingConfigService.getEventTimingConfig(eventId)).dto.falseStartTone)
        // Aufgeloest liefert der Server die eingebaute kurz-kurz-lang-Folge.
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.falseStartTone,
        )
    }

    @Test
    fun savingNullClearsTheColumnAndRestoresTheBuiltInSequence() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !saveSequence(eventId, userId, ownSequence)
        assertNotNull(!readRaw(eventId))

        !saveSequence(eventId, userId, null)

        assertNull(!readRaw(eventId))
        assertNull((!TimingConfigService.getEventTimingConfig(eventId)).dto.falseStartTone)
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingOfficialTimeService.getSettings(eventId)).dto.falseStartTone,
        )
    }

    @Test
    fun theBuiltInSequenceRoundTripsThroughTheColumn() = testComprehension {
        // Der Standard muss auch als AUSDRUECKLICH gespeicherter Wert durchkommen (wer ihn im
        // Editor nachbaut und speichert, statt zurueckzusetzen).
        val (eventId, userId) = !createTestEventWithAdmin()
        !saveSequence(eventId, userId, TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE)
        assertEquals(
            TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE,
            (!TimingConfigService.getEventTimingConfig(eventId)).dto.falseStartTone,
        )
    }
}
