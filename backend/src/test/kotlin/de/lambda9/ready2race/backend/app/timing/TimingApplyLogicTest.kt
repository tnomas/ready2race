package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic.Decision
import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic.ResultState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Die Rückschreibe-Entscheidung als reine Logik: wann schreibt die Echtzeit-Übernahme ein Ergebnis
 * an das Team, wann räumt sie es ab, und wann lässt sie ausdrücklich die Finger davon.
 *
 * Der Fingerabdruck des zuletzt geschriebenen Stands ist das Gedächtnis dieser Entscheidung: er
 * unterscheidet "unverändert" (kein doppeltes Schreiben) von "fremd" (jemand anderes hat das
 * Ergebnis angefasst - nie stillschweigend überschreiben).
 */
class TimingApplyLogicTest {

    private val empty = ResultState(null, null, null, null)
    private val time90 = ResultState(90_000L, null, null, null)
    private val time95Penalty = ResultState(95_000L, null, 5, "Frühstart")
    private val dnf = ResultState(null, "DNF", null, null)

    private fun fp(state: ResultState) = TimingApplyLogic.fingerprint(state)

    // ------------------------------------------------------------- Fingerabdruck

    @Test
    fun fingerprintDistinguishesEveryField() {
        val states = listOf(
            time90,
            ResultState(90_001L, null, null, null),
            ResultState(90_000L, "DNF", null, null),
            ResultState(90_000L, null, 5, null),
            ResultState(90_000L, null, 5, "Frühstart"),
            ResultState(90_000L, null, 5, "Bahnverlassen"),
        )
        val prints = states.map { fp(it) }
        assertEquals(prints.size, prints.toSet().size, "jede Abweichung muss einen eigenen Abdruck ergeben")
    }

    @Test
    fun fingerprintIsStableForEqualStates() {
        assertEquals(fp(time95Penalty), fp(ResultState(95_000L, null, 5, "Frühstart")))
    }

    // Ein fehlender Grund und ein Grund, der wörtlich dem Trennzeichen-Platzhalter gleicht, dürfen
    // nicht zusammenfallen - sonst wären zwei verschiedene Stände "unverändert".
    @Test
    fun fingerprintDoesNotConfuseNullWithPlaceholderText() {
        assertNotEquals(
            fp(ResultState(90_000L, null, null, null)),
            fp(ResultState(90_000L, null, null, "-")),
        )
    }

    // ------------------------------------------------------------- Strafsekunden

    @Test
    fun penaltySecondsRoundsToWholeSeconds() {
        assertEquals(5, TimingApplyLogic.penaltySecondsFor(5_000L))
        assertEquals(6, TimingApplyLogic.penaltySecondsFor(5_500L))
        assertEquals(5, TimingApplyLogic.penaltySecondsFor(5_499L))
    }

    @Test
    fun penaltySecondsIsNullForZeroOrMissing() {
        assertNull(TimingApplyLogic.penaltySecondsFor(0L))
        assertNull(TimingApplyLogic.penaltySecondsFor(null))
    }

    // ------------------------------------------------------------- Entscheidung

