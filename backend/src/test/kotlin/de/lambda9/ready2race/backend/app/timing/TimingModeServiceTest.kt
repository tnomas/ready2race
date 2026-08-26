package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingToneSetService
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Zeitnahmetypen gegen echtes Postgres: CRUD, der (event, name)-Unique-Vorbau und die Löschsperre
 * für einen Typ, der noch irgendwo gilt.
 *
 * WO ein Typ gilt, ist seit dem Zeitnahmeprofil-Baum nicht mehr Sache dieses Dienstes - die
 * Zuordnungs-Semantik und ihre Auflösung prüft [TimingProfileServiceTest].
 */
class TimingModeServiceTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem?): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system?.name }.orDie()
            KIO.ok(Unit)
        }

    /** Eine Wettkampf-Zeile des Zeitnahmeprofil-Baums; [modeId] null räumt sie wieder ab. */
    private fun assignMode(
        eventId: UUID,
        userId: UUID,
        competitionId: UUID,
        modeId: UUID?,
    ): App<Any?, Unit> = KIO.comprehension {
        !TimingProfileService.upsertAssignment(
            eventId,
            userId,
            TimingProfileAssignmentRequest(competitionId, null, null, modeId),
        )
        KIO.ok(Unit)
    }

    private fun request(
        name: String = "Timetrial 30s",
        grouping: TimingStartGrouping = TimingStartGrouping.EINZEL,
        intervalSeconds: Int? = 30,
    ) = TimingModeRequest(
        name = name,
        startGrouping = grouping,
        intervalSeconds = intervalSeconds,
        leadInSeconds = 10,
    )

    @Test
    fun addAndListModes() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        val created = !TimingModeService.addMode(request(), userId, eventId)
        val modeId = (created as ApiResponse.Created).id

        val list = (!TimingModeService.getModes(eventId)).data
        assertEquals(1, list.size)
        val mode = list.single()
        assertEquals(modeId, mode.id)
        assertEquals("Timetrial 30s", mode.name)
        assertEquals(TimingStartGrouping.EINZEL, mode.startGrouping)
        assertEquals(30, mode.intervalSeconds)
        assertEquals(10, mode.leadInSeconds)
        // Ohne eigene Wahl erbt der Typ - und ohne jeden Ton-Satz an der Veranstaltung bleibt
        // auch da nichts zu erben: null heißt weiterhin "eingebauter Standardplan", damit
        // künftige Standard-Änderungen unkonfigurierte Typen erreichen.
        assertNull(mode.toneSet)
        assertNull(mode.resolvedToneSet.sequenceTonePlan)
        // Die Vorgaben der neuen Spalten kommen unverändert zurück - ein Typ, der nie angefasst
        // wurde, startet weiter über die App und trifft die Boote auf 1-6 bzw. A-F.
        assertTrue(mode.startSequenceEnabled)
        assertEquals("123456", mode.boatKeysPrimary)
        assertEquals("ABCDEF", mode.boatKeysSecondary)
    }

    /**
     * Der Startsequenz-Tonplan steht seit dem 26.08.2026 im Ton-Satz. Am Typ kommt er AUFGELÖST
     * an: sein eigener Satz, sonst der Vorgabesatz der Veranstaltung. Genau das hält die
     * Zusicherung „keine Regatta klingt anders" über die Migration hinaus - die Boards lesen
     * dieses Feld unverändert weiter.
     */
    @Test
    fun `der Tonplan kommt aus dem Ton-Satz, eigener vor Vorgabe`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val vorgabePlan = listOf(ToneStep(offsetMillis = 0, frequencyHz = 900, durationMillis = 400))
        val eigenerPlan = listOf(ToneStep(offsetMillis = -3000, frequencyHz = 600, durationMillis = 100))

        !TimingToneSetService.addToneSet(
            TimingToneSetRequest(name = "Standard", isDefault = true, sequenceTonePlan = vorgabePlan),
            userId,
            eventId,
        )
        val eigenerSatz = ((!TimingToneSetService.addToneSet(
            TimingToneSetRequest(name = "Leise", sequenceTonePlan = eigenerPlan),
            userId,
            eventId,
        )) as ApiResponse.Created).id

        // Ohne eigene Wahl: der Vorgabesatz.
        val erbend = ((!TimingModeService.addMode(request(name = "Erbt"), userId, eventId)) as ApiResponse.Created).id
        // Mit eigener Wahl: der gewählte Satz.
        !TimingModeService.addMode(request(name = "Eigen").copy(toneSet = eigenerSatz), userId, eventId)

        val modes = (!TimingModeService.getModes(eventId)).data.associateBy { it.name }
        assertEquals(vorgabePlan, modes.getValue("Erbt").resolvedToneSet.sequenceTonePlan)
        assertEquals(eigenerPlan, modes.getValue("Eigen").resolvedToneSet.sequenceTonePlan)

        // Und der Wechsel wirkt: derselbe Typ, andere Wahl, anderer Plan.
        !TimingModeService.updateMode(request(name = "Erbt").copy(toneSet = eigenerSatz), userId, erbend, eventId)
        assertEquals(
            eigenerPlan,
            (!TimingModeService.getModes(eventId)).data.single { it.name == "Erbt" }.resolvedToneSet.sequenceTonePlan,
        )
    }

    /**
     * Ein gelöschter Ton-Satz macht seine Typen nicht unbrauchbar: Sie fallen per
     * `on delete set null` auf die Vorgabe zurück. Wer einen Satz wegwirft, soll nicht gehindert
     * werden - und der Countdown darf danach nicht schweigen.
     */
    @Test
    fun `ein gelöschter Satz lässt seine Typen auf die Vorgabe zurückfallen`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val vorgabePlan = listOf(ToneStep(offsetMillis = 0, frequencyHz = 900, durationMillis = 400))
        val eigenerPlan = listOf(ToneStep(offsetMillis = -3000, frequencyHz = 600, durationMillis = 100))

        !TimingToneSetService.addToneSet(
            TimingToneSetRequest(name = "Standard", isDefault = true, sequenceTonePlan = vorgabePlan),
            userId,
            eventId,
        )
        val eigenerSatz = ((!TimingToneSetService.addToneSet(
            TimingToneSetRequest(name = "Leise", sequenceTonePlan = eigenerPlan),
            userId,
            eventId,
        )) as ApiResponse.Created).id
        !TimingModeService.addMode(request().copy(toneSet = eigenerSatz), userId, eventId)
        assertEquals(
            eigenerPlan,
            (!TimingModeService.getModes(eventId)).data.single().resolvedToneSet.sequenceTonePlan,
        )

        !TimingToneSetService.deleteToneSet(eigenerSatz, eventId)

        val mode = (!TimingModeService.getModes(eventId)).data.single()
        assertNull(mode.toneSet)
        assertEquals(vorgabePlan, mode.resolvedToneSet.sequenceTonePlan)
    }

    /** Ein Ton-Satz einer FREMDEN Veranstaltung ist keine gültige Wahl. */
    @Test
    fun `ein Ton-Satz einer anderen Veranstaltung wird abgelehnt`() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        val fremderSatz = ((!TimingToneSetService.addToneSet(
            TimingToneSetRequest(name = "Fremd"),
            otherUserId,
            otherEventId,
        )) as ApiResponse.Created).id

        assertKIOFails(TimingError.EventMismatch) {
            TimingModeService.addMode(request().copy(toneSet = fremderSatz), userId, eventId)
        }
    }

    @Test
    fun duplicateNameWithinTheEventIsRejected() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingModeService.addMode(request(), userId, eventId)

        assertKIOFails(TimingError.ModeNameTaken) {
            TimingModeService.addMode(request(), userId, eventId)
        }
    }

    @Test
    fun sameNameInAnotherEventIsFine() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, otherUserId) = !createTestEventWithAdmin()
        !TimingModeService.addMode(request(), userId, eventId)

        assertKIOSucceeds<ApiResponse.Created> {
            TimingModeService.addMode(request(), otherUserId, otherEventId)
        }
    }

    /**
     * Die Löschsperre: ein zugeordneter Typ verschwindet nicht stillschweigend. Der
     * on-delete-restrict-Fremdschlüssel des Zeitnahmeprofil-Baums käme sonst als roher
     * Datenbank-Defekt hoch statt als Domänenfehler - deshalb steht der Fall hier und nicht nur
     * im Schema.
     */
    @Test
    fun deleteRefusesWhileAssigned() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        // Ein Zeitnahmetyp ist nur an einer intern gezeiteten Veranstaltung zuweisbar.
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val modeId = ((!TimingModeService.addMode(request(), userId, eventId)) as ApiResponse.Created).id
        !assignMode(eventId, userId, fixture.competitionId, modeId)

        assertKIOFails(TimingError.ModeInUse) {
            TimingModeService.deleteMode(modeId, eventId)
        }

        // Zuordnung abräumen, dann klappt das Löschen.
        !assignMode(eventId, userId, fixture.competitionId, null)
        assertKIOSucceeds<ApiResponse.NoData> { TimingModeService.deleteMode(modeId, eventId) }
    }
}
