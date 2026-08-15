package de.lambda9.ready2race.backend.app.participantRequirement

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.ParticipantRequirementService
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.RequirementScopeLogic
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.RequirementScopeLogic.Fulfillment
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.RequirementScopeLogic.MatchScope
import de.lambda9.ready2race.backend.app.participantRequirement.boundary.RequirementScopeLogic.Scope
import de.lambda9.ready2race.backend.app.participantRequirement.control.ParticipantHasRequirementForEventRepo
import de.lambda9.ready2race.backend.app.participantRequirement.entity.ParticipantRequirementCheckSingleDto
import de.lambda9.ready2race.backend.database.generated.enums.Gender
import de.lambda9.ready2race.backend.database.generated.tables.records.AppUserRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ClubRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventDayRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventHasParticipantRequirementRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantRequirementRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.APP_USER
import de.lambda9.ready2race.backend.database.generated.tables.references.CLUB
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_DAY
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_HAS_PARTICIPANT_REQUIREMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT_REQUIREMENT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Der Schreibweg der App am Steg: was beim Abhaken tatsächlich in der Datenbank landet.
 *
 * Anlass ist der Fall des Auftraggebers: Eine Waage gilt je Wettkampf **und** je Tag. Wer heute um
 * 14 Uhr startet, wiegt zwischen 12 und 13 Uhr; wer zusätzlich um 16 Uhr startet, wiegt für diesen
 * Lauf noch einmal. Die Wiegung von gestern zählt heute nicht.
 *
 * Die Auswertungsregel selbst steht ohne Datenbank in [RequirementScopeLogicTest] - hier geht es um
 * die Zeilen, auf die sie später angewendet wird.
 */
class RequirementCheckScopeServiceTest {

    private val now: LocalDateTime = LocalDateTime.of(2026, 8, 15, 12, 0)
    private val samstag: LocalDate = LocalDate.of(2026, 8, 15)
    private val sonntag: LocalDate = LocalDate.of(2026, 8, 16)

    private class Seed(
        val eventId: UUID,
        val tag1: UUID,
        val tag2: UUID,
        val wettkampfA: UUID,
        val wettkampfB: UUID,
        val ilka: UUID,
        val bo: UUID,
        val requirementId: UUID,
        val userId: UUID,
    )

    /**
     * Zwei Tage, zwei Wettkämpfe, zwei Personen. Zwei Personen deshalb, weil ein Teil der Prüfung
     * genau darin besteht, dass das Abhaken bei der einen die andere nicht anfasst.
     */
    private fun TestComprehensionScope<JEnv>.seed(
        perEventDay: Boolean,
        perCompetition: Boolean,
    ): Seed {
        val eventId = UUID.randomUUID()
        !EVENT.insert(EventRecord(id = eventId, name = "Testregatta", createdAt = now, updatedAt = now))

        val tag1 = UUID.randomUUID()
        !EVENT_DAY.insert(EventDayRecord(id = tag1, event = eventId, date = samstag, createdAt = now, updatedAt = now))
        val tag2 = UUID.randomUUID()
        !EVENT_DAY.insert(EventDayRecord(id = tag2, event = eventId, date = sonntag, createdAt = now, updatedAt = now))

        val wettkampfA = UUID.randomUUID()
        !COMPETITION.insert(CompetitionRecord(id = wettkampfA, event = eventId, createdAt = now, updatedAt = now))
        val wettkampfB = UUID.randomUUID()
        !COMPETITION.insert(CompetitionRecord(id = wettkampfB, event = eventId, createdAt = now, updatedAt = now))

        val clubId = UUID.randomUUID()
        !CLUB.insert(ClubRecord(id = clubId, name = "Testverein", createdAt = now, updatedAt = now))

        fun person(vorname: String, nachname: String): UUID {
            val id = UUID.randomUUID()
            !PARTICIPANT.insert(
                ParticipantRecord(
                    id = id,
                    club = clubId,
                    firstname = vorname,
                    lastname = nachname,
                    year = 1990,
                    gender = Gender.F,
                    createdAt = now,
                    updatedAt = now,
                )
            )
            return id
        }

        val ilka = person("Ilka", "Testerin")
        val bo = person("Bo", "Zweite")

        val requirementId = UUID.randomUUID()
        !PARTICIPANT_REQUIREMENT.insert(
            ParticipantRequirementRecord(
                id = requirementId,
                name = "Waage-${UUID.randomUUID()}",
                optional = false,
                perEventDay = perEventDay,
                perCompetition = perCompetition,
                createdAt = now,
                updatedAt = now,
            )
        )
        // Erst diese Zeile macht die Bedingung an der Veranstaltung "aktiv" - ohne sie findet der
        // Dienst sie nicht (siehe die Sicht participant_requirement_for_event).
        !EVENT_HAS_PARTICIPANT_REQUIREMENT.insert(
            EventHasParticipantRequirementRecord(
                event = eventId,
                participantRequirement = requirementId,
                qrCodeRequired = false,
                createdAt = now,
            )
        )

        val userId = UUID.randomUUID()
        !APP_USER.insert(
            AppUserRecord(
                id = userId,
                email = "steg-$userId@example.org",
                password = "x",
                firstname = "Steg",
                lastname = "Posten",
                language = "de",
                createdAt = now,
                updatedAt = now,
            )
        )

        return Seed(eventId, tag1, tag2, wettkampfA, wettkampfB, ilka, bo, requirementId, userId)
    }

