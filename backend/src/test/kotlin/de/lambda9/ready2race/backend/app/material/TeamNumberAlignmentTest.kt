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
}
