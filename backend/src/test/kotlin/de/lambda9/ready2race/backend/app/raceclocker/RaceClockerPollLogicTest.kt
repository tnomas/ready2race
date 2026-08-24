package de.lambda9.ready2race.backend.app.raceclocker

import de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerPollLogic
import de.lambda9.ready2race.backend.app.raceclocker.boundary.RaceClockerPollLogic.PollMode
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerFeedRow
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerPollMatch
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerRaceRef
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileResolveLogic.Assignment
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * Die Entscheidungen des Abruf-Jobs, losgelöst von Datenbank und HTTP: welches Rennen für einen
 * Lauf gilt, wen er beobachtet, in welchem Takt, wann der Takt fällig ist, wann ein Lauf als
 * gestartet gilt und wann sich seit dem letzten Abruf überhaupt etwas geändert hat.
 */
class RaceClockerPollLogicTest {

    private val now = LocalDateTime.of(2026, 8, 14, 10, 0)

    private fun row(
        id: UUID = UUID.randomUUID(),
        rank: Int? = 1,
        result: String? = null,
        start: LocalTime? = null,
        penaltySeconds: Int? = null,
        penaltyNote: String? = null,
    ) = RaceClockerFeedRow(
        name = "Testverein",
        rank = rank,
        bib = null,
        wave = "AF1 CM1x",
        ids = listOf(id),
        result = result,
        start = start,
        penaltySeconds = penaltySeconds,
        penaltyNote = penaltyNote,
    )

    // --- Fenster ---

    @Test
    fun anActivatedMatchIsWatchedRegardlessOfItsPlannedTime() {
        assertTrue(
            RaceClockerPollLogic.isWatched(
                activated = true,
                startTime = now.minusHours(6),
                now = now,
                watchBeforeMinutes = 15,
                watchAfterMinutes = 120,
            )
        )
    }

    @Test
    fun anActivatedMatchWithoutARealStartStaysWatched() {
        // Aktiviert schlägt das Zeitfenster: Der Lauf kann längst vor oder nach seinem Plan
        // stattfinden, und was tatsächlich passiert, schlägt den Plan. Genau dieser Fall trägt
        // seit dem 09.08.2026 den Ist-Start nach - ein von der Kette an den Start gerufener Lauf
        // bliebe sonst "in Vorbereitung", bis das erste Boot durchs Ziel ist.
        assertTrue(
            RaceClockerPollLogic.isWatched(
                activated = true,
                startTime = LocalDateTime.of(2026, 8, 14, 10, 0),
                now = LocalDateTime.of(2026, 8, 14, 14, 0),
                watchBeforeMinutes = 15,
                watchAfterMinutes = 120,
            )
        )
    }

    @Test
    fun anUpcomingMatchIsWatchedInsideTheWindow() {
        assertTrue(
            RaceClockerPollLogic.isWatched(false, now.plusMinutes(10), now, 15, 120)
        )
        assertTrue(
            RaceClockerPollLogic.isWatched(false, now.minusMinutes(90), now, 15, 120)
        )
    }

    @Test
    fun theWindowBoundsAreInclusive() {
        assertTrue(RaceClockerPollLogic.isWatched(false, now.plusMinutes(15), now, 15, 120))
        assertTrue(RaceClockerPollLogic.isWatched(false, now.minusMinutes(120), now, 15, 120))
    }

    @Test
    fun outsideTheWindowNothingIsWatched() {
        assertFalse(RaceClockerPollLogic.isWatched(false, now.plusMinutes(16), now, 15, 120))
        assertFalse(RaceClockerPollLogic.isWatched(false, now.minusMinutes(121), now, 15, 120))
    }

    @Test
    fun withoutAPlannedStartTimeAnInactiveMatchIsNotWatched() {
        assertFalse(RaceClockerPollLogic.isWatched(false, null, now, 15, 120))
    }

    // --- Takt ---

    @Test
    fun oneRunningMatchPutsTheWholeEventIntoTheFastMode() {
        assertEquals(PollMode.ACTIVE, RaceClockerPollLogic.modeFor(anyRunning = true))
        assertEquals(PollMode.UPCOMING, RaceClockerPollLogic.modeFor(anyRunning = false))
    }

