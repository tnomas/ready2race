package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingToneSetRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_TONE_SET
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID

object TimingToneSetRepo {

    fun create(record: TimingToneSetRecord) = TIMING_TONE_SET.insertReturning(record) { ID }

    fun get(id: UUID) = TIMING_TONE_SET.selectOne { ID.eq(id) }

    fun getByEvent(eventId: UUID) = TIMING_TONE_SET.select { EVENT.eq(eventId) }

    fun countByEvent(eventId: UUID) = Jooq.query {
        fetchCount(TIMING_TONE_SET, TIMING_TONE_SET.EVENT.eq(eventId))
    }

    // Vorprüfung des (event, name)-Unique-Constraints, damit Doppelnamen als Domänenfehler
    // auftauchen statt als roher Constraint-Defekt - dasselbe Muster wie TimingModeRepo.
    fun existsByEventAndName(eventId: UUID, name: String, excludingId: UUID? = null) = TIMING_TONE_SET.exists {
        EVENT.eq(eventId).and(NAME.eq(name)).let { cond ->
            excludingId?.let { cond.and(ID.ne(it)) } ?: cond
        }
    }

    /**
     * Verschiebt die Vorgabe-Markierung der Veranstaltung auf [toneSetId].
     *
     * ZWEI Anweisungen, und die Reihenfolge ist der ganze Punkt: erst verliert der bisherige
     * Vorgabesatz seine Markierung, DANN bekommt der neue sie. Beides in derselben
     * Schreib-Operation - der Routen-Aufruf läuft in genau einer Transaktion (`respondKIO`), von
     * außen ist also nie ein Zustand mit zwei oder ohne Vorgabe sichtbar.
     *
     * Warum es nicht die eine, naheliegende Anweisung `set is_default = (id = ?)` sein kann,
     * obwohl sie den Endzustand richtig beschreibt: Postgres prüft den partiellen Unique-Index
     * ZEILENWEISE während der Anweisung, nicht erst an ihrem Ende (aufschieben ginge nur mit einem
     * DEFERRABLE Constraint, und ein partieller Unique-Index kann keiner sein). Trifft der
     * Ausführungsplan den neuen Satz vor dem alten, stehen beide für einen Moment auf `true` und
     * die Anweisung scheitert mit „duplicate key" - abhängig von der physischen Zeilenreihenfolge,
     * also mal ja und mal nein. Nachgemessen am 26.08.2026: dieselbe Anweisung, zweimal derselbe
     * Endzustand, einmal grün und einmal rot. Dasselbe gilt für die Variante mit
     * datenverändernder CTE.
     */
    fun setDefault(eventId: UUID, toneSetId: UUID, userId: UUID, now: LocalDateTime) = Jooq.query {
        update(TIMING_TONE_SET)
            .set(TIMING_TONE_SET.IS_DEFAULT, false)
            .set(TIMING_TONE_SET.UPDATED_AT, now)
            .set(TIMING_TONE_SET.UPDATED_BY, userId)
            .where(TIMING_TONE_SET.EVENT.eq(eventId))
            .and(TIMING_TONE_SET.IS_DEFAULT.isTrue)
            .and(TIMING_TONE_SET.ID.ne(toneSetId))
            .execute()

        update(TIMING_TONE_SET)
            .set(TIMING_TONE_SET.IS_DEFAULT, true)
            .set(TIMING_TONE_SET.UPDATED_AT, now)
            .set(TIMING_TONE_SET.UPDATED_BY, userId)
            .where(TIMING_TONE_SET.ID.eq(toneSetId))
            .execute()
    }

    fun update(id: UUID, f: TimingToneSetRecord.() -> Unit) = TIMING_TONE_SET.update(f) { ID.eq(id) }

    fun delete(id: UUID) = TIMING_TONE_SET.delete { ID.eq(id) }
}
