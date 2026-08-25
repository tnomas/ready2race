package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.ToneStep
import de.lambda9.ready2race.backend.app.timing.entity.ToneWaveform
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
        withLaps = false,
        startGrouping = grouping,
        intervalSeconds = intervalSeconds,
        leadInSeconds = 10,
        tonePlan = null,
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
        assertEquals(false, mode.withLaps)
        // Kein Plan gespeichert = eingebauter Standard: die Spalte bleibt null und kommt als
        // null zurück, damit künftige Standard-Änderungen unkonfigurierte Typen erreichen.
        assertNull(mode.tonePlan)
    }

    @Test
    fun tonePlanSurvivesTheJsonbRoundtrip() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val plan = listOf(
            ToneStep(offsetMillis = -10_000, frequencyHz = 600, durationMillis = 100),
            // Gehalten mit 0 ms Ausklingen: die 0 waehlt eine ANDERE Huellkurve als null
            // (Abfallend) und muss den Roundtrip als echte 0 ueberleben, nicht als null.
            ToneStep(offsetMillis = -5_000, frequencyHz = 600, durationMillis = 100, releaseMillis = 0),
            // Mit Ausklingzeit: auch releaseMillis muss den jsonb-Roundtrip unverändert überleben.
            ToneStep(offsetMillis = 0, frequencyHz = 880, durationMillis = 400, releaseMillis = 800),
            // Wellenform: gesetzt bleibt gesetzt, nicht gesetzt bleibt null (= Sinus) - auch
            // kombiniert mit einer Ausklingzeit (die Dimensionen sind unabhaengig).
            ToneStep(offsetMillis = -2_000, frequencyHz = 440, durationMillis = 300, waveform = ToneWaveform.SQUARE),
            ToneStep(offsetMillis = -1_000, frequencyHz = 440, durationMillis = 300, releaseMillis = 500, waveform = ToneWaveform.SAWTOOTH),
        )

        val created = !TimingModeService.addMode(request().copy(tonePlan = plan), userId, eventId)
        val modeId = (created as ApiResponse.Created).id
        assertEquals(plan, (!TimingModeService.getModes(eventId)).data.single().tonePlan)

        // Update auf einen anderen Plan und zurück auf null (= Standard) - beides muss die
        // jsonb-Spalte exakt nachziehen, nicht nur beim Anlegen.
        val updated = listOf(ToneStep(offsetMillis = 0, frequencyHz = 1200, durationMillis = 200))
        !TimingModeService.updateMode(request().copy(tonePlan = updated), userId, modeId, eventId)
        assertEquals(updated, (!TimingModeService.getModes(eventId)).data.single().tonePlan)

        !TimingModeService.updateMode(request(), userId, modeId, eventId)
        assertNull((!TimingModeService.getModes(eventId)).data.single().tonePlan)
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
