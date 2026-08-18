package de.lambda9.ready2race.backend.app.timing

import de.lambda9.ready2race.backend.app.timing.boundary.TimingRaceTypeService
import de.lambda9.ready2race.backend.app.timing.entity.CurrentRaceTypeDto
import de.lambda9.ready2race.backend.app.timing.entity.SequenceMode
import de.lambda9.ready2race.backend.app.timing.entity.TimingError
import de.lambda9.ready2race.backend.app.timing.entity.TimingRaceTypeDto
import de.lambda9.ready2race.backend.app.timing.entity.TimingRaceTypeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationType
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.testing.testComprehension
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TimingRaceTypeServiceTest {

    private fun request(
        name: String,
        timed: Boolean = true,
        startMode: SequenceMode = SequenceMode.INTERVAL,
        intervalMillis: Long? = 60000,
        leadInMillis: Long? = 10000,
        sorting: Int = 0,
    ) = TimingRaceTypeRequest(name, timed, startMode, intervalMillis, leadInMillis, sorting)

    @Test
    fun addAndListRaceTypes() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()

        !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)
        !TimingRaceTypeService.addRaceType(
            request("Show-Lauf", timed = false, startMode = SequenceMode.MASS, intervalMillis = null, sorting = 1),
            userId,
            eventId,
        )

        val list = (!TimingRaceTypeService.getRaceTypes(eventId) as ApiResponse.ListDto<TimingRaceTypeDto>).data
        assertEquals(listOf("Zeitfahren", "Show-Lauf"), list.map { it.name })

        val timeTrial = list.first()
        assertTrue(timeTrial.timed)
        assertEquals(SequenceMode.INTERVAL, timeTrial.startMode)
        assertEquals(60000, timeTrial.intervalMillis)
        assertEquals(10000, timeTrial.leadInMillis)

        val show = list.last()
        assertEquals(false, show.timed)
        assertEquals(SequenceMode.MASS, show.startMode)
    }

    // A MASS race type has no cadence; persisting one would offer the start board a value it must
    // not use.
    @Test
    fun massRaceTypeDropsTheInterval() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingRaceTypeService.addRaceType(
            request("Massenstart", startMode = SequenceMode.MASS, intervalMillis = 45000),
            userId,
            eventId,
        )

        val list = (!TimingRaceTypeService.getRaceTypes(eventId) as ApiResponse.ListDto<TimingRaceTypeDto>).data
        assertNull(list.single().intervalMillis)
    }

    @Test
    fun addRaceTypeFailsOnDuplicateName() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)

        assertKIOFails(TimingError.RaceTypeNameTaken) {
            TimingRaceTypeService.addRaceType(request("Zeitfahren", startMode = SequenceMode.MASS), userId, eventId)
        }
    }

    @Test
    fun updateRaceTypeChangesModeAndPresets() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val created = !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)
        val raceTypeId = (created as ApiResponse.Created).id

        !TimingRaceTypeService.updateRaceType(
            request("Finale Massenstart", startMode = SequenceMode.MASS, intervalMillis = null, leadInMillis = 20000),
            userId,
            raceTypeId,
            eventId,
        )

        val updated = (!TimingRaceTypeService.getRaceTypes(eventId) as ApiResponse.ListDto<TimingRaceTypeDto>).data.single()
        assertEquals("Finale Massenstart", updated.name)
        assertEquals(SequenceMode.MASS, updated.startMode)
        assertEquals(20000, updated.leadInMillis)
    }

    @Test
    fun updateRaceTypeFailsOnDuplicateName() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)
        val second = !TimingRaceTypeService.addRaceType(request("Show-Lauf", sorting = 1), userId, eventId)
        val secondId = (second as ApiResponse.Created).id

        assertKIOFails(TimingError.RaceTypeNameTaken) {
            TimingRaceTypeService.updateRaceType(request("Zeitfahren"), userId, secondId, eventId)
        }
    }

    // Race types of another event must not be reachable through this event's path, whatever id is
    // presented.
    @Test
    fun updateRaceTypeOfAnotherEventFails() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val created = !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)
        val raceTypeId = (created as ApiResponse.Created).id

        assertKIOFails(TimingError.EventMismatch) {
            TimingRaceTypeService.updateRaceType(request("Umbenannt"), userId, raceTypeId, otherEventId)
        }
    }

    @Test
    fun deleteRaceTypeFailsWhenUnknown() = testComprehension {
        val (eventId, _) = !createTestEventWithAdmin()

        assertKIOFails(TimingError.RaceTypeNotFound) {
            TimingRaceTypeService.deleteRaceType(UUID.randomUUID(), eventId)
        }
    }

    /**
     * Deleting a race type must not damage the setup: the round keeps existing and simply loses its
     * preset (the FK is `on delete set null`).
     */
    @Test
    fun deletingARaceTypeLeavesTheRoundIntact() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val created = !TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId)
        val raceTypeId = (created as ApiResponse.Created).id
        !createTestScheduledRound(eventId, startTime = LocalDateTime.now().plusHours(1), raceTypeId = raceTypeId)

        !TimingRaceTypeService.deleteRaceType(raceTypeId, eventId)

        val current = !TimingRaceTypeService.getCurrentRaceType(eventId, stationId)
        assertNull((current as ApiResponse.Dto<CurrentRaceTypeDto>).dto.raceType)
    }

    @Test
    fun currentRaceTypeFollowsTheEarliestUnstartedMatch() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val trial = (!TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId) as ApiResponse.Created).id
        val mass = (!TimingRaceTypeService.addRaceType(
            request("Finale", startMode = SequenceMode.MASS, intervalMillis = null, sorting = 1),
            userId,
            eventId,
        ) as ApiResponse.Created).id

        val base = LocalDateTime.now().plusHours(1)
        !createTestScheduledRound(eventId, startTime = base.plusMinutes(30), raceTypeId = mass)
        !createTestScheduledRound(eventId, startTime = base, raceTypeId = trial)

        val current = !TimingRaceTypeService.getCurrentRaceType(eventId, stationId)
        val resolved = (current as ApiResponse.Dto<CurrentRaceTypeDto>).dto.raceType
        assertEquals("Zeitfahren", resolved?.name)
        assertEquals(SequenceMode.INTERVAL, resolved?.startMode)
    }

    @Test
    fun currentRaceTypeSkipsStartedMatches() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val trial = (!TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId) as ApiResponse.Created).id
        val mass = (!TimingRaceTypeService.addRaceType(
            request("Finale", startMode = SequenceMode.MASS, intervalMillis = null, sorting = 1),
            userId,
            eventId,
        ) as ApiResponse.Created).id

        val base = LocalDateTime.now().plusHours(1)
        !createTestScheduledRound(eventId, startTime = base, startedAt = base, raceTypeId = trial)
        !createTestScheduledRound(eventId, startTime = base.plusMinutes(30), raceTypeId = mass)

        val current = !TimingRaceTypeService.getCurrentRaceType(eventId, stationId)
        assertEquals("Finale", (current as ApiResponse.Dto<CurrentRaceTypeDto>).dto.raceType?.name)
    }

    /**
     * A competition that is timed elsewhere must not steer our start board - the same
     * effective-timing-system rule the team endpoints apply.
     */
    @Test
    fun currentRaceTypeIgnoresCompetitionsTimedElsewhere() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)
        val trial = (!TimingRaceTypeService.addRaceType(request("Zeitfahren"), userId, eventId) as ApiResponse.Created).id

        val base = LocalDateTime.now().plusHours(1)
        !createTestScheduledRound(
            eventId,
            startTime = base,
            raceTypeId = trial,
            timingSystem = TimingSystem.RACECLOCKER,
        )

        val current = !TimingRaceTypeService.getCurrentRaceType(eventId, stationId)
        assertNull((current as ApiResponse.Dto<CurrentRaceTypeDto>).dto.raceType)
    }

    @Test
    fun currentRaceTypeFailsForAStationOfAnotherEvent() = testComprehension {
        val (eventId, userId) = !createTestEventWithAdmin()
        val (otherEventId, _) = !createTestEventWithAdmin()
        val stationId = !addTestStation(eventId, userId, TimingStationType.START)

        assertKIOFails(TimingError.EventMismatch) {
            TimingRaceTypeService.getCurrentRaceType(otherEventId, stationId)
        }
    }
}
