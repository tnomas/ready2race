package de.lambda9.ready2race.backend.app.eventInfo

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.JEnv
import de.lambda9.ready2race.backend.app.event.control.EventRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.BoardService
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardConfig
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElement
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardElementType
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardRequest
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardTile
import de.lambda9.ready2race.backend.app.eventInfo.entity.BoardViewDto
import de.lambda9.ready2race.backend.app.timing.addTestStation
import de.lambda9.ready2race.backend.app.timing.boundary.TimingSequenceService
import de.lambda9.ready2race.backend.app.timing.control.TimingSequenceRepo
import de.lambda9.ready2race.backend.app.timing.createTestEventWithAdmin
import de.lambda9.ready2race.backend.app.timing.createTestMatchFixture
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.kio.TestComprehensionScope
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.orDie
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Die Startsequenz in der Board-Sicht, am echten Postgres: Ein öffentliches Board muss die
 * aktive Sequenz samt Feuerzeitpunkt tragen, damit seine Laufuhr vor dem Start von minus
 * hochzählen kann - der Zeitnahme-Kanal steht ihm nicht offen. Die Rechnung selbst
 * (`TimingSequenceService.activeTiming`) teilt sich das Board mit der Stream-Uhr; hier geht es
 * um die Durchreichung und die Cache-Entwertung je Sequenz-Schritt.
 */
class BoardSequenceViewTest {

    private fun setEventTimingSystem(eventId: UUID, system: TimingSystem): App<Any?, Unit> =
        KIO.comprehension {
            val event = (!EventRepo.get(eventId).orDie())!!
            !EventRepo.update(event) { timingSystem = system.name }.orDie()
            KIO.ok(Unit)
        }

    private fun TestComprehensionScope<JEnv>.view(eventId: UUID, boardId: UUID): BoardViewDto =
        (!BoardService.getBoardView(eventId, boardId)).dto

    @Test
    fun theBoardCarriesTheSequenceFromArmedThroughRunningToPaused() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !setEventTimingSystem(eventId, TimingSystem.INTERN)
        val fixture = !createTestMatchFixture(eventId)
        val station = !addTestStation(eventId, userId, TimingStationType.START)
        val board = (!BoardService.createBoard(
            eventId,
            BoardRequest(
                name = "Steg",
                config = BoardConfig(
                    columns = 1,
                    tiles = listOf(BoardTile(elements = listOf(BoardElement(type = BoardElementType.MATCH, offset = 0)))),
                ),
            ),
        )).dto

        // Ohne Sequenz: nichts - und der Cache-Eintrag dieses Stands muss gleich wieder alt sein.
        assertNull(view(eventId, board.id).sequence)

        val created = !TimingSequenceService.createSequence(
            CreateSequenceRequest(station, SequenceMode.MASS, null, fixture.teamIds),
            userId,
            eventId,
        )
        val sequenceId = (created as ApiResponse.Created).id

        // Scharf: die Kachel weiß, dass ihr Lauf in der Sequenz steckt, aber noch ohne Zeitpunkt.
        val armed = assertNotNull(view(eventId, board.id).sequence)
        assertEquals(sequenceId, armed.sequenceId)
        assertEquals(SequenceState.ARMED, armed.state)
        assertEquals(listOf(fixture.setupMatchId), armed.matchIds)
        assertNull(armed.startedAt)
        assertNull(armed.firesAt)
        assertNull(armed.pausedAt)
        // Der Lauf selbst steht durch das Scharfstellen im Block der laufenden Läufe.
        assertEquals(fixture.setupMatchId, view(eventId, board.id).slots.single().match?.matchId)

        !TimingSequenceService.startSequence(sequenceId, userId, eventId)
        val record = (!TimingSequenceRepo.get(sequenceId).orDie())!!

        // Läuft: Feuerzeitpunkt = Sequenzstart + Vorlauf, dieselbe Rechnung wie beim Scheduler.
        val running = assertNotNull(view(eventId, board.id).sequence)
        assertEquals(SequenceState.RUNNING, running.state)
        assertNotNull(running.startedAt)
        val firesAt = assertNotNull(running.firesAt)
        assertEquals(
            record.leadInMillis!!,
            ChronoUnit.MILLIS.between(running.startedAt, firesAt),
        )
        assertNull(running.pausedAt)

        !TimingSequenceService.pauseSequence(sequenceId, userId, eventId)

        // Pausiert: der Pausenbeginn reist mit, die Kachel friert den Reststand darauf ein.
        val paused = assertNotNull(view(eventId, board.id).sequence)
        assertEquals(SequenceState.PAUSED, paused.state)
        assertNotNull(paused.pausedAt)

        !TimingSequenceService.abortSequence(sequenceId, userId, eventId)
        assertNull(view(eventId, board.id).sequence)
    }
}
