package de.lambda9.ready2race.backend.app.raceclocker

import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchRepo
import de.lambda9.ready2race.backend.app.raceclocker.control.RaceClockerPollRepo
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionPropertiesRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupMatchRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.EventScheduleSlotRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.RaceclockerRaceRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.StartlistExportConfigRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_PROPERTIES
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT
import de.lambda9.ready2race.backend.database.generated.tables.references.EVENT_SCHEDULE_SLOT
import de.lambda9.ready2race.backend.database.generated.tables.references.RACECLOCKER_RACE
import de.lambda9.ready2race.backend.database.generated.tables.references.STARTLIST_EXPORT_CONFIG
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * [RaceClockerPollRepo.getCandidates] gegen eine echte Datenbank.
 *
 * Diese Abfrage ist die einzige Stelle des automatischen Abrufs, die sich nicht als reine Funktion
 * prüfen lässt - und genau dort ist der eine Fehler entstanden, der es in den Branch geschafft hat:
 * ein wiederverwendeter aliasierter Ausdruck, den jOOQ im WHERE als blanken Alias-Bezeichner
 * rendert, was Postgres ablehnt. Kein noch so aufmerksames Lesen fängt so etwas; ein Testlauf gegen
 * Postgres schon. Deshalb steht hier jeder Ausschluss der Abfrage einmal als eigener Fall.
 */
class RaceClockerPollRepoTest {

    private val now: LocalDateTime = LocalDateTime.of(2026, 8, 14, 10, 0)

    private val raceUrl = "https://www.raceclocker.com/race"

    private fun TestComprehensionScope<JEnv>.insertRace(
        eventId: UUID,
        name: String,
        url: String,
        position: Int,
    ): UUID {
        val raceId = UUID.randomUUID()
        !RACECLOCKER_RACE.insert(
            RaceclockerRaceRecord(
                id = raceId,
                event = eventId,
                name = name,
                resultsUrl = url,
                capturesLaps = false,
                position = position,
                createdAt = now,
                updatedAt = now,
            )
        )
        return raceId
    }

    private fun TestComprehensionScope<JEnv>.insertStartlistConfig(name: String): UUID {
        val configId = UUID.randomUUID()
        !STARTLIST_EXPORT_CONFIG.insert(
            StartlistExportConfigRecord(
                id = configId,
                name = name,
                createdAt = now,
                updatedAt = now,
            )
        )
        return configId
    }

    /** Was der Seed hinterlassen hat - die Kennungen, an denen die Tests ziehen. */
    private data class Seeded(
        val eventId: UUID,
        val competitionId: UUID,
        val raceId: UUID?,
        val roundId: UUID,
        val matchId: UUID,
        /** Nur belegt, wenn zusätzlich eine Qualifikationsrunde angelegt wurde. */
        val qualificationRoundId: UUID?,
        val qualificationMatchId: UUID?,
    )

