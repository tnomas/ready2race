package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic.Mark
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSplitLogic.StationAtDistance
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Reine Logik der Frage „welche Zwischenzeiten ergeben diese Marken?" — ohne Datenbank, damit die
 * Regeln einzeln nachrechenbar sind. Die Regeln sind dieselben wie bei den offiziellen Zeiten:
 * die SPÄTESTE Startmarke zählt (ein neu gestartetes Team trägt mehrere), und was vor dem Start
 * liegt, ist ein Zuordnungsfehler und keine Zeit.
 */
class TimingSplitLogicTest {

    private val team = UUID.randomUUID()
    private val start = UUID.randomUUID()
    private val split1 = UUID.randomUUID()
    private val split2 = UUID.randomUUID()

    private val stations = listOf(
        StationAtDistance(split2, "Boje 2", 2000),
        StationAtDistance(split1, "Boje 1", 1000),
    )

    @Test
    fun `zählt ab dem gemessenen Start und ordnet nach Distanz`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, split2, 190_000, isStart = false),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(1 to 90_000L, 2 to 180_000L), splits.map { it.position to it.lapMillis })
        assertEquals(listOf("Boje 1", "Boje 2"), splits.map { it.name })
        assertEquals(listOf(1000, 2000), splits.map { it.distanceMeters })
    }

    // Ein neu gestartetes Team trägt mehrere Startmarken - die letzte ist der Start, den es
    // wirklich genommen hat.
    @Test
    fun `die späteste Startmarke gewinnt`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, start, 50_000, isStart = true),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(50_000L), splits.map { it.lapMillis })
    }

    @Test
    fun `ohne Startmarke gibt es keine Zwischenzeit`() {
        val splits = TimingSplitLogic.compute(
            listOf(Mark(team, split1, 100_000, isStart = false)),
            stations,
        )

        assertTrue(splits.isEmpty())
    }

    // Eine Marke vor dem Start ist ein Zuordnungsfehler, keine negative Zeit.
    @Test
    fun `eine Marke vor dem Start fällt heraus`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 100_000, isStart = true),
                Mark(team, split1, 50_000, isStart = false),
            ),
            stations,
        )

        assertTrue(splits.isEmpty())
    }

    @Test
    fun `ein Posten ohne zugeordnete Distanz zählt nicht mit`() {
        val fremd = UUID.randomUUID()
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, fremd, 100_000, isStart = false),
                Mark(team, split1, 120_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf("Boje 1"), splits.map { it.name })
        assertEquals(listOf(1), splits.map { it.position })
    }

    // Zwei Marken am selben Posten: die früheste ist die Durchfahrt, die zweite ein Doppeltipp -
    // dieselbe Regel, die die offizielle Zielzeit anwendet.
    @Test
    fun `am selben Posten zählt die früheste Marke`() {
        val splits = TimingSplitLogic.compute(
            listOf(
                Mark(team, start, 10_000, isStart = true),
                Mark(team, split1, 120_000, isStart = false),
                Mark(team, split1, 100_000, isStart = false),
            ),
            stations,
        )

        assertEquals(listOf(90_000L), splits.map { it.lapMillis })
    }
}