    @Test
    fun theConfiguredIntervalNeverFallsBelowTheFloor() {
        assertEquals(5, RaceClockerPollLogic.intervalSeconds(5))
        assertEquals(RaceClockerPollLogic.MIN_INTERVAL_SECONDS, RaceClockerPollLogic.intervalSeconds(1))
        assertEquals(RaceClockerPollLogic.MIN_INTERVAL_SECONDS, RaceClockerPollLogic.intervalSeconds(0))
        assertEquals(RaceClockerPollLogic.MIN_INTERVAL_SECONDS, RaceClockerPollLogic.intervalSeconds(-30))
    }

    // --- Fälligkeit ---

    @Test
    fun anEventThatWasNeverPolledIsDueImmediately() {
        assertTrue(RaceClockerPollLogic.isDue(null, now, 5))
    }

    @Test
    fun theIntervalMustHavePassed() {
        assertFalse(RaceClockerPollLogic.isDue(now.minusSeconds(4), now, 5))
        assertTrue(RaceClockerPollLogic.isDue(now.minusSeconds(5), now, 5))
        assertTrue(RaceClockerPollLogic.isDue(now.minusSeconds(30), now, 5))
    }

    // --- Start-Erkennung ---

    @Test
    fun aRecordedStartTimeCountsAsStarted() {
        assertTrue(RaceClockerPollLogic.startDetected(listOf(row(start = LocalTime.of(10, 3)))))
    }

    @Test
    fun aResultCountsAsStartedEvenWithoutAStartTime() {
        assertTrue(RaceClockerPollLogic.startDetected(listOf(row(result = "3:21.4"))))
        assertTrue(RaceClockerPollLogic.startDetected(listOf(row(result = "DNF"))))
    }

    @Test
    fun waitingRowsAreNotAStart() {
        assertFalse(RaceClockerPollLogic.startDetected(listOf(row(result = "Not started"))))
        assertFalse(RaceClockerPollLogic.startDetected(listOf(row(result = "In race..."))))
        assertFalse(RaceClockerPollLogic.startDetected(emptyList()))
    }

    /**
     * Der Vorfall vom 14.08.2026 (CRF): Eine Abmeldung für den Samstag stand in RaceClocker als
     * DNS in der Welle - und weil DNS als "Ergebnis" zählte, hat der Abruf den Lauf am Freitag
     * aktiviert UND gestartet. Er war beobachtet, weil das Vorlauf-Fenster der Veranstaltung groß
     * eingestellt war; getroffen hat es genau die Läufe mit Abmeldung, denn nur sie hatten
     * überhaupt eine Zeile, die durch den Filter kam.
     *
     * DNS ist die eine Statusangabe, die das Gegenteil eines Starts behauptet, und sie wird
     * regelmäßig VOR dem Rennen gesetzt. Sie belegt hier deshalb nichts.
     */
    @Test
    fun aDeregisteredBoatIsNotAStart() {
        assertFalse(RaceClockerPollLogic.startDetected(listOf(row(result = "DNS"))))
        assertFalse(RaceClockerPollLogic.startDetected(listOf(row(result = " dns "))))
        assertFalse(
            RaceClockerPollLogic.startDetected(listOf(row(result = "DNS"), row(result = "DNS"))),
        )
    }

    /**
     * Die Gegenprobe: Sobald irgendetwas im Feld wirklich gefahren ist, zählt der Lauf als
     * gestartet - eine einzelne Abmeldung daneben ändert daran nichts.
     */
    @Test
    fun aDeregistrationNextToRealRacingStillCounts() {
        assertTrue(
            RaceClockerPollLogic.startDetected(
                listOf(row(result = "DNS"), row(start = LocalTime.of(10, 3))),
            ),
        )
        assertTrue(
            RaceClockerPollLogic.startDetected(listOf(row(result = "DNS"), row(result = "3:21.4"))),
        )
        assertTrue(
            RaceClockerPollLogic.startDetected(listOf(row(result = "DNS"), row(result = "DNF"))),
        )
    }

    @Test
    fun aBoatOnTheWaterIsAStartWhenItsStartWasTimed() {
        assertTrue(
            RaceClockerPollLogic.startDetected(
                listOf(row(result = "In race...", start = LocalTime.of(10, 3)))
            )
        )
    }

