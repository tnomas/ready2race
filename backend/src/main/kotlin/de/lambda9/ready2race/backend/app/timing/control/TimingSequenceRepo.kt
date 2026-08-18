package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_START_SEQUENCE
import java.util.UUID

object TimingSequenceRepo {

    private val activeStates = listOf(SequenceState.ARMED.name, SequenceState.RUNNING.name)

    fun create(record: TimingStartSequenceRecord) = TIMING_START_SEQUENCE.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_START_SEQUENCE.selectOne { ID.eq(id) }

    /**
     * The one sequence a station may have in flight. Enforced by [existsActiveForStation] on
     * creation, so at most one row can match; [selectOne] would blow up if that ever broke, which
     * is the intent - two live sequences on one station would fire competing start marks.
     */
    fun getActiveByStation(stationId: UUID) = TIMING_START_SEQUENCE.selectOne {
        STATION.eq(stationId).and(STATE.`in`(activeStates))
    }

    fun existsActiveForStation(stationId: UUID) = TIMING_START_SEQUENCE.exists {
        STATION.eq(stationId).and(STATE.`in`(activeStates))
    }

    fun getRunning() = TIMING_START_SEQUENCE.select { STATE.eq(SequenceState.RUNNING.name) }

    fun update(id: UUID, f: TimingStartSequenceRecord.() -> Unit) = TIMING_START_SEQUENCE.update(f) { ID.eq(id) }
}