    @Test
    fun writesAFreshResultToAnUntouchedTeam() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = null,
            teamState = empty,
            teamHasPlace = false,
        )
        assertEquals(Decision.WriteResult, decision)
    }

    @Test
    fun writesADnfLikeAnyOtherResult() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = dnf,
            appliedFingerprint = null,
            teamState = empty,
            teamHasPlace = false,
        )
        assertEquals(Decision.WriteResult, decision)
    }

    @Test
    fun skipsWhenNothingChangedSinceTheLastWrite() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipUnchanged, decision)
    }

    // Der Normalfall nach dem Rennen: unser Ergebnis steht, die Plätze wurden daraus berechnet.
    // Solange sich nichts geändert hat, ist das kein Konflikt - und darf nicht als "eingefroren"
    // oder "schmutzig" aufscheinen.
    @Test
    fun unchangedBeatsFrozenWhenPlacesWereCalculatedFromOurResult() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = true,
        )
        assertEquals(Decision.SkipUnchanged, decision)
        assertFalse(TimingApplyLogic.dirtyAfter(decision, hasTarget = true, targetFingerprint = applied, appliedFingerprint = applied))
    }

    @Test
    fun rewritesItsOwnResultWhenTheTimeChanged() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time95Penalty,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = false,
        )
        assertEquals(Decision.WriteResult, decision)
    }

    // Nach einem Nichtstarter-Ergebnis (failed = true am Team) muss die Automatik ihren eigenen
    // Stand weiterhin korrigieren dürfen - das eigene DNF friert nichts ein.
    @Test
    fun ownDnfDoesNotFreezeALaterCorrection() {
        val applied = fp(dnf)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = applied,
            teamState = dnf,
            teamHasPlace = false,
        )
        assertEquals(Decision.WriteResult, decision)
    }

    @Test
    fun neverTouchesATeamWithACalculatedPlaceWhenSomethingWouldChange() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time95Penalty,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = true,
        )
        assertEquals(Decision.SkipFrozen, decision)
        assertTrue(TimingApplyLogic.dirtyAfter(decision, hasTarget = true, targetFingerprint = fp(time95Penalty), appliedFingerprint = applied))
    }

    // Ein Ergebnis, das nicht von uns stammt (Import, Schiedsrichter-Maske), wird nie überschrieben
    // - auch dann nicht, wenn kein Platz vergeben ist.
    @Test
    fun neverOverwritesAForeignResult() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = null,
            teamState = ResultState(88_000L, null, null, null),
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipForeignResult, decision)
    }

    // Das Spiegelbild: Der Schiedsrichter hat NACH unserem Schreiben eingegriffen (z. B. eigenes
    // DNF gesetzt). Ab da gehört das Ergebnis ihm.
    @Test
    fun refereeEditAfterOurWriteFreezesTheTeam() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time95Penalty,
            appliedFingerprint = applied,
            teamState = ResultState(null, "DNF", null, null),
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipForeignResult, decision)
    }

    // Auch das Entfernen unseres Ergebnisses von Hand ist ein fremder Eingriff - die Automatik
    // schreibt es nicht einfach wieder hin.
    @Test
    fun manualRemovalOfOurResultIsRespected() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = applied,
            teamState = empty,
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipForeignResult, decision)
    }

    // Rücknahme der Marke: nichts mehr zu schreiben, aber unser altes Ergebnis steht noch am Team
    // -> abräumen, damit "Zeit zurücknehmen" wirklich rückgängig macht, was das Zuordnen bewirkt hat.
    @Test
    fun clearsItsOwnResultWhenTheTimeIsGone() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = false,
        )
        assertEquals(Decision.ClearResult, decision)
    }

    @Test
    fun doesNotClearWhenThePlaceIsAlreadyCalculated() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = applied,
            teamState = time90,
            teamHasPlace = true,
        )
        assertEquals(Decision.SkipFrozen, decision)
    }

    @Test
    fun nothingToWriteForATeamThatNeverHadAResult() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = null,
            teamState = empty,
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipNothingToWrite, decision)
        assertFalse(TimingApplyLogic.dirtyAfter(decision, hasTarget = false, targetFingerprint = null, appliedFingerprint = null))
    }

    // ------------------------------------------------------------- Schalter aus

    @Test
    fun switchOffSuppressesEveryWrite() {
        val decision = TimingApplyLogic.decide(
            autoApply = false,
            target = time90,
            appliedFingerprint = null,
            teamState = empty,
            teamHasPlace = false,
        )
        assertEquals(Decision.SkipDisabled, decision)
    }

    // Mit ausgeschaltetem Schalter zeigt "dirty" an, dass am Lauf (noch) nicht steht, was der
    // Leitstand rechnet - genau der Stand, den das Wiedereinschalten nachzieht.
    @Test
    fun switchOffMarksPendingChangesDirty() {
        val decision = Decision.SkipDisabled
        assertTrue(
            TimingApplyLogic.dirtyAfter(decision, hasTarget = true, targetFingerprint = fp(time90), appliedFingerprint = null)
        )
        assertFalse(
            TimingApplyLogic.dirtyAfter(decision, hasTarget = true, targetFingerprint = fp(time90), appliedFingerprint = fp(time90))
        )
        assertFalse(
            TimingApplyLogic.dirtyAfter(decision, hasTarget = false, targetFingerprint = null, appliedFingerprint = null)
        )
    }

    @Test
    fun successfulWritesAreNeverDirty() {
        assertFalse(TimingApplyLogic.dirtyAfter(Decision.WriteResult, hasTarget = true, targetFingerprint = fp(time90), appliedFingerprint = null))
        assertFalse(TimingApplyLogic.dirtyAfter(Decision.ClearResult, hasTarget = false, targetFingerprint = null, appliedFingerprint = fp(time90)))
        assertFalse(TimingApplyLogic.dirtyAfter(Decision.SkipUnchanged, hasTarget = true, targetFingerprint = fp(time90), appliedFingerprint = fp(time90)))
    }

    @Test
    fun foreignResultShowsUpDirty() {
        assertTrue(TimingApplyLogic.dirtyAfter(Decision.SkipForeignResult, hasTarget = true, targetFingerprint = fp(time90), appliedFingerprint = null))
        assertTrue(TimingApplyLogic.dirtyAfter(Decision.SkipFrozen, hasTarget = true, targetFingerprint = fp(time95Penalty), appliedFingerprint = fp(time90)))
    }
}