    private fun TestComprehensionScope<JEnv>.abhaken(
        seed: Seed,
        participantId: UUID,
        eventDay: UUID? = null,
        competition: UUID? = null,
        checked: Boolean = true,
        note: String? = null,
    ) = ParticipantRequirementService.setRequirementCheckForParticipant(
        seed.eventId,
        ParticipantRequirementCheckSingleDto(
            requirementId = seed.requirementId,
            participantId = participantId,
            checked = checked,
            note = note,
            eventDay = eventDay,
            competition = competition,
        ),
        seed.userId,
    )

    private fun TestComprehensionScope<JEnv>.zeilen(seed: Seed, participantId: UUID) =
        (!ParticipantHasRequirementForEventRepo.getFulfillments(seed.eventId, participantId))
            .map { Fulfillment(eventDay = it.eventDay, competition = it.competition) }

    // -------------------------------------------------------------------------------------
    // Der Kernfall des Auftraggebers
    // -------------------------------------------------------------------------------------

    /**
     * Die Wiegung von gestern zählt heute nicht, und die für den einen Wettkampf nicht für den
     * anderen. Geprüft wird über den echten Schreibweg: erst abhaken, dann auswerten.
     */
    @Test
    fun aCheckForOneCompetitionOnOneDayCoversExactlyThatMatch() = testComprehension {
        val seed = seed(perEventDay = true, perCompetition = true)
        val scope = Scope(perEventDay = true, perCompetition = true)

        !abhaken(seed, seed.ilka, eventDay = seed.tag1, competition = seed.wettkampfA)

        val gespeichert = zeilen(seed, seed.ilka)
        assertEquals(listOf(Fulfillment(seed.tag1, seed.wettkampfA)), gespeichert)

        assertTrue(
            RequirementScopeLogic.isFulfilled(scope, gespeichert, MatchScope(seed.tag1, seed.wettkampfA)),
            "Der Lauf, für den gewogen wurde",
        )
        assertFalse(
            RequirementScopeLogic.isFulfilled(scope, gespeichert, MatchScope(seed.tag2, seed.wettkampfA)),
            "Die Wiegung von gestern darf heute nicht gelten",
        )
        assertFalse(
            RequirementScopeLogic.isFulfilled(scope, gespeichert, MatchScope(seed.tag1, seed.wettkampfB)),
            "Die Wiegung für Wettkampf A darf für B nicht gelten",
        )
    }

    /** Zwei Rennen an einem Tag heißt zwei Wiegungen - beide stehen nebeneinander. */
    @Test
    fun twoRacesOnOneDayNeedTwoChecksAndBothSurvive() = testComprehension {
        val seed = seed(perEventDay = true, perCompetition = true)
        val scope = Scope(perEventDay = true, perCompetition = true)

        !abhaken(seed, seed.ilka, eventDay = seed.tag1, competition = seed.wettkampfA)
        !abhaken(seed, seed.ilka, eventDay = seed.tag1, competition = seed.wettkampfB)

        val gespeichert = zeilen(seed, seed.ilka)
        assertEquals(2, gespeichert.size)
        assertTrue(RequirementScopeLogic.isFulfilled(scope, gespeichert, MatchScope(seed.tag1, seed.wettkampfA)))
        assertTrue(RequirementScopeLogic.isFulfilled(scope, gespeichert, MatchScope(seed.tag1, seed.wettkampfB)))
    }

    // -------------------------------------------------------------------------------------
    // Die wichtigste Regressionsprobe: eine Bedingung ohne Schalter
    // -------------------------------------------------------------------------------------

    /**
     * Ohne Schalter bleibt alles wie vor V202608141900: eine Zeile ohne Dimensionen, die überall
     * gilt. Auch dann, wenn die App - etwa aus alter Gewohnheit - einen Tag und einen Wettkampf
     * mitschickt: über den Geltungsbereich entscheidet die Bedingung, nicht der Aufrufer.
     */
    @Test
    fun withoutSwitchesNothingChangesAndSentDimensionsAreDropped() = testComprehension {
        val seed = seed(perEventDay = false, perCompetition = false)

        !abhaken(seed, seed.ilka, eventDay = seed.tag1, competition = seed.wettkampfA)

        val gespeichert = zeilen(seed, seed.ilka)
        assertEquals(listOf(Fulfillment(null, null)), gespeichert)

        // Und diese eine Zeile deckt jeden Lauf ab - das Verhalten vor der Migration.
        listOf(
            MatchScope(seed.tag1, seed.wettkampfA),
            MatchScope(seed.tag2, seed.wettkampfA),
            MatchScope(seed.tag1, seed.wettkampfB),
            MatchScope(null, seed.wettkampfB),
        ).forEach {
            assertTrue(
                RequirementScopeLogic.isFulfilled(Scope.forWholeEvent, gespeichert, it),
                "Ohne Schalter gilt die Erfüllung auch für $it",
            )
        }
    }

