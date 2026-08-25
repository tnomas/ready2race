package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_START_SEQUENCE
import de.lambda9.tailwind.jooq.JIO
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID

object TimingSequenceRepo {

    private val activeStates = listOf(SequenceState.ARMED.name, SequenceState.RUNNING.name)
    private val terminalStates = listOf(SequenceState.DONE.name, SequenceState.ABORTED.name)

    /**
     * Inserts [record] unless the station already has an active sequence, in which case the
     * partial unique index `uq_timing_sequence_active_station` makes Postgres silently skip the
     * row (`ON CONFLICT ... DO NOTHING`) instead of raising a constraint-violation exception.
     * Returns the inserted id, or null when the insert was skipped - the caller (
     * [TimingSequenceService.createSequence]) turns that into [TimingError.SequenceAlreadyActive].
     *
     * This is the race-safe backstop for [existsActiveForStation]'s pre-check: the pre-check
     * gives the common case a clean 409 without ever reaching the database's conflict path, while
     * this guards the window between that check and the insert (e.g. two concurrent requests for
     * the same station).
     */
    fun create(record: TimingStartSequenceRecord): JIO<UUID?> = Jooq.query {
        insertInto(TIMING_START_SEQUENCE)
            .set(record)
            .onConflict(TIMING_START_SEQUENCE.STATION)
            .where(TIMING_START_SEQUENCE.STATE.`in`(activeStates))
            .doNothing()
            .returningResult(TIMING_START_SEQUENCE.ID)
            .fetchOne()
            ?.value1()
    }

    fun get(id: UUID) = TIMING_START_SEQUENCE.selectOne { ID.eq(id) }

    /**
     * The one sequence a station may have in flight. Enforced by [existsActiveForStation] on
     * creation (backstopped by the `uq_timing_sequence_active_station` unique index - see
     * [create]), so at most one row can match; [selectOne] would blow up if that ever broke,
     * which is the intent - two live sequences on one station would fire competing start marks.
     */
    fun getActiveByStation(stationId: UUID) = TIMING_START_SEQUENCE.selectOne {
        STATION.eq(stationId).and(STATE.`in`(activeStates))
    }

    /**
     * The most recently finished (DONE/ABORTED) sequence for [stationId], but only if it finished
     * at or after [since]. Lets a client that missed the terminal websocket broadcast still catch
     * up on the summary for a little while after the fact, instead of only ever being told "no
     * active sequence" the moment a run ends.
     */
    fun getRecentTerminalByStation(stationId: UUID, since: LocalDateTime): JIO<TimingStartSequenceRecord?> =
        Jooq.query {
            selectFrom(TIMING_START_SEQUENCE)
                .where(
                    TIMING_START_SEQUENCE.STATION.eq(stationId)
                        .and(TIMING_START_SEQUENCE.STATE.`in`(terminalStates))
                        .and(TIMING_START_SEQUENCE.UPDATED_AT.ge(since))
                )
                .orderBy(TIMING_START_SEQUENCE.UPDATED_AT.desc())
                .limit(1)
                .fetchOne()
        }

    fun existsActiveForStation(stationId: UUID) = TIMING_START_SEQUENCE.exists {
        STATION.eq(stationId).and(STATE.`in`(activeStates))
    }

    /**
     * Die eine Sequenz, die eine unverknüpfte ANZEIGE (linked_station null = "alle Starts der
     * Veranstaltung") gerade zeigen soll: unter mehreren aktiven Sequenzen verschiedener
     * START-Posten gewinnt die zuletzt angefasste - eine frisch scharfgestellte oder gestartete
     * Sequenz ist das, worauf der Bildschirm am Start gerade wartet.
     */
    fun getMostRecentActiveByEvent(eventId: UUID): JIO<TimingStartSequenceRecord?> = Jooq.query {
        selectFrom(TIMING_START_SEQUENCE)
            .where(
                TIMING_START_SEQUENCE.EVENT.eq(eventId)
                    .and(TIMING_START_SEQUENCE.STATE.`in`(activeStates))
            )
            .orderBy(TIMING_START_SEQUENCE.UPDATED_AT.desc())
            .limit(1)
            .fetchOne()
    }

    /** Wie [getRecentTerminalByStation], nur veranstaltungsweit - für die unverknüpfte ANZEIGE. */
    fun getRecentTerminalByEvent(eventId: UUID, since: LocalDateTime): JIO<TimingStartSequenceRecord?> =
        Jooq.query {
            selectFrom(TIMING_START_SEQUENCE)
                .where(
                    TIMING_START_SEQUENCE.EVENT.eq(eventId)
                        .and(TIMING_START_SEQUENCE.STATE.`in`(terminalStates))
                        .and(TIMING_START_SEQUENCE.UPDATED_AT.ge(since))
                )
                .orderBy(TIMING_START_SEQUENCE.UPDATED_AT.desc())
                .limit(1)
                .fetchOne()
        }

    fun getRunning() = TIMING_START_SEQUENCE.select { STATE.eq(SequenceState.RUNNING.name) }

    fun update(id: UUID, f: TimingStartSequenceRecord.() -> Unit) = TIMING_START_SEQUENCE.update(f) { ID.eq(id) }
}
