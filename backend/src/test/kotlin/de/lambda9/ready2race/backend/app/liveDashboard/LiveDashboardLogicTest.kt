package de.lambda9.ready2race.backend.app.liveDashboard

import de.lambda9.ready2race.backend.app.liveDashboard.boundary.LiveDashboardLogic
import de.lambda9.ready2race.backend.app.liveDashboard.entity.CheckSeverity
import de.lambda9.ready2race.backend.app.liveDashboard.entity.CheckSeverityConfig
import de.lambda9.ready2race.backend.app.liveDashboard.entity.CheckSeverityKey
import de.lambda9.ready2race.backend.app.liveDashboard.entity.CheckType
import de.lambda9.ready2race.backend.app.liveDashboard.entity.EffectiveSeverity
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardInvoiceState
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchDto
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardMatchState
import de.lambda9.ready2race.backend.app.liveDashboard.entity.LiveDashboardScope
import de.lambda9.ready2race.backend.app.liveDashboard.entity.TimeCheckStatus
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LiveDashboardLogicTest {

    private val start = LocalDateTime.of(2026, 7, 29, 14, 0)

    // --- teamOnWaterAt ---

    @Test
    fun onWaterWhenWholeCrewCheckedOut() {
        val scans = listOf(
            "EXIT" to start.minusMinutes(10),
            "EXIT" to start.minusMinutes(8),
            "EXIT" to start.minusMinutes(12),
        )
        assertEquals(start.minusMinutes(8), LiveDashboardLogic.teamOnWaterAt(scans))
    }

    @Test
    fun notOnWaterWhenAnyCrewMemberMissingOrCheckedIn() {
        // Eine Person nie gescannt
        assertNull(
            LiveDashboardLogic.teamOnWaterAt(listOf("EXIT" to start, null))
        )
        // Eine Person wieder eingecheckt (letzter Scan ENTRY)
        assertNull(
            LiveDashboardLogic.teamOnWaterAt(listOf("EXIT" to start, "ENTRY" to start.plusMinutes(1)))
        )
    }

    @Test
    fun notOnWaterWithoutKnownCrew() {
        assertNull(LiveDashboardLogic.teamOnWaterAt(emptyList()))
    }

    // --- computeTimeCheck ---

    @Test
    fun noWindowConfiguredYieldsNoTimeCheck() {
        assertNull(LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(30), null, null))
    }

    @Test
    fun noStartTimeYieldsNoTimeCheck() {
        assertNull(LiveDashboardLogic.computeTimeCheck(null, start.minusMinutes(30), 120, 15))
    }

    @Test
    fun missingCheckYieldsNotChecked() {
        val result = LiveDashboardLogic.computeTimeCheck(start, null, 120, 15)!!
        assertEquals(TimeCheckStatus.NOT_CHECKED, result.status)
        assertNull(result.deltaMinutes)
    }

    @Test
    fun checkWithinWindowIsOk() {
        val result = LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(60), 120, 15)!!
        assertEquals(TimeCheckStatus.OK, result.status)
        assertEquals(60L, result.deltaMinutes)
    }

    @Test
    fun boundariesAreInclusive() {
        assertEquals(TimeCheckStatus.OK, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(120), 120, 15)!!.status)
        assertEquals(TimeCheckStatus.OK, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(15), 120, 15)!!.status)
    }

    @Test
    fun checkTooFarBeforeStartIsTooEarly() {
        val result = LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(121), 120, 15)!!
        assertEquals(TimeCheckStatus.TOO_EARLY, result.status)
        assertEquals(121L, result.deltaMinutes)
    }

    @Test
    fun checkTooCloseToStartIsLate() {
        val result = LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(14), 120, 15)!!
        assertEquals(TimeCheckStatus.LATE, result.status)
    }

    @Test
    fun checkAfterStartIsLateWhenLatestConfigured() {
        val result = LiveDashboardLogic.computeTimeCheck(start, start.plusMinutes(5), 120, 15)!!
        assertEquals(TimeCheckStatus.LATE, result.status)
        assertEquals(-5L, result.deltaMinutes)
    }

    @Test
    fun oneSidedEarliestOnlyWindow() {
        assertEquals(TimeCheckStatus.OK, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(5), 120, null)!!.status)
        assertEquals(TimeCheckStatus.TOO_EARLY, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(180), 120, null)!!.status)
    }

    @Test
    fun oneSidedLatestOnlyWindow() {
        assertEquals(TimeCheckStatus.OK, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(180), null, 15)!!.status)
        assertEquals(TimeCheckStatus.LATE, LiveDashboardLogic.computeTimeCheck(start, start.minusMinutes(5), null, 15)!!.status)
    }

    // --- deriveInvoiceState ---

    @Test
    fun noInvoicesIsNone() {
        assertEquals(LiveDashboardInvoiceState.NONE, LiveDashboardLogic.deriveInvoiceState(emptyList()))
    }

    @Test
    fun anyUnpaidInvoiceIsOpen() {
        assertEquals(
            LiveDashboardInvoiceState.OPEN,
            LiveDashboardLogic.deriveInvoiceState(listOf(LocalDateTime.now(), null))
        )
    }

    @Test
    fun allPaidIsPaid() {
        assertEquals(
            LiveDashboardInvoiceState.PAID,
            LiveDashboardLogic.deriveInvoiceState(listOf(LocalDateTime.now(), LocalDateTime.now()))
        )
    }

    // --- deriveMatchState ---

    @Test
    fun currentlyRunningWinsOverEverything() {
        assertEquals(
            LiveDashboardMatchState.RUNNING,
            LiveDashboardLogic.deriveMatchState(true, null, null, listOf(true, true))
        )
    }

    @Test
    fun allPlacesSetButNobodyFinishedAwaitsFinish() {
        // Testkatalog D15: vollständige Ergebnisse sind KEIN Beenden. Bis zum 06.08.2026 stand
        // hier FINISHED - der Lauf verschwand damit aus dem Live-Tab und bot "Lauf aktivieren"
        // statt "Lauf beenden" an.
        assertEquals(
            LiveDashboardMatchState.AWAITING_FINISH,
            LiveDashboardLogic.deriveMatchState(false, start, null, listOf(true, true))
        )
    }

    @Test
    fun activeMatchWithCompleteResultsStaysRunning() {
        // RUNNING steht vor AWAITING_FINISH: ein aktiver Lauf hat den Beenden-Knopf ohnehin.
        assertEquals(
            LiveDashboardMatchState.RUNNING,
            LiveDashboardLogic.deriveMatchState(true, start, null, listOf(true, true))
        )
    }

    @Test
    fun finishedStaysFinishedEvenWithCompleteResults() {
        assertEquals(
            LiveDashboardMatchState.FINISHED,
            LiveDashboardLogic.deriveMatchState(false, start, start.plusMinutes(9), listOf(true, true))
        )
    }

    @Test
    fun noTeamsIsNeverFinished() {
        assertEquals(
            LiveDashboardMatchState.UPCOMING,
            LiveDashboardLogic.deriveMatchState(false, start, null, emptyList())
        )
    }

    @Test
    fun missingStartTimeIsUnscheduled() {
        assertEquals(
            LiveDashboardMatchState.UNSCHEDULED,
            LiveDashboardLogic.deriveMatchState(false, null, null, listOf(false, false))
        )
    }

    @Test
    fun startTimeInPastWithoutPlacesIsStillUpcoming() {
        assertEquals(
            LiveDashboardMatchState.UPCOMING,
            LiveDashboardLogic.deriveMatchState(false, LocalDateTime.now().minusHours(1), null, listOf(true, false))
        )
    }

    @Test
    fun failedTeamWithoutPlaceCountsAsResult() {
        assertTrue(LiveDashboardLogic.teamHasResult(1, false, false))
        assertTrue(LiveDashboardLogic.teamHasResult(null, true, false))
        assertFalse(LiveDashboardLogic.teamHasResult(null, false, false))
        assertEquals(
            LiveDashboardMatchState.AWAITING_FINISH,
            LiveDashboardLogic.deriveMatchState(
                false,
                start,
                null,
                listOf(
                    LiveDashboardLogic.teamHasResult(1, false, false),
                    LiveDashboardLogic.teamHasResult(null, true, false),
                ),
            )
        )
    }

    @Test
    fun deregisteredTeamNeedsNoResult() {
        assertTrue(LiveDashboardLogic.teamHasResult(null, false, true))
    }

    @Test
    fun matchWithDeregisteredTeamCanFinish() {
        assertEquals(
            LiveDashboardMatchState.AWAITING_FINISH,
            LiveDashboardLogic.deriveMatchState(
                false,
                start,
                null,
                listOf(
                    LiveDashboardLogic.teamHasResult(1, false, false),
                    LiveDashboardLogic.teamHasResult(null, false, true),
                ),
            )
        )
    }

    @Test
    fun finishedAtBeatsIncompleteResults() {
        // Ohne Ergebnisse beendet: bisher fiel das auf UPCOMING zurück (A4-Loch).
        assertEquals(
            LiveDashboardMatchState.FINISHED,
            LiveDashboardLogic.deriveMatchState(false, start, start.plusMinutes(9), listOf(false, false)),
        )
    }

    @Test
    fun cancelledMatchWithCompleteResultsStaysSkipped() {
        // SKIPPED steht vor AWAITING_FINISH: einen abgesagten Lauf muss niemand mehr beenden.
        assertEquals(
            LiveDashboardMatchState.SKIPPED,
            LiveDashboardLogic.deriveMatchState(false, start, null, listOf(true, true), skipped = true),
        )
    }

    @Test
    fun cancelledSlotMarksItsMatchAsSkipped() {
        // Befund A fürs Schiedsrichter-Dashboard: kennzeichnen statt verstecken - der
        // Schiedsrichter muss die Absage sehen, um sie im Zeitplan zurücknehmen zu können.
        assertEquals(
            LiveDashboardMatchState.SKIPPED,
            LiveDashboardLogic.deriveMatchState(false, start, null, listOf(false, false), skipped = true),
        )
    }

    @Test
    fun cancelledButActiveMatchStillShowsRunning() {
        // Wirklichkeit schlägt Plan: Der Zustand entsteht seit der Schutzregel in
        // EventScheduleService.setSlotSkipped nicht mehr neu, Altdaten können ihn aber tragen -
        // und dann darf das Dashboard nicht behaupten, es passiere gerade nichts.
        assertEquals(
            LiveDashboardMatchState.RUNNING,
            LiveDashboardLogic.deriveMatchState(true, start, null, listOf(false, false), skipped = true),
        )
    }

    @Test
    fun cancelledMatchWithResultsStaysFinished() {
        assertEquals(
            LiveDashboardMatchState.FINISHED,
            LiveDashboardLogic.deriveMatchState(false, start, start.plusMinutes(9), listOf(true, true), skipped = true),
        )
    }

    // --- selectForScope ---

    private fun match(state: LiveDashboardMatchState, name: String) = LiveDashboardMatchDto(
        matchId = UUID.randomUUID(),
        state = state,
        competitionId = UUID.randomUUID(),
        competitionName = "Coastal",
        categoryName = null,
        roundName = null,
        matchName = name,
        executionOrder = 0,
        startTime = start,
        startedAt = null,
        currentlyRunning = state == LiveDashboardMatchState.RUNNING,
        elapsedMinutes = null,
        teams = emptyList(),
    )

    @Test
    fun liveScopeKeepsEveryRunningMatch() {
        val matches = listOf(
            match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"),
            match(LiveDashboardMatchState.RUNNING, "Vorlauf 2"),
            match(LiveDashboardMatchState.RUNNING, "Vorlauf 3"),
            match(LiveDashboardMatchState.UPCOMING, "Finale"),
        )

        val selected = LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE)

        assertEquals(listOf("Vorlauf 2", "Vorlauf 3"), selected.map { it.matchName })
    }

    @Test
    fun liveScopeKeepsMatchesWaitingToBeFinished() {
        // Der Kern der D15-Korrektur: ohne diesen Zweig bliebe der Lauf, auf dessen Beenden alles
        // wartet, aus dem Live-Tab verschwunden.
        val matches = listOf(
            match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"),
            match(LiveDashboardMatchState.AWAITING_FINISH, "Vorlauf 2"),
            match(LiveDashboardMatchState.UPCOMING, "Finale"),
        )

        val selected = LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE)

        assertEquals(listOf("Vorlauf 2"), selected.map { it.matchName })
    }

    @Test
    fun liveScopeKeepsRunningAndAwaitingSideBySide() {
        val matches = listOf(
            match(LiveDashboardMatchState.AWAITING_FINISH, "Vorlauf 1"),
            match(LiveDashboardMatchState.RUNNING, "Vorlauf 2"),
            match(LiveDashboardMatchState.UPCOMING, "Finale"),
        )

        val selected = LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE)

        assertEquals(listOf("Vorlauf 1", "Vorlauf 2"), selected.map { it.matchName })
    }

    @Test
    fun liveScopeFallsBackToTheNextUpcomingMatch() {
        val matches = listOf(
            match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"),
            match(LiveDashboardMatchState.UPCOMING, "Vorlauf 2"),
            match(LiveDashboardMatchState.UPCOMING, "Finale"),
        )

        val selected = LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE)

        assertEquals(listOf("Vorlauf 2"), selected.map { it.matchName })
    }

    @Test
    fun liveScopeSkipsCancelledMatchesWhenPickingTheNextOne() {
        // Der Ausschnitt "was ist jetzt dran" darf nicht auf einem abgesagten Lauf stehen bleiben;
        // in der Gesamtliste (ALL) bleibt er als gekennzeichneter Eintrag sichtbar.
        val matches = listOf(
            match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"),
            match(LiveDashboardMatchState.SKIPPED, "Vorlauf 2"),
            match(LiveDashboardMatchState.UPCOMING, "Finale"),
        )

        val selected = LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE)

        assertEquals(listOf("Finale"), selected.map { it.matchName })
        assertEquals(3, LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.ALL).size)
    }

    @Test
    fun liveScopeIsEmptyWhenNothingIsRunningOrUpcoming() {
        val matches = listOf(match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"))

        assertTrue(LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.LIVE).isEmpty())
    }

    @Test
    fun allScopeKeepsEverything() {
        val matches = listOf(
            match(LiveDashboardMatchState.FINISHED, "Vorlauf 1"),
            match(LiveDashboardMatchState.RUNNING, "Vorlauf 2"),
            match(LiveDashboardMatchState.UNSCHEDULED, "Finale"),
        )

        assertEquals(3, LiveDashboardLogic.selectForScope(matches, LiveDashboardScope.ALL).size)
    }

    // --- requirementApplies ---

    @Test
    fun globalAssignmentAppliesToEveryone() {
        assertTrue(LiveDashboardLogic.requirementApplies(listOf(null), UUID.randomUUID()))
        assertTrue(LiveDashboardLogic.requirementApplies(listOf(null), null))
    }

    @Test
    fun namedAssignmentAppliesOnlyToMatchingRole() {
        val roleId = UUID.randomUUID()
        assertTrue(LiveDashboardLogic.requirementApplies(listOf(roleId), roleId))
        assertFalse(LiveDashboardLogic.requirementApplies(listOf(roleId), UUID.randomUUID()))
        assertFalse(LiveDashboardLogic.requirementApplies(listOf(roleId), null))
    }

    // --- Schweregrade ---

    private val competitionA: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")
    private val competitionB: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000b1")
    private val requirementA: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000c1")

    @Test
    fun defaultsReproduceTodaysBehaviour() {
        assertEquals(CheckSeverity.CRITICAL, LiveDashboardLogic.defaultSeverity(CheckType.INVOICE_OPEN, false))
        assertEquals(CheckSeverity.CRITICAL, LiveDashboardLogic.defaultSeverity(CheckType.NOT_ON_WATER, false))
        // Pflichtbedingung rot, optionale Bedingung ohne Wirkung - wie vor der Einstellmöglichkeit
        assertEquals(CheckSeverity.CRITICAL, LiveDashboardLogic.defaultSeverity(CheckType.REQUIREMENT, false))
        assertEquals(CheckSeverity.OK, LiveDashboardLogic.defaultSeverity(CheckType.REQUIREMENT, true))
        assertEquals(
            CheckSeverity.WARNING,
            LiveDashboardLogic.defaultSeverity(CheckType.REQUIREMENT_TIME_WINDOW, false)
        )
    }

    @Test
    fun fulfilledCheckIsAlwaysOk() {
        CheckSeverity.entries.forEach { configured ->
            assertEquals(EffectiveSeverity.OK, LiveDashboardLogic.effectiveSeverity(true, configured))
        }
    }

    @Test
    fun unfulfilledCheckFollowsConfiguration() {
        // Stufe OK heißt "zählt nicht", nicht "ist in Ordnung" - deshalb NEUTRAL, nicht OK.
        assertEquals(EffectiveSeverity.NEUTRAL, LiveDashboardLogic.effectiveSeverity(false, CheckSeverity.OK))
        assertEquals(EffectiveSeverity.WARNING, LiveDashboardLogic.effectiveSeverity(false, CheckSeverity.WARNING))
        assertEquals(EffectiveSeverity.CRITICAL, LiveDashboardLogic.effectiveSeverity(false, CheckSeverity.CRITICAL))
    }

    @Test
    fun worstSeverityTakesTheHighestRankAndNeutralWhenEmpty() {
        assertEquals(EffectiveSeverity.NEUTRAL, LiveDashboardLogic.worstSeverity(emptyList()))
        assertEquals(
            EffectiveSeverity.CRITICAL,
            LiveDashboardLogic.worstSeverity(
                listOf(EffectiveSeverity.OK, EffectiveSeverity.CRITICAL, EffectiveSeverity.WARNING)
            )
        )
        assertEquals(
            EffectiveSeverity.OK,
            LiveDashboardLogic.worstSeverity(listOf(EffectiveSeverity.NEUTRAL, EffectiveSeverity.OK))
        )
    }

    @Test
    fun requirementSeverityCombinesMissingAndTimeWindow() {
        // abgehakt, im Fenster
        assertEquals(
            EffectiveSeverity.OK,
            LiveDashboardLogic.requirementSeverity(
                true, TimeCheckStatus.OK, CheckSeverity.CRITICAL, CheckSeverity.WARNING
            )
        )
        // abgehakt, zu spät -> das Zeitfenster entscheidet
        assertEquals(
            EffectiveSeverity.WARNING,
            LiveDashboardLogic.requirementSeverity(
                true, TimeCheckStatus.LATE, CheckSeverity.CRITICAL, CheckSeverity.WARNING
            )
        )
        // nicht abgehakt -> das Zeitfenster ist bedeutungslos
        assertEquals(
            EffectiveSeverity.CRITICAL,
            LiveDashboardLogic.requirementSeverity(
                false, TimeCheckStatus.NOT_CHECKED, CheckSeverity.CRITICAL, CheckSeverity.WARNING
            )
        )
        // kein Zeitfenster konfiguriert
        assertEquals(
            EffectiveSeverity.NEUTRAL,
            LiveDashboardLogic.requirementSeverity(false, null, CheckSeverity.OK, CheckSeverity.WARNING)
        )
    }

    @Test
    fun invoiceSeverityDistinguishesNoInvoiceFromPaid() {
        // Ohne Rechnung gibt es nichts zu bewerten
        assertEquals(
            EffectiveSeverity.NEUTRAL,
            LiveDashboardLogic.invoiceSeverity(LiveDashboardInvoiceState.NONE, CheckSeverity.CRITICAL)
        )
        assertEquals(
            EffectiveSeverity.OK,
            LiveDashboardLogic.invoiceSeverity(LiveDashboardInvoiceState.PAID, CheckSeverity.CRITICAL)
        )
        assertEquals(
            EffectiveSeverity.CRITICAL,
            LiveDashboardLogic.invoiceSeverity(LiveDashboardInvoiceState.OPEN, CheckSeverity.CRITICAL)
        )
        // Der Gnaden-Fall: offene Rechnung wird heute nicht geahndet
        assertEquals(
            EffectiveSeverity.NEUTRAL,
            LiveDashboardLogic.invoiceSeverity(LiveDashboardInvoiceState.OPEN, CheckSeverity.OK)
        )
    }

    @Test
    fun onWaterIsOnlyJudgedWhenItApplies() {
        // Wettkampf ohne An-/Abmeldung oder Lauf nicht aktiv: keine Aussage
        assertEquals(
            EffectiveSeverity.NEUTRAL,
            LiveDashboardLogic.onWaterSeverity(evaluated = false, onWater = false, configured = CheckSeverity.CRITICAL)
        )
        assertEquals(
            EffectiveSeverity.CRITICAL,
            LiveDashboardLogic.onWaterSeverity(evaluated = true, onWater = false, configured = CheckSeverity.CRITICAL)
        )
        assertEquals(
            EffectiveSeverity.OK,
            LiveDashboardLogic.onWaterSeverity(evaluated = true, onWater = true, configured = CheckSeverity.CRITICAL)
        )
    }

    @Test
    fun teamSeverityIsTheWorstOfItsChecks() {
        assertEquals(
            EffectiveSeverity.CRITICAL,
            LiveDashboardLogic.teamSeverity(
                requirementSeverities = listOf(EffectiveSeverity.OK),
                invoice = EffectiveSeverity.CRITICAL,
                onWater = EffectiveSeverity.NEUTRAL,
            )
        )
        // Mannschaft ohne jede Prüfung bleibt grau
        assertEquals(
            EffectiveSeverity.NEUTRAL,
            LiveDashboardLogic.teamSeverity(emptyList(), EffectiveSeverity.NEUTRAL, EffectiveSeverity.NEUTRAL)
        )
    }

    @Test
    fun unknownCheckTypesAreIgnoredInsteadOfCrashing() {
        // Eine Zeile aus einer neueren Version darf die Anzeige nicht lahmlegen.
        val config = LiveDashboardLogic.buildCheckSeverityConfig(
            listOf(
                Triple(competitionA, "INVOICE_OPEN" to null, "WARNING"),
                Triple(competitionA, "SOMETHING_NEW" to null, "CRITICAL"),
                Triple(competitionA, "REQUIREMENT" to requirementA, "NOT_A_SEVERITY"),
            )
        )

        assertEquals(1, config.overrides.size)
        assertEquals(CheckSeverity.WARNING, config.severityFor(competitionA, CheckType.INVOICE_OPEN))
    }

    @Test
    fun configuredValueBeatsDefaultAndStaysWithinItsCompetition() {
        val config = CheckSeverityConfig(
            mapOf(CheckSeverityKey(competitionA, CheckType.INVOICE_OPEN) to CheckSeverity.WARNING)
        )

        assertEquals(
            CheckSeverity.WARNING,
            config.severityFor(competitionA, CheckType.INVOICE_OPEN, optional = false)
        )
        // Ein anderer Wettkampf bleibt beim Standard
        assertEquals(
            CheckSeverity.CRITICAL,
            config.severityFor(competitionB, CheckType.INVOICE_OPEN, optional = false)
        )
        // Fehlender Eintrag -> Standard
        assertEquals(
            CheckSeverity.CRITICAL,
            config.severityFor(competitionA, CheckType.REQUIREMENT, requirementA, optional = false)
        )
    }
}