    /**
     * Eine Veranstaltung mit einem Wettkampf und einem Lauf, so knapp wie die Joins von
     * `getCandidates` es zulassen: Veranstaltung, Wettkampf, Eigenschaften, Ablauf, Runde,
     * Setup-Lauf, Lauf. Mannschaften braucht die Abfrage nicht - sie zählt keine Boote.
     *
     * Der Wettkampf trägt weiterhin seine Anwahl (`raceclocker_race`) - der Knopf-Weg liest sie
     * noch; die Abfrage des Jobs nicht mehr. Mit [withQualificationRound] kommt eine
     * Qualifikationsrunde samt eigenem Lauf dazu: zwei Läufe in zwei Runden desselben Wettkampfs.
     */
    private fun TestComprehensionScope<JEnv>.seed(
        eventTimingSystem: String? = TimingSystem.RACECLOCKER.name,
        competitionTimingSystem: String? = null,
        raceResultsUrl: String? = raceUrl,
        withQualificationRound: Boolean = false,
        eventStartlistConfig: UUID? = null,
        competitionStartlistConfig: UUID? = null,
        activated: Boolean = true,
        startedAt: LocalDateTime? = null,
        finishedAt: LocalDateTime? = null,
        autoPausedAt: LocalDateTime? = null,
        slotSkippedAt: LocalDateTime? = null,
        withSlot: Boolean = false,
    ): Seeded {
        val eventId = UUID.randomUUID()
        val competitionId = UUID.randomUUID()
        val propertiesId = UUID.randomUUID()
        val roundId = UUID.randomUUID()
        val matchId = UUID.randomUUID()

        !EVENT.insert(
            EventRecord(
                id = eventId,
                name = "Testregatta",
                createdAt = now,
                updatedAt = now,
                timingSystem = eventTimingSystem,
                raceclockerAutoPull = true,
                startlistConfig = eventStartlistConfig,
            )
        )

        // Die Rennen gehören der Veranstaltung; der Wettkampf zeigt auf genau eines davon.
        val raceId = raceResultsUrl?.let { insertRace(eventId, "Kurzstrecke", it, 1) }

        !COMPETITION.insert(
            CompetitionRecord(
                id = competitionId,
                event = eventId,
                createdAt = now,
                updatedAt = now,
                timingSystem = competitionTimingSystem,
                raceclockerRace = raceId,
                startlistConfig = competitionStartlistConfig,
            )
        )

        !COMPETITION_PROPERTIES.insert(
            CompetitionPropertiesRecord(
                id = propertiesId,
                competition = competitionId,
                identifier = "1",
                name = "Vierer",
                shortName = "JM4x",
            )
        )

        !COMPETITION_SETUP.insert(
            CompetitionSetupRecord(
                competitionProperties = propertiesId,
                createdAt = now,
                updatedAt = now,
            )
        )

        !COMPETITION_SETUP_ROUND.insert(
            CompetitionSetupRoundRecord(
                id = roundId,
                competitionSetup = propertiesId,
                name = "Finale",
                required = true,
                useDefaultSeeding = true,
                placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                isQualification = false,
            )
        )

        !COMPETITION_SETUP_MATCH.insert(
            CompetitionSetupMatchRecord(
                id = matchId,
                competitionSetupRound = roundId,
                weighting = 1,
                name = "Lauf 1",
                executionOrder = 1,
            )
        )

        !COMPETITION_MATCH.insert(
            CompetitionMatchRecord(
                competitionSetupMatch = matchId,
                startTime = now,
                createdAt = now,
                updatedAt = now,
                activatedAt = if (activated) now else null,
                startedAt = startedAt,
                finishedAt = finishedAt,
                raceclockerAutoPausedAt = autoPausedAt,
            )
        )

        // Die Qualifikationsrunde ist Turnierstruktur (Setzung, Weiterkommen) und für sich keine
        // Weiche der Zeitnahme - welches Rennen gilt, sagt allein der Zeitnahmeprofil-Baum.
        var qualificationRoundId: UUID? = null
        var qualificationMatchId: UUID? = null
        if (withQualificationRound) {
            val qualiRoundId = UUID.randomUUID()
            qualificationRoundId = qualiRoundId
            qualificationMatchId = UUID.randomUUID()

            !COMPETITION_SETUP_ROUND.insert(
                CompetitionSetupRoundRecord(
                    id = qualiRoundId,
                    competitionSetup = propertiesId,
                    nextRound = roundId,
                    name = "Qualifikation",
                    required = true,
                    useDefaultSeeding = true,
                    placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                    isQualification = true,
                )
            )
            !COMPETITION_SETUP_MATCH.insert(
                CompetitionSetupMatchRecord(
                    id = qualificationMatchId,
                    competitionSetupRound = qualiRoundId,
                    weighting = 1,
                    name = "Zeitlauf 1",
                    executionOrder = 1,
                )
            )
            !COMPETITION_MATCH.insert(
                CompetitionMatchRecord(
                    competitionSetupMatch = qualificationMatchId,
                    startTime = now.minusHours(2),
                    createdAt = now,
                    updatedAt = now,
                    activatedAt = if (activated) now else null,
                )
            )
        }

        if (withSlot || slotSkippedAt != null) {
            !EVENT_SCHEDULE_SLOT.insert(
                EventScheduleSlotRecord(
                    id = UUID.randomUUID(),
                    event = eventId,
                    startTime = now,
                    competitionSetupMatch = matchId,
                    skippedAt = slotSkippedAt,
                    createdAt = now,
                    updatedAt = now,
                )
            )
        }

        return Seeded(eventId, competitionId, raceId, roundId, matchId, qualificationRoundId, qualificationMatchId)
    }

