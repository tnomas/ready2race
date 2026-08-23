package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic
import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic.Decision
import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic.PlaceCandidate
import de.lambda9.ready2race.backend.app.timing.boundary.TimingApplyLogic.ResultState
import java.util.UUID
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
 * Ergebnis angefasst - nie stillschweigend überschreiben). Seit dem Platz-Umbau gehört der Platz
 * zum Abdruck: eigene Platz-Fortschreibungen sind nie fremd, ein fremder Platz friert ein.
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
            ResultState(90_000L, null, null, null, place = 1),
            ResultState(90_000L, null, null, null, place = 2),
            ResultState(90_000L, null, null, null, place = 1, placesCalculated = true),
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

    // Der Übergang für Bestandsdaten: Die Migration V202608211460 hängt an alte Abdrücke (vier
    // Felder) exakt `|_|5:false` an. Das MUSS denselben Abdruck ergeben wie ein neuer Stand ohne
    // eigenen Platz - sonst gälten alle vor dem Umbau geschriebenen Ergebnisse plötzlich als fremd.
    @Test
    fun migrationSuffixMatchesTheNewFingerprintWithoutAPlace() {
        val oldFourFieldFingerprint = listOf(
            "90000".let { "${it.length}:$it" },
            "_",
            "_",
            "_",
        ).joinToString("|")
        assertEquals(
            oldFourFieldFingerprint + "|_|5:false",
            fp(ResultState(90_000L, null, null, null, place = null, placesCalculated = false)),
        )
    }

    // Der Abdruck muss rücklesbar sein: die Freeze-Grenze des Push braucht den Platz, den unser
    // eigener Abdruck festhält. Ein Grund mit Trennzeichen darf das Parsen nicht verwirren.
    @Test
    fun fingerprintRoundTripsThroughParse() {
        val states = listOf(
            empty,
            time90,
            ResultState(95_000L, null, 5, "Früh|start"),
            ResultState(null, "DNF", null, null, place = null, placesCalculated = true),
            ResultState(90_000L, null, null, null, place = 2, placesCalculated = true),
        )
        states.forEach { state ->
            assertEquals(state, TimingApplyLogic.parseFingerprint(fp(state)), "Rückweg für $state")
        }
        assertNull(TimingApplyLogic.parseFingerprint("kein Abdruck"))
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

    // ------------------------------------------------------------- Platzableitung

    private val boatA = UUID.randomUUID()
    private val boatB = UUID.randomUUID()
    private val boatC = UUID.randomUUID()

    @Test
    fun derivePlacesRanksByTime() {
        val places = TimingApplyLogic.derivePlaces(
            listOf(
                PlaceCandidate(boatA, 92_000L),
                PlaceCandidate(boatB, 90_000L),
                PlaceCandidate(boatC, 91_000L),
            )
        )
        assertEquals(mapOf(boatB to 1, boatC to 2, boatA to 3), places)
    }

    // Gleichstände auf der veröffentlichten Genauigkeitsstufe teilen sich den Platz, dahinter
    // reißt die Lücke - 1, 1, 3, wie es RatingCategoryRanking und der Siegerehrungsbogen lesen.
    @Test
    fun derivePlacesSharesThePlaceOnTiesAndSkipsBehind() {
        val places = TimingApplyLogic.derivePlaces(
            listOf(
                PlaceCandidate(boatA, 90_000L),
                PlaceCandidate(boatB, 90_000L),
                PlaceCandidate(boatC, 91_000L),
            )
        )
        assertEquals(1, places[boatA])
        assertEquals(1, places[boatB])
        assertEquals(3, places[boatC])
    }

    @Test
    fun derivePlacesIsEmptyForNoCandidates() {
        assertEquals(emptyMap(), TimingApplyLogic.derivePlaces(emptyList()))
    }

    // Solange nur ein Teil des Feldes im Ziel ist, sind die Plätze vorläufig - ein einzelnes Boot
    // ist schlicht Erster. Das Nachrücken selbst prüft die Testcontainers-Kette.
    @Test
    fun derivePlacesRanksAPartialField() {
        assertEquals(mapOf(boatA to 1), TimingApplyLogic.derivePlaces(listOf(PlaceCandidate(boatA, 90_000L))))
    }

    // ------------------------------------------------------------- Entscheidung

    @Test
    fun writesAFreshResultToAnUntouchedTeam() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90,
            appliedFingerprint = null,
            teamState = empty,
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
        )
        assertEquals(Decision.SkipUnchanged, decision)
    }

    // Der Normalfall nach dem Rennen: unser Ergebnis samt Platz steht am Team, der Abdruck trägt
    // beides. Solange sich nichts ändert, ist das kein Konflikt - und darf nicht als fremd oder
    // "schmutzig" aufscheinen.
    @Test
    fun unchangedBeatsForeignWhenThePlaceCameFromOurOwnWrite() {
        val ourState = time90.copy(place = 1, placesCalculated = true)
        val applied = fp(ourState)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = ourState,
            appliedFingerprint = applied,
            teamState = ourState,
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
        )
        assertEquals(Decision.WriteResult, decision)
    }

    // Das Herz des Platz-Umbaus: Ein weiteres Boot ist eingelaufen, unser Boot rückt vom
    // abgeleiteten Platz 1 auf 2. Der alte Stand (samt Platz 1) ist exakt unser Abdruck - also
    // ist die Fortschreibung ein gewöhnliches Schreiben, kein Konflikt.
    @Test
    fun movesItsOwnDerivedPlaceWhenAnotherBoatArrives() {
        val ourState = time90.copy(place = 1, placesCalculated = true)
        val applied = fp(ourState)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90.copy(place = 2, placesCalculated = true),
            appliedFingerprint = applied,
            teamState = ourState,
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
        )
        assertEquals(Decision.WriteResult, decision)
    }

    // Die alte Regel "Platz gesetzt = eingefroren" ist zu "FREMDER Platz = eingefroren" geworden:
    // Ein Platz, der nicht in unserem Abdruck steht, macht den ganzen Stand fremd.
    @Test
    fun neverTouchesATeamWithAForeignPlaceWhenSomethingWouldChange() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time95Penalty,
            appliedFingerprint = applied,
            teamState = time90.copy(place = 1),
        )
        assertEquals(Decision.SkipForeignResult, decision)
        assertTrue(TimingApplyLogic.dirtyAfter(decision, hasTarget = true, targetFingerprint = fp(time95Penalty), appliedFingerprint = applied))
    }

    // Auch die Schiedsrichter-Maske "Plätze ausdrücklich bestätigen" (gleiche Werte, aber
    // places_calculated = false) ist ein fremder Eingriff: Ab da gehören die Plätze dem
    // Schiedsrichter, und die Automatik verschiebt sie nicht mehr.
    @Test
    fun refereeConfirmedPlacesFreezeEvenWithIdenticalValues() {
        val ourState = time90.copy(place = 1, placesCalculated = true)
        val applied = fp(ourState)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = time90.copy(place = 2, placesCalculated = true),
            appliedFingerprint = applied,
            teamState = time90.copy(place = 1, placesCalculated = false),
        )
        assertEquals(Decision.SkipForeignResult, decision)
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
        )
        assertEquals(Decision.ClearResult, decision)
    }

    // Das gilt auch mit eigenem Platz am Team: die Rücknahme nimmt Zeit UND Platz wieder mit.
    @Test
    fun clearsItsOwnResultIncludingItsOwnDerivedPlace() {
        val ourState = time90.copy(place = 1, placesCalculated = true)
        val applied = fp(ourState)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = applied,
            teamState = ourState,
        )
        assertEquals(Decision.ClearResult, decision)
    }

    @Test
    fun doesNotClearWhenAForeignPlaceWasSet() {
        val applied = fp(time90)
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = applied,
            teamState = time90.copy(place = 1, placesCalculated = true),
        )
        assertEquals(Decision.SkipForeignResult, decision)
    }

    @Test
    fun nothingToWriteForATeamThatNeverHadAResult() {
        val decision = TimingApplyLogic.decide(
            autoApply = true,
            target = empty,
            appliedFingerprint = null,
            teamState = empty,
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
        assertTrue(TimingApplyLogic.dirtyAfter(Decision.SkipForeignResult, hasTarget = true, targetFingerprint = fp(time95Penalty), appliedFingerprint = fp(time90)))
    }
}
