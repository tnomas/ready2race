package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.timing.boundary.TimingModeService
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStartGrouping
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.app.timingProfile.boundary.TimingProfileService
import de.lambda9.ready2race.backend.app.timingProfile.entity.TimingProfileAssignmentRequest
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Der Schalter „Startsequenz ja/nein" am Zeitnahmetyp gegen echtes Postgres.
 *
 * Das Start-Board sperrt seinen Knopf bereits, aber das ist Bedienhilfe: Die Boards sind
 * Geräte-Token-Klienten und laufen womöglich mit einer Startliste weiter, die den umgestellten Typ
 * noch nicht kennt. Geprüft wird deshalb der Server - dieselbe Ernsthaftigkeit wie beim
 * Fehlstart-Rückruf am selben Typ (TimingFalseStartActionTest).
 *
 * Der dritte Fall ist die bewusste Entscheidung dieser Prüfung: Ohne herleitbaren Typ wird
 * DURCHGELASSEN. Eine Sperre, die im Zweifel sperrt, hielte am Renntag eine Regatta an, die nie
 * jemand gesperrt hat - und der Vorgabewert der Spalte ist „Startsequenz an".
 */
class TimingStartSequenceDisabledTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system.name }.orDie()
            KIO.ok(Unit)
        }

    /** Legt einen Typ an und hängt ihn im Zeitnahmeprofil-Baum an den Wettkampf der Vorrichtung. */
    private fun assignMode(
        eventId: UUID,
        userId: UUID,
        competitionId: UUID,
        startSequenceEnabled: Boolean,
    ): App<Any?, UUID> = KIO.comprehension {
        val created = !TimingModeService.addMode(
            TimingModeRequest(
                name = "Typ-${UUID.randomUUID()}",
                startGrouping = TimingStartGrouping.WELLE,
                intervalSeconds = null,
                leadInSeconds = 10,
                startSequenceEnabled = startSequenceEnabled,
            ),
            userId,
            eventId,
        )
        val modeId = (created as ApiResponse.Created).id
        !TimingProfileService.upsertAssignment(
            eventId,
            userId,
            TimingProfileAssignmentRequest(competitionId, null, null, modeId),
        )
        KIO.ok(modeId)
    }

    @Test
    fun aModeWithoutStartSequenceRejectsTheRequest() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        !assignMode(eventId, userId, fixture.competitionId, startSequenceEnabled = false)
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)

        assertKIOFails(TimingError.StartSequenceDisabled) {
            TimingSequenceService.createSequence(
                CreateSequenceRequest(stationId, SequenceMode.MASS, null, fixture.teamIds),
                userId,
                eventId,
            )
        }

        // Die Ablehnung muss VOR jedem Schreiben greifen - eine halb angelegte Sequenz stünde dem
        // Posten im Weg (ein Posten trägt nur eine) und niemand hätte sie bestellt.
        assertNull(!TimingSequenceRepo.getActiveByStation(stationId).orDie())
    }

    @Test
    fun anEnabledModeLetsTheSequenceThrough() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        !assignMode(eventId, userId, fixture.competitionId, startSequenceEnabled = true)
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)

        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        assertNotNull(!TimingSequenceRepo.getActiveByStation(stationId).orDie())
    }

    @Test
    fun aMatchWithoutAnyModeLetsTheSequenceThrough() = testComprehension {
        // Kein Typ heißt NICHT „gesperrt": Der Typ hat nichts gesagt, und was er nicht gesagt hat,
        // ist laut Datenbank-Vorgabe „Startsequenz an". Eine Veranstaltung ohne Zeitnahmeprofil
        // startet ihre Läufe weiter wie bisher.
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId, teamCount = 2)
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)

        !TimingSequenceService.createSequence(
            CreateSequenceRequest(stationId, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        assertNotNull(!TimingSequenceRepo.getActiveByStation(stationId).orDie())
    }
}