    @Test
    fun aRunningMatchOfARaceClockerEventIsACandidate() = testComprehension {
        val seeded = seed()

        val candidates = !RaceClockerPollRepo.getCandidates(seeded.eventId)

        val candidate = candidates.singleOrNull()
        assertNotNull(candidate, "Der Lauf hätte als Kandidat zurückkommen müssen, kam aber nicht: $candidates")
        assertEquals(seeded.matchId, candidate.matchId)
        assertNotNull(candidate.activatedAt)
        assertEquals(now, candidate.startTime)
        // Wettkampf und Runde tragen den Pfad, mit dem der Takt das Rennen auflöst.
        assertEquals(seeded.competitionId, candidate.competitionId)
        assertEquals(seeded.roundId, candidate.roundId)
        // Die Wellenbezeichnung entsteht wie beim Startlisten-Export aus Startzeit, Wettkampf
        // (Rennnummer und Kürzel) und Laufname - hier zugleich der Beleg, dass die beiden
        // Wettkampf-Spalten aus competition_properties in der Projektion ankommen.
        assertEquals("10:00 | 1 JM4x | Lauf 1", candidate.waveName)
    }

    /**
     * Aktivierung und Ist-Start kommen getrennt zurück. Daran hängt der Zweig in
     * `RaceClockerPollService.pollMatch`, der den gemessenen Start eines bereits an den Start
     * gerufenen Laufs nachträgt: Er greift genau dann, wenn `startedAt` null ist. Käme die Spalte
     * nicht mit, bliebe ein von der Kette aktivierter Lauf für immer "in Vorbereitung".
     */
    @Test
    fun anActivatedMatchIsReportedWithoutARealStartUntilOneIsStamped() = testComprehension {
        val preparing = (!RaceClockerPollRepo.getCandidates(seed().eventId)).single()
        assertNotNull(preparing.activatedAt)
        assertEquals(null, preparing.startedAt)

        val runningEventId = seed(startedAt = now.plusMinutes(2)).eventId
        val running = (!RaceClockerPollRepo.getCandidates(runningEventId)).single()
        assertEquals(now.plusMinutes(2), running.startedAt)
    }

    /** Der Job beendet nie einen Lauf und fasst einen beendeten auch nicht mehr an. */
    @Test
    fun aFinishedMatchIsExcluded() = testComprehension {
        val eventId = seed(finishedAt = now).eventId

        assertEquals(emptyList(), !RaceClockerPollRepo.getCandidates(eventId))
    }

    /**
     * Wer von Hand eingetragen hat, hat das letzte Wort - aber nur für DIESEN Lauf. Der pausierte
     * Lauf kommt deshalb weiter als Kandidat zurück, markiert über [RaceClockerPollCandidate
     * .autoPausedAt]: Der Job überspringt sein Schreiben, aber seine Aktivierung zählt weiter für
     * den Takt der Veranstaltung. Als die Abfrage ihn noch herausfilterte, schaltete eine
     * Handeingabe in den einzigen aktivierten Lauf die ganze Veranstaltung auf den langsamen
     * Takt - für die übrigen Läufe der Runde sah das aus, als stünde der Abruf (Regattatag
     * 14.08.2026).
     */
    @Test
    fun aPausedMatchStaysACandidateAndCarriesItsPause() = testComprehension {
        val seeded = seed(autoPausedAt = now)

        val candidate = (!RaceClockerPollRepo.getCandidates(seeded.eventId)).single()
        assertEquals(seeded.matchId, candidate.matchId)
        assertEquals(now, candidate.autoPausedAt)
    }

