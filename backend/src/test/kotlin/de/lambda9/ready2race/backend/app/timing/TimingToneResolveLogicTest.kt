package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingToneResolveLogic
import de.lambda9.ready2race.backend.app.timing.control.toJsonb
import de.lambda9.ready2race.backend.app.timing.entity.CaptureTone
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneLimits
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingToneSetRecord
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Die Auflösung „welche vier Töne hört ein Zeitnahmetyp wirklich?" - reine Logik ohne Datenbank,
 * nach dem Muster von [de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic].
 *
 * Die Kette je Ton ist kurz und hat genau eine Stelle, die man leicht falsch herum baut: Satz des
 * Typs → Vorgabesatz der Veranstaltung → eingebauter Standard. Ist ein Ton IM GEWÄHLTEN SATZ
 * leer, gilt der eingebaute Standard und NICHT der Vorgabesatz - siehe den Fall „ein leeres Feld
 * im gewählten Satz heißt Standard, nicht Vorgabesatz".
 */
class TimingToneResolveLogicTest {

    private val eventId = UUID.randomUUID()

    private val ownPlan = listOf(ToneStep(offsetMillis = 0, frequencyHz = 1200, durationMillis = 300))
    private val defaultPlan = listOf(ToneStep(offsetMillis = -1000, frequencyHz = 600, durationMillis = 100))
    private val ownSplit = CaptureTone(frequencyHz = 660, durationMillis = 120)
    private val defaultSplit = CaptureTone(frequencyHz = 770, durationMillis = 130)
    private val ownFinish = CaptureTone(frequencyHz = 990, durationMillis = 200)
    private val defaultFinish = CaptureTone(frequencyHz = 880, durationMillis = 210)
    private val ownFalseStart = listOf(ToneStep(offsetMillis = 0, frequencyHz = 300, durationMillis = 400))
    private val defaultFalseStart = listOf(ToneStep(offsetMillis = 0, frequencyHz = 250, durationMillis = 500))

    private fun toneSet(
        name: String,
        isDefault: Boolean,
        sequenceTonePlan: List<ToneStep>? = null,
        splitTone: CaptureTone? = null,
        falseStartTone: List<ToneStep>? = null,
        finishTone: CaptureTone? = null,
        tonePerBoat: Boolean = true,
    ) = TimingToneSetRecord(
        id = UUID.randomUUID(),
        event = eventId,
        name = name,
        isDefault = isDefault,
        sequenceTonePlan = sequenceTonePlan?.toJsonb(),
        splitTone = splitTone?.toJsonb(),
        falseStartTone = falseStartTone?.toJsonb(),
        finishTone = finishTone?.toJsonb(),
        tonePerBoat = tonePerBoat,
        createdAt = LocalDateTime.now(),
        updatedAt = LocalDateTime.now(),
    )

    private val vorgabesatz = toneSet(
        name = "Standard",
        isDefault = true,
        sequenceTonePlan = defaultPlan,
        splitTone = defaultSplit,
        falseStartTone = defaultFalseStart,
        finishTone = defaultFinish,
        tonePerBoat = false,
    )

    // Fall 1
    @Test
    fun `der Satz des Typs gewinnt gegen den Vorgabesatz`() {
        val eigener = toneSet(
            name = "Laut fürs Wasser",
            isDefault = false,
            sequenceTonePlan = ownPlan,
            splitTone = ownSplit,
            falseStartTone = ownFalseStart,
            finishTone = ownFinish,
            tonePerBoat = true,
        )

        val resolved = TimingToneResolveLogic.resolve(listOf(vorgabesatz, eigener), eigener.id)

        assertEquals(ownPlan, resolved.sequenceTonePlan)
        assertEquals(ownSplit, resolved.splitTone)
        assertEquals(ownFalseStart, resolved.falseStartTone)
        assertEquals(ownFinish, resolved.finishTone)
        assertEquals(true, resolved.tonePerBoat)
    }

