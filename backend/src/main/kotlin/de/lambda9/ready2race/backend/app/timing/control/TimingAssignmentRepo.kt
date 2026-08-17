package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import java.util.UUID

object TimingAssignmentRepo {

    fun create(record: TimingAssignmentRecord) = TIMING_ASSIGNMENT.insertReturning(record) { ID }

    fun getByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.selectOne { TIME_MARK.eq(timeMarkId) }

    fun getByTimeMarks(ids: List<UUID>) = TIMING_ASSIGNMENT.select { TIME_MARK.`in`(ids) }

    fun update(id: UUID, f: TimingAssignmentRecord.() -> Unit) = TIMING_ASSIGNMENT.update(f) { ID.eq(id) }

    fun deleteByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.delete { TIME_MARK.eq(timeMarkId) }
}
