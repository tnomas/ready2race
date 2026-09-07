package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_ASSIGNMENT
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingAssignmentRepo {

    /**
     * Legt die Zuordnung der Marke an oder hängt sie um - ein Upsert über `time_mark` (unique).
     *
     * Eine Marke hat höchstens EINE Zuordnung; wer sie setzt, meint immer "diese Marke gehört
     * jetzt diesem Boot". Zwei Zuordnungen, die sich im Fenster zwischen Lesen und Schreiben
     * kreuzen (zwei Klicks am Zielposten, ein Klick gegen den feuernden Scheduler), sahen beide
     * "noch keine Zuordnung" und die zweite lief in den Unique-Defekt. Jetzt gewinnt die letzte,
     * die Zeile bleibt dieselbe: `created_*` behält den ersten Handelnden, `updated_*` nennt den
     * letzten (Nutzer ODER Gerät, die jeweils andere Spalte wird mit übernommen - also geleert).
     *
     * Liefert die Kennung der Zeile - beim Umhängen die der bestehenden, nicht die des Requests.
     */
    fun create(record: TimingAssignmentRecord): JIO<UUID> = Jooq.query {
        insertInto(TIMING_ASSIGNMENT)
            .set(record)
            .onConflict(TIMING_ASSIGNMENT.TIME_MARK)
            .doUpdate()
            .set(TIMING_ASSIGNMENT.COMPETITION_MATCH_TEAM, record.competitionMatchTeam)
            .set(TIMING_ASSIGNMENT.UPDATED_AT, record.updatedAt)
            .set(TIMING_ASSIGNMENT.UPDATED_BY, record.updatedBy)
            .set(TIMING_ASSIGNMENT.UPDATED_BY_DEVICE, record.updatedByDevice)
            .returningResult(TIMING_ASSIGNMENT.ID)
            .fetchOne()!!
            .value1()!!
    }

    fun getByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.selectOne { TIME_MARK.eq(timeMarkId) }

    fun getByTimeMarks(ids: List<UUID>) = TIMING_ASSIGNMENT.select { TIME_MARK.`in`(ids) }

    fun update(id: UUID, f: TimingAssignmentRecord.() -> Unit) = TIMING_ASSIGNMENT.update(f) { ID.eq(id) }

    fun deleteByTimeMark(timeMarkId: UUID) = TIMING_ASSIGNMENT.delete { TIME_MARK.eq(timeMarkId) }
}