    // Fall 2
    @Test
    fun `ein Typ ohne eigenen Satz erbt den Vorgabesatz`() {
        val fremder = toneSet(name = "Leise für die Halle", isDefault = false, sequenceTonePlan = ownPlan)

        val resolved = TimingToneResolveLogic.resolve(listOf(vorgabesatz, fremder), null)

        assertEquals(defaultPlan, resolved.sequenceTonePlan)
        assertEquals(defaultSplit, resolved.splitTone)
        assertEquals(defaultFalseStart, resolved.falseStartTone)
        assertEquals(defaultFinish, resolved.finishTone)
        assertEquals(false, resolved.tonePerBoat)
    }

    /**
     * Fall 3 - der, den man leicht falsch herum baut: Ein gewählter Satz ist eine AUSSAGE. Ein
     * leeres Feld darin heißt „eingebauter Standard", nicht „nimm den von woanders". Fiele es auf
     * den Vorgabesatz zurück, könnte niemand einen Satz bauen, der bewusst nur EINEN Ton
     * abweichen lässt und sonst schlicht der eingebaute ist.
     */
    @Test
    fun `ein leeres Feld im gewählten Satz heißt Standard, nicht Vorgabesatz`() {
        val nurZielton = toneSet(name = "Nur Ziel", isDefault = false, finishTone = ownFinish)

        val resolved = TimingToneResolveLogic.resolve(listOf(vorgabesatz, nurZielton), nurZielton.id)

        assertEquals(ownFinish, resolved.finishTone)
        // Nicht defaultSplit, nicht defaultFalseStart, nicht defaultPlan.
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, resolved.splitTone)
        assertEquals(TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE, resolved.falseStartTone)
        // Der Startplan bleibt als einziger unaufgelöst: null heißt weiterhin „eingebauter
        // Countdown", und den kennen nur die Boards.
        assertNull(resolved.sequenceTonePlan)
    }

    // Fall 4
    @Test
    fun `ohne Vorgabesatz fallen alle vier auf den eingebauten Standard`() {
        val resolved = TimingToneResolveLogic.resolve(emptyList(), null)

        assertNull(resolved.sequenceTonePlan)
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, resolved.splitTone)
        assertEquals(TimingToneLimits.DEFAULT_FALSE_START_SEQUENCE, resolved.falseStartTone)
        assertEquals(TimingToneLimits.DEFAULT_CAPTURE_TONE, resolved.finishTone)
        // Die Tonleiter je Boot ist der Datenbank-Default: an.
        assertEquals(true, resolved.tonePerBoat)
    }

    /**
     * Der Notausgang: Eine Zeit ohne Zuordnung gehört zu keinem Zeitnahmetyp, ihr Ton kommt
     * deshalb aus dem Vorgabesatz der Veranstaltung. Ohne diesen Weg bliebe genau der Griff
     * stumm, der im Ernstfall zählt.
     */
    @Test
    fun `der Vorgabesatz löst auf, ohne dass ein Typ danach fragt`() {
        val resolved = TimingToneResolveLogic.resolveDefault(listOf(vorgabesatz))

        assertEquals(defaultFinish, resolved.finishTone)
        assertEquals(defaultSplit, resolved.splitTone)
        assertEquals(defaultFalseStart, resolved.falseStartTone)
    }

    /**
     * Ein Verweis ins Leere (der Satz wurde eben gelöscht, die Zeile ist noch nicht nachgezogen)
     * ist derselbe Fall wie „nichts gewählt" - ein Board, das lieber die Vorgabe spielt als zu
     * schweigen, ist am Wasser das kleinere Übel.
     */
    @Test
    fun `ein Verweis auf einen unbekannten Satz landet beim Vorgabesatz`() {
        val resolved = TimingToneResolveLogic.resolve(listOf(vorgabesatz), UUID.randomUUID())

        assertEquals(defaultFinish, resolved.finishTone)
        assertEquals(defaultPlan, resolved.sequenceTonePlan)
    }
}
