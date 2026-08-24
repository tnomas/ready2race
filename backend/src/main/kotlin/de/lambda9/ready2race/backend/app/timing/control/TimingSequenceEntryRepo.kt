package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.SequenceEntryStatus
import de.lambda9.ready2race.backend.app.timing.entity.SequenceState
import de.lambda9.ready2race.backend.database.*
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingStartSequenceEntryRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_START_SEQUENCE
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_START_SEQUENCE_ENTRY
import de.lambda9.tailwind.jooq.Jooq
import java.util.UUID

object TimingSequenceEntryRepo {

    fun create(records: Collection<TimingStartSequenceEntryRecord>) = TIMING_START_SEQUENCE_ENTRY.insert(records)

    fun get(id: UUID) = TIMING_START_SEQUENCE_ENTRY.selectOne { ID.eq(id) }

    fun getBySequence(sequenceId: UUID) = TIMING_START_SEQUENCE_ENTRY.select { SEQUENCE.eq(sequenceId) }

    fun existsPending(sequenceId: UUID) = TIMING_START_SEQUENCE_ENTRY.exists {
        SEQUENCE.eq(sequenceId).and(STATUS.eq(SequenceEntryStatus.PENDING.name))
    }

    /**
     * Row-locks the still-pending entries of a sequence for the surrounding transaction. The
     * scheduler job is the only caller: without the lock two application instances (or a job run
     * overlapping a slow predecessor) could both read the same PENDING entry and fire two start
     * marks for one team. Under READ COMMITTED a blocked `for update` re-checks the predicate after
     * the lock is released, so the loser simply sees no pending rows left.
     */
    fun getPendingForUpdate(sequenceId: UUID) = Jooq.query {
        selectFrom(TIMING_START_SEQUENCE_ENTRY)
            .where(
                TIMING_START_SEQUENCE_ENTRY.SEQUENCE.eq(sequenceId)
                    .and(TIMING_START_SEQUENCE_ENTRY.STATUS.eq(SequenceEntryStatus.PENDING.name))
            )
            .orderBy(TIMING_START_SEQUENCE_ENTRY.POSITION)
            .forUpdate()
            .fetch()
            .toList()
    }

    /**
     * Der zuletzt GESTARTETE Eintrag einer Sequenz, oder `null`, wenn noch keiner gefeuert hat.
     *
     * „Zuletzt" heißt hier: die höchste Position mit Status STARTED. Positionen sind zugleich
     * die Startreihenfolge (siehe [TimingSequenceService.createSequence]), und übersprungene
     * Einträge kommen nicht in Frage - der Schritt, den das Zurücksetzen rückgängig macht, ist
     * genau der letzte tatsächlich ausgelöste Start. Bewusst nicht über den Zeitstempel der
     * Marke sortiert: bei MASS tragen alle Einträge denselben Zeitpunkt, die Position ist dort
     * die einzige stabile Ordnung.
     */
    fun getLastStarted(sequenceId: UUID) = Jooq.query {
        selectFrom(TIMING_START_SEQUENCE_ENTRY)
            .where(
                TIMING_START_SEQUENCE_ENTRY.SEQUENCE.eq(sequenceId)
                    .and(TIMING_START_SEQUENCE_ENTRY.STATUS.eq(SequenceEntryStatus.STARTED.name))
            )
            .orderBy(TIMING_START_SEQUENCE_ENTRY.POSITION.desc())
            .limit(1)
            .fetchOne()
    }

    fun update(id: UUID, f: TimingStartSequenceEntryRecord.() -> Unit) =
        TIMING_START_SEQUENCE_ENTRY.update(f) { ID.eq(id) }

    /**
     * Die Teams, die gerade in einer aktiven (ARMED/RUNNING/PAUSED) Startsequenz der
     * Veranstaltung stehen. Die Posten-Startliste leitet daraus "Startsequenz läuft" je Partie ab -
     * deshalb genügen die Team-Ids, ohne Positionen oder Status.
     *
     * Eine PAUSED-Sequenz zählt mit: sie ist nur angehalten, nicht beendet - die Partie steht
     * weiterhin am Start und darf nicht als frei gelten, solange die Pause läuft.
     */
    /**
     * Die AKTIVEN Sequenzen, in denen Teams dieser Partie stehen - das, was ein Fehlstart
     * abzubrechen hat.
     *
     * Eine Liste und kein einzelner Wert, obwohl der Regelfall genau eine Sequenz ist: die
     * Eindeutigkeit gilt je POSTEN (`uq_timing_sequence_active_station`), nicht je Partie. Stünden
     * die Boote eines Laufs ausnahmsweise in Sequenzen zweier Startposten, dürfte ein Rückruf
     * keine davon stehen lassen - eine übersehene Sequenz feuerte weiter Startmarken, während die
     * alten gerade zurückgehen.
     *
     * `distinct`, weil ein Lauf mehrere Boote in derselben Sequenz hat (Welle/Massenstart) und die
     * Sequenz sonst so oft aufträte, wie sie Boote dieses Laufs führt.
     */
    fun getActiveSequenceIdsForMatch(eventId: UUID, setupMatchId: UUID) = Jooq.query {
        selectDistinct(TIMING_START_SEQUENCE.ID)
            .from(TIMING_START_SEQUENCE_ENTRY)
            .join(TIMING_START_SEQUENCE)
            .on(TIMING_START_SEQUENCE_ENTRY.SEQUENCE.eq(TIMING_START_SEQUENCE.ID))
            .join(COMPETITION_MATCH_TEAM)
            .on(COMPETITION_MATCH_TEAM.ID.eq(TIMING_START_SEQUENCE_ENTRY.COMPETITION_MATCH_TEAM))
            .where(TIMING_START_SEQUENCE.EVENT.eq(eventId))
            .and(TIMING_START_SEQUENCE.STATE.`in`(SequenceState.activeNames))
            // competition_match_team.competition_match zeigt auf den SETUP-Lauf (siehe
            // TimingMatchRepo) - deshalb hier direkt der Vergleich ohne weiteren Join.
            .and(COMPETITION_MATCH_TEAM.COMPETITION_MATCH.eq(setupMatchId))
            .fetch { it[TIMING_START_SEQUENCE.ID]!! }
    }

    fun getTeamsInActiveSequences(eventId: UUID) = Jooq.query {
        select(TIMING_START_SEQUENCE_ENTRY.COMPETITION_MATCH_TEAM)
            .from(TIMING_START_SEQUENCE_ENTRY)
            .join(TIMING_START_SEQUENCE)
            .on(TIMING_START_SEQUENCE_ENTRY.SEQUENCE.eq(TIMING_START_SEQUENCE.ID))
            .where(TIMING_START_SEQUENCE.EVENT.eq(eventId))
            .and(TIMING_START_SEQUENCE.STATE.`in`(SequenceState.activeNames))
            .fetch { it[TIMING_START_SEQUENCE_ENTRY.COMPETITION_MATCH_TEAM]!! }
    }
}