    /** Die Gegenprobe zur Markierung: Ein unpausierter Lauf trägt keine. */
    @Test
    fun anUnpausedMatchCarriesNoPause() = testComprehension {
        val seeded = seed()

        assertEquals(null, (!RaceClockerPollRepo.getCandidates(seeded.eventId)).single().autoPausedAt)
    }

    /**
     * Das Zeitnahme-System gilt nur noch an der Veranstaltung: Zwei Zeitnahme-Softwares in einer
     * Regatta gibt es nicht. Ein Wettkampf mit eigenem Eintrag ändert deshalb nichts mehr - vorher
     * hätte dieser Wettkampf den Abruf für seine Läufe abgeschaltet.
     *
     * Der Fall stützt sich noch auf die Spalte `competition.timing_system`; er wird gegenstandslos,
     * sobald sie fällt - dann erzwingt das Schema, was hier steht.
     */
    @Test
    fun aCompetitionOverridingTheTimingSystemChangesNothing() = testComprehension {
        val seeded = seed(competitionTimingSystem = TimingSystem.WEBSCORER.name)

        assertEquals(listOf(seeded.matchId), (!RaceClockerPollRepo.getCandidates(seeded.eventId)).map { it.matchId })
    }

    /** Ohne Zeitnahmesystem - der Zustand jeder Bestandsveranstaltung - gibt es nichts abzurufen. */
    @Test
    fun anEventWithoutATimingSystemHasNoCandidates() = testComprehension {
        val eventId = seed(eventTimingSystem = null).eventId

        assertEquals(emptyList(), !RaceClockerPollRepo.getCandidates(eventId))
    }

    /**
     * Die Abfrage kennt keine Rennen mehr: Seit dem Zeitnahmeprofil-Baum hängt das Rennen an einer
     * von vier Ebenen, und eine Ebenen-Auflösung gehört nicht in eine where-Klausel. Der Lauf kommt
     * deshalb auch ohne Rennen zurück - dass er ohne aufgelöstes Rennen trotzdem nicht abgerufen
     * wird, hält `RaceClockerPollLogicTest` fest (die Wirkung des früheren INNEREN Joins).
     */
    @Test
    fun aMatchWithoutARaceIsStillReturnedByTheQuery() = testComprehension {
        val seeded = seed(raceResultsUrl = null)

        assertEquals(listOf(seeded.matchId), (!RaceClockerPollRepo.getCandidates(seeded.eventId)).map { it.matchId })
    }

    /**
     * Ein abgesagter Slot bleibt abgesagt, auch wenn in RaceClocker jemand die Welle startet -
     * sonst aktivierte der Job einen Lauf, den das Regattabüro gestrichen hat.
     */
    @Test
    fun aMatchOnASkippedScheduleSlotIsExcluded() = testComprehension {
        val eventId = seed(slotSkippedAt = now).eventId

        assertEquals(emptyList(), !RaceClockerPollRepo.getCandidates(eventId))
    }

    /** Ein vorhandener, aber nicht abgesagter Slot ändert nichts. */
    @Test
    fun aMatchOnALiveScheduleSlotStaysACandidate() = testComprehension {
        val seeded = seed(withSlot = true)

        assertEquals(listOf(seeded.matchId), (!RaceClockerPollRepo.getCandidates(seeded.eventId)).map { it.matchId })
    }

    /**
     * Beide Runden eines Wettkampfs kommen zurück, jede mit IHRER Runde. Die Rundenart ist
     * Turnierstruktur (`competition_setup_round.is_qualification`) und keine Weiche für die
     * Rennwahl; welches Rennen gilt, entscheidet der Zeitnahmeprofil-Baum - und der braucht genau
     * diese Runden-Id, um einer Qualifikation ein anderes Rennen geben zu können als der Folgerunde.
     */
    @Test
    fun aQualificationAndAFollowingRoundComeBackWithTheirOwnRound() = testComprehension {
        val seeded = seed(withQualificationRound = true)

        val candidates = !RaceClockerPollRepo.getCandidates(seeded.eventId)
        assertEquals(2, candidates.size, "Beide Läufe hätten Kandidaten sein müssen: $candidates")

        val byMatch = candidates.associateBy { it.matchId }
        val qualification = byMatch.getValue(seeded.qualificationMatchId!!)
        val following = byMatch.getValue(seeded.matchId)

        assertEquals(seeded.qualificationRoundId, qualification.roundId)
        assertEquals(seeded.roundId, following.roundId)
        assertEquals(seeded.competitionId, qualification.competitionId)
        assertEquals(seeded.competitionId, following.competitionId)
    }

