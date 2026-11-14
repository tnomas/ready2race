package de.lambda9.ready2race.backend.app.material

import de.lambda9.ready2race.backend.app.material.boundary.TeamNumberAlignment
import java.util.UUID
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Reiner Funktionstest ohne DB (Spec Abschnitt 8, Task 4.2): Mietteams zufällig auf die freien
 * Bootsnummern, eigene Boote von 1 aufwärts auf Nummern, die keine Bootsnummer sind, überzählige
 * Mietteams auf freie Nummern oberhalb der höchsten Bootsnummer.
 */
class TeamNumberAlignmentTest {

    private val a = UUID.randomUUID()
    private val b = UUID.randomUUID()
    private val c = UUID.randomUUID()
    private val d = UUID.randomUUID()

    @Test
    fun rentedTeamsGetBoatNumbers() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1, 2, 3), b to listOf(1, 2, 3)), listOf(c, d), emptySet(), Random(1))
        assertTrue(r[a] in 1..3 && r[b] in 1..3 && r[a] != r[b])
        assertEquals(setOf(4, 5), setOf(r[c], r[d]))      // eigene Boote meiden die Bootsnummern 1..3
    }

    @Test
    fun overflowRentedGoAboveFleet() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1, 2), b to listOf(1, 2), c to listOf(1, 2)), listOf(d), emptySet(), Random(1))
        val overflow = listOf(a, b, c).map { r[it]!! }.single { it > 2 }
        assertTrue(overflow > 2); assertEquals(3, r[d])   // d nimmt die erste Nicht-Bootsnummer, das überzählige Mietteam die nächste darüber
    }

    @Test
    fun takenNumbersAreSkipped() {
        val r = TeamNumberAlignment.align(mapOf(a to listOf(1, 2, 3)), listOf(b), setOf(1, 4), Random(1))
        assertTrue(r[a] in setOf(2, 3)); assertEquals(5, r[b])
    }

    /** RB-04: Eine Grundzuteilung legt die Nummer fest - über jeden Zufall hinweg. */
    @Test
    fun fixedNumbersWinOverTheLottery() {
        repeat(20) { seed ->
            val r = TeamNumberAlignment.align(
                rented = mapOf(a to listOf(3, 5), b to listOf(3, 5)),
                own = listOf(c),
                taken = emptySet(),
                random = Random(seed),
                fixed = mapOf(a to 5),
            )
            assertEquals(5, r[a])
            assertEquals(3, r[b])                       // b bekommt die übrige Bootsnummer
            assertEquals(1, r[c])
        }
    }

    /** Zwei Meldungen wollen dieselbe feste Nummer: eine bekommt sie, die andere läuft normal weiter. */
    @Test
    fun collidingFixedNumbersStayUnique() {
        repeat(20) { seed ->
            val r = TeamNumberAlignment.align(
                rented = mapOf(a to listOf(3, 5), b to listOf(3, 5)),
                own = emptyList(),
                taken = emptySet(),
                random = Random(seed),
                fixed = mapOf(a to 5, b to 5),
            )
            assertEquals(setOf(3, 5), setOf(r[a], r[b]))
        }
    }

    /** "Nummern behalten": eine schon vergebene feste Nummer wird nicht doppelt vergeben. */
    @Test
    fun fixedNumberAlreadyTakenFallsBack() {
        val r = TeamNumberAlignment.align(
            rented = emptyMap(),
            own = emptyList(),
            taken = setOf(5),
            random = Random(1),
            fixed = mapOf(a to 5),
        )
        assertTrue(r[a] != 5)
        assertEquals(1, r.size)
    }
}