    // -------------------------------------------------------------------------------------
    // Was der neue Weg ausdrücklich NICHT tut
    // -------------------------------------------------------------------------------------

    /**
     * Das Abhaken bei einer Person lässt die andere unangetastet.
     *
     * Das ist der Grund, warum die App einen eigenen Endpunkt bekommt, statt weiter
     * `approveRequirementForEvent` zu rufen: jener Weg beschreibt die vollständige Liste der
     * Erfüllten und löscht jeden, der nicht mitgeschickt wurde. Mit einer einzelnen Person im
     * Rumpf - so ruft die App - nimmt er allen anderen ihre Erfüllung weg.
     */
    @Test
    fun checkingOnePersonLeavesEveryoneElseAlone() = testComprehension {
        val seed = seed(perEventDay = false, perCompetition = false)

        !abhaken(seed, seed.bo)
        !abhaken(seed, seed.ilka)

        assertEquals(listOf(Fulfillment(null, null)), zeilen(seed, seed.bo), "Bos Nachweis bleibt stehen")
        assertEquals(listOf(Fulfillment(null, null)), zeilen(seed, seed.ilka))
    }

    /**
     * Das Zurücknehmen trifft genau eine Dimensionszeile. Wer am Sonntag den Haken entfernt, darf
     * die Wiegung vom Samstag nicht mitlöschen - sie ist ein eigener, bereits erbrachter Nachweis.
     */
    @Test
    fun uncheckingRemovesOnlyTheOneDimensionRow() = testComprehension {
        val seed = seed(perEventDay = true, perCompetition = false)

        !abhaken(seed, seed.ilka, eventDay = seed.tag1)
        !abhaken(seed, seed.ilka, eventDay = seed.tag2)
        assertEquals(2, zeilen(seed, seed.ilka).size)

        !abhaken(seed, seed.ilka, eventDay = seed.tag2, checked = false)

        assertEquals(listOf(Fulfillment(seed.tag1, null)), zeilen(seed, seed.ilka))
    }

    /**
     * Erneutes Abhaken ist kein Fehler - am Steg wird ein Haken auch mal doppelt gesetzt. Es
     * entsteht keine zweite Zeile (der eindeutige Index ließe sie ohnehin nicht zu), und die Notiz
     * wird nachgezogen.
     */
    @Test
    fun checkingTwiceUpdatesTheNoteInsteadOfFailing() = testComprehension {
        val seed = seed(perEventDay = true, perCompetition = false)

        !abhaken(seed, seed.ilka, eventDay = seed.tag1, note = "erst so")
        !abhaken(seed, seed.ilka, eventDay = seed.tag1, note = "dann so")

        val rohzeilen = !ParticipantHasRequirementForEventRepo.getFulfillments(seed.eventId, seed.ilka)
        assertEquals(1, rohzeilen.size)
        assertEquals("dann so", rohzeilen.single().note)
        // Der Zeitpunkt bleibt der der ersten Prüfung - er ist der Beleg, nicht der letzte Klick.
        assertEquals(now.toLocalDate(), rohzeilen.single().createdAt!!.toLocalDate())
    }

    // -------------------------------------------------------------------------------------
    // Wenn die verlangte Dimension fehlt
    // -------------------------------------------------------------------------------------

    /**
     * Eine Bedingung je Tag ohne Tag abzuhaken, muss scheitern. Der stillschweigende Ausweg wäre
     * schlimmer: die Zeile ohne Tag deckt bei eingeschaltetem Schalter **keinen** Lauf ab - am
     * Steg stünde ein Haken, den die Schiedsrichter-Ansicht nirgends als erfüllt liest.
     */
    @Test
    fun aMissingRequiredDimensionIsRefusedInsteadOfWrittenAsNull() = testComprehension {
        val seed = seed(perEventDay = true, perCompetition = true)

        assertKIOFails { abhaken(seed, seed.ilka, eventDay = null, competition = seed.wettkampfA) }
        assertKIOFails { abhaken(seed, seed.ilka, eventDay = seed.tag1, competition = null) }

        assertEquals(emptyList(), zeilen(seed, seed.ilka), "Nach einem abgelehnten Versuch steht nichts da")
    }
}