    /** Ein anderer Veranstaltungs-Filter darf nichts durchlassen. */
    @Test
    fun candidatesAreScopedToTheirEvent() = testComprehension {
        seed()

        assertEquals(emptyList(), !RaceClockerPollRepo.getCandidates(UUID.randomUUID()))
    }

    /**
     * Der Knopf-Weg holt sein Rennen über eine eigene Abfrage mit eigener Join-Kette
     * (`CompetitionMatchRepo.getForRaceClockerPull`) und liest dafür weiterhin die Anwahl am
     * Wettkampf - anders als der Job, der sein Rennen inzwischen aus dem Zeitnahmeprofil-Baum
     * auflöst. Auch diese Abfrage steht einmal gegen echtes Postgres, und auch hier gilt:
     * Qualifikations- und Folgerunden-Lauf desselben Wettkampfs zeigen auf dasselbe Rennen.
     */
    @Test
    fun theButtonPathReadsTheSelectionAtTheCompetition() = testComprehension {
        val seeded = seed(withQualificationRound = true)

        val following = !CompetitionMatchRepo.getForRaceClockerPull(seeded.matchId)
        val qualification = !CompetitionMatchRepo.getForRaceClockerPull(seeded.qualificationMatchId!!)

        assertNotNull(following)
        assertNotNull(qualification)
        // Derselbe Wellenname wie beim Job - beide Abfragen muessen ihn gleich bauen, sonst findet
        // der eine Weg die Welle und der andere nicht.
        assertEquals("10:00 | 1 JM4x | Lauf 1", following.waveName)
        assertEquals(seeded.raceId, following.race?.id)
        assertEquals(seeded.raceId, qualification.race?.id)
        assertEquals("Kurzstrecke", following.race?.name)
        assertEquals(listOf(raceUrl), following.candidateUrls)
    }

    /**
     * Das Startlisten-Preset gehört zur Veranstaltung: Alle Wettkämpfe exportieren dieselben
     * Spalten. Jeder Lauf - Qualifikation wie Folgerunde - bekommt deshalb dasselbe Preset, und ein
     * eigener Wert am Wettkampf ändert daran nichts mehr (auch dieser Fall wird gegenstandslos,
     * sobald die Spalte fällt).
     */
    @Test
    fun theStartListConfigComesFromTheEventAlone() = testComprehension {
        val eventConfig = insertStartlistConfig("Veranstaltungs-Preset")
        val ownConfig = insertStartlistConfig("Eigenes Preset")

        val inheriting = seed(withQualificationRound = true, eventStartlistConfig = eventConfig)
        assertEquals(eventConfig, (!CompetitionMatchRepo.getStartListConfigTarget(inheriting.matchId))?.configId)
        assertEquals(
            eventConfig,
            (!CompetitionMatchRepo.getStartListConfigTarget(inheriting.qualificationMatchId!!))?.configId,
        )

        // Der eigene Wert des Wettkampfs zählt nicht mehr.
        val overriding = seed(eventStartlistConfig = eventConfig, competitionStartlistConfig = ownConfig)
        assertEquals(eventConfig, (!CompetitionMatchRepo.getStartListConfigTarget(overriding.matchId))?.configId)

        // Nichts konfiguriert: null heißt "kein Preset", nicht "Lauf nicht gefunden".
        val unconfigured = seed()
        assertEquals(null, (!CompetitionMatchRepo.getStartListConfigTarget(unconfigured.matchId))?.configId)
    }
}
