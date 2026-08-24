package de.lambda9.ready2race.backend.app.timingProfile

import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic.Assignment
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TimingProfileResolveLogicTest {

    private val competition = UUID.randomUUID()
    private val otherCompetition = UUID.randomUUID()
    private val round = UUID.randomUUID()
    private val otherRound = UUID.randomUUID()
    private val match = UUID.randomUUID()

    private val eventProfile = UUID.randomUUID()
    private val competitionProfile = UUID.randomUUID()
    private val roundProfile = UUID.randomUUID()
    private val matchProfile = UUID.randomUUID()

    private val all = listOf(
        Assignment(null, null, null, eventProfile),
        Assignment(competition, null, null, competitionProfile),
        Assignment(competition, round, null, roundProfile),
        Assignment(competition, round, match, matchProfile),
    )

    @Test
    fun `die Partie schlägt alles darüber`() {
        assertEquals(matchProfile, TimingProfileResolveLogic.resolve(all, competition, round, match))
    }

    @Test
    fun `ohne Partie-Eintrag gilt die Runde`() {
        val assignments = all.filterNot { it.match != null }
        assertEquals(roundProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne Runden-Eintrag gilt der Wettkampf`() {
        val assignments = all.filter { it.round == null }
        assertEquals(competitionProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne Wettkampf-Eintrag gilt die Veranstaltung`() {
        val assignments = all.filter { it.competition == null }
        assertEquals(eventProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    @Test
    fun `ohne jeden Eintrag gilt nichts`() {
        assertNull(TimingProfileResolveLogic.resolve(emptyList(), competition, round, match))
    }

    // Eine Runden-Zeile deckt ausschließlich ihre Runde ab.
    @Test
    fun `die Nachbarrunde erbt nicht vom Runden-Eintrag`() {
        assertEquals(
            competitionProfile,
            TimingProfileResolveLogic.resolve(all, competition, otherRound, UUID.randomUUID()),
        )
    }

    @Test
    fun `fremde Wettkämpfe stören nicht`() {
        val assignments = all + Assignment(otherCompetition, null, null, UUID.randomUUID())
        assertEquals(matchProfile, TimingProfileResolveLogic.resolve(assignments, competition, round, match))
    }

    // Dieselbe Funktion beantwortet "was gilt auf DIESER Ebene, wenn sie erbt?" - die Oberfläche
    // braucht das für die Beschriftung "Erbt (...)".
    @Test
    fun `fragt man eine höhere Ebene ab, bleiben die tieferen Einträge außen vor`() {
        assertEquals(competitionProfile, TimingProfileResolveLogic.resolve(all, competition, null, null))
        assertEquals(eventProfile, TimingProfileResolveLogic.resolve(all, null, null, null))
    }
}
