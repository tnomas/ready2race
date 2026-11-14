package de.lambda9.ready2race.backend.app.eventRegistration

import de.lambda9.ready2race.backend.app.eventRegistration.boundary.EventRegistrationService.checkEnoughMixedSpots
import de.lambda9.ready2race.backend.app.namedParticipant.entity.NamedParticipantRequirements
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Die Sammelmeldung lässt Personen mit Geschlecht D freie Männer- und Frauenplätze füllen; was
 * dann noch übersteht, muss in die Mixed-Plätze passen. Die Zählung der freien M/F-Plätze hatte
 * einen Vorrangfehler: war ein Männerplatz frei, fielen die freien Frauenplätze weg.
 */
class CheckEnoughMixedSpotsTest {

    private fun req(m: Int, f: Int, d: Int, mixed: Int) = NamedParticipantRequirements(m, f, d, mixed)
    private fun counts(m: Int, f: Int, d: Int) = mapOf(Gender.M to m, Gender.F to f, Gender.D to d)

    @Test
    fun nonBinaryMayFillFreeMaleAndFemaleSlotsTogether() {
        // M=2, F=2 gefordert; gemeldet M=1, F=1, D=2 - beide D passen in die freien M/F-Plätze.
        assertEquals(true, checkEnoughMixedSpots(req(2, 2, 0, 0), counts(1, 1, 2)))
    }

    @Test
    fun table() {
        data class Case(val req: NamedParticipantRequirements, val counts: Map<Gender, Int>, val ok: Boolean)
        listOf(
            Case(req(2, 2, 0, 0), counts(2, 2, 0), true),
            Case(req(2, 2, 0, 0), counts(2, 1, 1), true),
            Case(req(2, 2, 0, 0), counts(1, 2, 1), true),
            Case(req(2, 2, 0, 0), counts(0, 0, 4), true),
            Case(req(2, 2, 0, 0), counts(3, 1, 0), false), // ein Mann zu viel, kein Mixed-Platz
            Case(req(2, 2, 0, 1), counts(3, 1, 0), true),
            Case(req(1, 1, 0, 1), counts(1, 1, 2), false), // ein D zu viel für einen Mixed-Platz
            Case(req(0, 0, 0, 4), counts(1, 1, 2), true),
        ).forEach { assertEquals(it.ok, checkEnoughMixedSpots(it.req, it.counts), it.toString()) }
    }
}