    // --- Rückzug des Ist-Starts ---
    //
    // Die Gegenrichtung zur Start-Erkennung (11.08.2026): Zieht der Zeitnehmer nach einem
    // Fehlstart alle Zeiten zurück, stehen alle zugeordneten Zeilen wieder ohne Startzeit und ohne
    // Ergebnis da - dann geht der Ist-Start zurück. Alles andere ist ausdrücklich KEIN Rückzug.

    private val startedAt = LocalDateTime.of(2026, 8, 14, 9, 58)

    @Test
    fun aFullyRetractedFeedRetractsTheStart() {
        assertTrue(
            RaceClockerPollLogic.startRetracted(
                rows = listOf(row(result = "Not started"), row(result = "Not started")),
                existingStartedAt = startedAt,
                anyStoredResult = false,
            )
        )
    }

    @Test
    fun aSingleBoatWithATimeOrAStartKeepsTheStart() {
        // Ein Boot mit Zeit ist unstrittig gefahren - dieselbe Regel wie bei der Start-Erkennung,
        // nur andersherum gelesen: Was einen Lauf starten lässt, hält ihn auch gestartet.
        assertFalse(
            RaceClockerPollLogic.startRetracted(
                rows = listOf(row(result = "Not started"), row(result = "3:21.4")),
                existingStartedAt = startedAt,
                anyStoredResult = false,
            )
        )
        assertFalse(
            RaceClockerPollLogic.startRetracted(
                rows = listOf(row(result = "In race...", start = LocalTime.of(9, 58))),
                existingStartedAt = startedAt,
                anyStoredResult = false,
            )
        )
    }

    @Test
    fun anEmptyFeedIsNoRetraction() {
        // Der Feed kennt den Lauf (noch) nicht - ein von Hand markierter Start muss das
        // überleben. Nur ein Feed, der den Lauf kennt und ihn ungestartet zeigt, zählt.
        assertFalse(
            RaceClockerPollLogic.startRetracted(
                rows = emptyList(),
                existingStartedAt = startedAt,
                anyStoredResult = false,
            )
        )
    }

    @Test
    fun storedResultsBlockTheRetraction() {
        // Stände in ready2race bei ungestartetem Feed sind Handeingaben - die nimmt der Abruf
        // nie zurück. (Feed-Stände räumt beim Rückzug der Reset-Pfad ab, nicht dieser Zweig.)
        assertFalse(
            RaceClockerPollLogic.startRetracted(
                rows = listOf(row(result = "Not started")),
                existingStartedAt = startedAt,
                anyStoredResult = true,
            )
        )
    }

    @Test
    fun withoutAStartThereIsNothingToRetract() {
        assertFalse(
            RaceClockerPollLogic.startRetracted(
                rows = listOf(row(result = "Not started")),
                existingStartedAt = null,
                anyStoredResult = false,
            )
        )
    }

    @Test
    fun aRetractionChangesTheFingerprint() {
        // Der Rückzug selbst läuft nie in die "unverändert"-Abkürzung: Startzeit und Ergebnis
        // stehen im Fingerabdruck, ihr Verschwinden ändert ihn also zwangsläufig.
        val id = UUID.randomUUID()
        assertNotEquals(
            RaceClockerPollLogic.fingerprint(
                listOf(row(id = id, result = "In race...", start = LocalTime.of(9, 58)))
            ),
            RaceClockerPollLogic.fingerprint(listOf(row(id = id, result = "Not started"))),
        )
    }

    // --- der nachgetragene Ist-Start ---
    //
    // Der Fall, der den ganzen Umbau ausgelöst hat (Entwurf 09.08.2026, §2.2): Ein von der Kette an
    // den Start gerufener Lauf soll seinen Ist-Start bekommen, sobald RaceClocker eine Startzeit
    // meldet - und zwar lange bevor ein Boot durchs Ziel ist.

