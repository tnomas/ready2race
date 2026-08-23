package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingModeAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_MODE_ASSIGNMENT
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingModeAssignmentRepo {

    fun create(record: TimingModeAssignmentRecord) = TIMING_MODE_ASSIGNMENT.insertReturning(record) { ID }

    // Die Zuordnungen hängen nicht direkt an der Veranstaltung - der Weg führt über ihren
    // Wettkampf. Ein Join statt einer eigenen event-Spalte, damit die Tabelle keine Redundanz
    // trägt, die beim Verschieben eines Wettkampfs auseinanderlaufen könnte.
    fun getByEvent(eventId: UUID): JIO<List<TimingModeAssignmentRecord>> = Jooq.query {
        select(TIMING_MODE_ASSIGNMENT.fields().toList())
            .from(TIMING_MODE_ASSIGNMENT)
            .join(COMPETITION).on(COMPETITION.ID.eq(TIMING_MODE_ASSIGNMENT.COMPETITION))
            .where(COMPETITION.EVENT.eq(eventId))
            .fetch { it.into(TIMING_MODE_ASSIGNMENT) }
    }

    /**
     * Die Zeile zu genau dieser (Wettkampf, Runde)-Kombination - `unique nulls not distinct`
     * garantiert höchstens eine. `isNotDistinctFrom` bildet dieselbe null-Gleichheit im Filter ab,
     * die der Constraint beim Schreiben erzwingt.
     */
    fun getByCompetitionAndRound(competitionId: UUID, roundId: UUID?): JIO<TimingModeAssignmentRecord?> =
        Jooq.query {
            selectFrom(TIMING_MODE_ASSIGNMENT)
                .where(TIMING_MODE_ASSIGNMENT.COMPETITION.eq(competitionId))
                .and(TIMING_MODE_ASSIGNMENT.COMPETITION_SETUP_ROUND.isNotDistinctFrom(roundId))
                .fetchOne()
        }

    fun update(id: UUID, f: TimingModeAssignmentRecord.() -> Unit) =
        TIMING_MODE_ASSIGNMENT.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_MODE_ASSIGNMENT.delete { ID.eq(id) }

    // Vorprüfung für das Löschen eines Zeitnahmetyps: der on-delete-restrict-Fremdschlüssel würde
    // sonst als roher Defekt hochkommen statt als Domänenfehler (TimingError.ModeInUse).
    fun existsByMode(modeId: UUID) = TIMING_MODE_ASSIGNMENT.exists { TIMING_MODE.eq(modeId) }
}