    @Test
    fun aTimedStartCountsEvenWhileEveryBoatIsStillRacing() {
        assertEquals(
            LocalDateTime.of(2026, 8, 14, 10, 3),
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(
                    row(result = "In race...", start = LocalTime.of(10, 3)),
                    row(result = "In race...", start = LocalTime.of(10, 3)),
                ),
                existingStartedAt = null,
                now = LocalDateTime.of(2026, 8, 14, 10, 5),
            )
        )
    }

    @Test
    fun anExistingStartStampIsNeverMoved() {
        assertEquals(
            null,
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(row(result = "In race...", start = LocalTime.of(10, 3))),
                existingStartedAt = LocalDateTime.of(2026, 8, 14, 10, 1),
                now = LocalDateTime.of(2026, 8, 14, 10, 5),
            )
        )
    }

    @Test
    fun withoutATimedStartInTheFeedNothingIsStamped() {
        assertEquals(
            null,
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(row(result = "3:21.4"), row(result = "Not started")),
                existingStartedAt = null,
                now = LocalDateTime.of(2026, 8, 14, 10, 5),
            )
        )
    }

    @Test
    fun theRaceDayIsTheOneNearestToNow() {
        // Der Feed liefert nur die Uhrzeit; den Tag bestimmt die Nähe zu `now`. Ein Lauf kurz vor
        // Mitternacht, abgerufen kurz danach, gehört auf den Vortag …
        assertEquals(
            LocalDateTime.of(2026, 8, 13, 23, 55),
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(row(start = LocalTime.of(23, 55))),
                existingStartedAt = null,
                now = LocalDateTime.of(2026, 8, 14, 0, 10),
            )
        )
        // … und der Normalfall auf heute.
        assertEquals(
            LocalDateTime.of(2026, 8, 14, 10, 3),
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(row(start = LocalTime.of(10, 3))),
                existingStartedAt = null,
                now = LocalDateTime.of(2026, 8, 14, 10, 5),
            )
        )
    }

    @Test
    fun aRaceRunOnADifferentDayThanPlannedIsStampedOnTheDayItRan() {
        // Der Fall vom 10.08.2026: Testlauf am Montagabend, geplant für Sonntag darauf. Mit dem
        // geplanten Renntag stünde der Ist-Start sechs Tage in der Zukunft — die Anzeige klemmt
        // negative Laufzeiten auf 0 und zeigte dauerhaft „Läuft · 0 min". Der Stempel gehört auf
        // den Tag, an dem der Start tatsächlich gemessen wurde.
        assertEquals(
            LocalDateTime.of(2026, 8, 10, 22, 32, 9),
            RaceClockerPollLogic.measuredStartFor(
                rows = listOf(row(result = "In race...", start = LocalTime.of(22, 32, 9))),
                existingStartedAt = null,
                now = LocalDateTime.of(2026, 8, 10, 22, 33),
            )
        )
    }

    // --- Fingerabdruck ---

    @Test
    fun unchangedRowsKeepTheirFingerprint() {
        val id = UUID.randomUUID()
        val a = listOf(row(id = id, result = "3:21.4", start = LocalTime.of(10, 3)))
        val b = listOf(row(id = id, result = "3:21.4", start = LocalTime.of(10, 3)))

        assertEquals(RaceClockerPollLogic.fingerprint(a), RaceClockerPollLogic.fingerprint(b))
    }

    @Test
    fun everyFieldThatIsWrittenChangesTheFingerprint() {
        val id = UUID.randomUUID()
        val base = listOf(row(id = id, result = "3:21.4", start = LocalTime.of(10, 3)))

        assertNotEquals(
            RaceClockerPollLogic.fingerprint(base),
            RaceClockerPollLogic.fingerprint(listOf(row(id = id, result = "3:22.0", start = LocalTime.of(10, 3)))),
        )
        assertNotEquals(
            RaceClockerPollLogic.fingerprint(base),
            RaceClockerPollLogic.fingerprint(listOf(row(id = id, rank = 2, result = "3:21.4", start = LocalTime.of(10, 3)))),
        )
        assertNotEquals(
            RaceClockerPollLogic.fingerprint(base),
            RaceClockerPollLogic.fingerprint(
                listOf(row(id = id, result = "3:21.4", start = LocalTime.of(10, 3), penaltySeconds = 10))
            ),
        )
        assertNotEquals(
            RaceClockerPollLogic.fingerprint(base),
            RaceClockerPollLogic.fingerprint(
                listOf(row(id = id, result = "3:21.4", start = LocalTime.of(10, 3), penaltyNote = "Boje"))
            ),
        )
    }

    @Test
    fun theOrderTheRowsArriveInDoesNotMatter() {
        val first = row(result = "3:21.4")
        val second = row(rank = 2, result = "3:25.0")

        assertEquals(
            RaceClockerPollLogic.fingerprint(listOf(first, second)),
            RaceClockerPollLogic.fingerprint(listOf(second, first)),
        )
    }

    // -- candidatesFor: welches Rennen für einen Lauf gilt ------------------------------------

    private val competition = UUID.randomUUID()
    private val otherCompetition = UUID.randomUUID()
    private val round = UUID.randomUUID()
    private val match = UUID.randomUUID()

    private val shortCourse = RaceClockerRaceRef(UUID.randomUUID(), "Kurzstrecke", "https://raceclocker.com/kurz")
    private val longCourse = RaceClockerRaceRef(UUID.randomUUID(), "Langstrecke", "https://raceclocker.com/lang")

    private val racesById = listOf(shortCourse, longCourse).associateBy { it.id }

    private fun pollMatch(
        matchId: UUID = match,
        competitionId: UUID = competition,
        roundId: UUID = round,
    ) = RaceClockerPollMatch(
        matchId = matchId,
        competitionId = competitionId,
        roundId = roundId,
        startTime = now,
        activatedAt = now,
        startedAt = null,
        autoPausedAt = null,
        waveName = "10:00 | 1 JM4x | Lauf 1",
    )

    /** Ohne eigene Zuordnung erbt der Lauf das Rennen der Veranstaltung. */
    @Test
    fun `der Lauf erbt das Rennen der Veranstaltung`() {
        val assignments = listOf(Assignment(null, null, null, shortCourse.id))

        val candidate = RaceClockerPollLogic.candidatesFor(listOf(pollMatch()), assignments, racesById).single()

        assertEquals(match, candidate.matchId)
        assertEquals(shortCourse, candidate.target.race)
        assertEquals("10:00 | 1 JM4x | Lauf 1", candidate.target.waveName)
    }

    /**
     * Die speziellste Ebene gewinnt: Eine Partie-Zuordnung schlägt die des Wettkampfs. Der Fall,
     * für den die Ebene gebaut wurde - ein Wettkampf, dessen Qualifikation auf einem anderen
     * Rennen läuft als seine übrigen Läufe.
     */
    @Test
    fun `die Partie-Zuordnung schlägt die des Wettkampfs`() {
        val assignments = listOf(
            Assignment(competition, null, null, shortCourse.id),
            Assignment(competition, round, match, longCourse.id),
        )

        val candidate = RaceClockerPollLogic.candidatesFor(listOf(pollMatch()), assignments, racesById).single()

        assertEquals(longCourse, candidate.target.race)
    }

    /**
     * DIE Wirkung des früheren INNEREN Joins auf `raceclocker_race`: Ein Lauf, für den sich kein
     * Rennen auflösen lässt, wird nicht abgerufen. Fiele sie weg, liefe jeder Takt für diesen Lauf
     * ins Leere.
     */
    @Test
    fun `ein Lauf ohne aufgelöstes Rennen fällt still heraus`() {
        val assignments = listOf(Assignment(otherCompetition, null, null, shortCourse.id))

        assertEquals(emptyList(), RaceClockerPollLogic.candidatesFor(listOf(pollMatch()), assignments, racesById))
        assertEquals(emptyList(), RaceClockerPollLogic.candidatesFor(listOf(pollMatch()), emptyList(), racesById))
    }

    /** Zeigt die Zuordnung auf ein Rennen, das es nicht mehr gibt, gilt dasselbe. */
    @Test
    fun `eine Zuordnung auf ein unbekanntes Rennen zählt nicht`() {
        val assignments = listOf(Assignment(null, null, null, UUID.randomUUID()))

        assertEquals(emptyList(), RaceClockerPollLogic.candidatesFor(listOf(pollMatch()), assignments, racesById))
    }

    /** Der eine Lauf ohne Rennen nimmt die übrigen nicht mit. */
    @Test
    fun `nur der Lauf ohne Rennen fällt heraus`() {
        val withRace = pollMatch(matchId = UUID.randomUUID())
        val withoutRace = pollMatch(matchId = UUID.randomUUID(), competitionId = otherCompetition)
        val assignments = listOf(Assignment(competition, null, null, shortCourse.id))

        val candidates = RaceClockerPollLogic.candidatesFor(listOf(withRace, withoutRace), assignments, racesById)

        assertEquals(listOf(withRace.matchId), candidates.map { it.matchId })
    }
}
