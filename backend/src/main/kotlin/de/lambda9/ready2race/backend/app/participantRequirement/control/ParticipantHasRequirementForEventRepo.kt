package de.lambda9.ready2race.backend.app.participantRequirement.control

import de.lambda9.ready2race.backend.database.delete
import de.lambda9.ready2race.backend.database.exists
import de.lambda9.ready2race.backend.database.generated.tables.records.ParticipantHasRequirementForEventRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.CHECKED_PARTICIPANT_REQUIREMENT
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.backend.database.select
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.util.*

object ParticipantHasRequirementForEventRepo {

    fun create(record: ParticipantHasRequirementForEventRecord) = PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.insert(record)

    /**
     * Zieht die Freitext-Notiz einer bestehenden Erfüllung nach.
     *
     * Zwei Dinge sind hier seit der Migration V202608141900 anders, beide mit Absicht:
     *
     * 1. Geschrieben wird direkt per `update`-Anweisung statt über das sonst übliche
     *    Record-Muster. Die Tabelle trägt keinen Primärschlüssel mehr - er kann die nullbaren
     *    Dimensionen nicht aufnehmen -, und ohne Primärschlüssel erzeugt jOOQ kein
     *    `UpdatableRecord`, an dem die Erweiterung `TableImpl.update` hängt.
     * 2. Die Bedingung umfasst weiterhin nur (Person, Veranstaltung, Bedingung) und damit
     *    ausdrücklich alle Dimensionszeilen dieser Kombination. Die Meldestelle hakt über
     *    diesen Weg veranstaltungsweit ab; eine Einschränkung auf Tag oder Wettkampf würde
     *    hier die Zeilen aus der Bestandsmigration (Tag = erster Wettkampftag) verfehlen und
     *    die Notiz stillschweigend verlieren. Die dimensionsscharfe Pflege gehört zu den
     *    Prüf-Oberflächen, die auf [RequirementScopeLogic] aufsetzen.
     */
    fun updateNote(
        participantId: UUID,
        eventId: UUID,
        participantRequirementId: UUID,
        note: String?,
    ) = Jooq.query {
        with(PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT) {
            update(this)
                .set(NOTE, note)
                .where(
                    DSL.and(
                        PARTICIPANT.eq(participantId),
                        EVENT.eq(eventId),
                        PARTICIPANT_REQUIREMENT.eq(participantRequirementId),
                    )
                )
                .execute()
        }
    }

    fun exists(eventId: UUID, participantRequirementId: UUID, participantId: UUID) =
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.exists {
            EVENT.eq(eventId).and(PARTICIPANT_REQUIREMENT.eq(participantRequirementId))
                .and(PARTICIPANT.eq(participantId))
        }

    fun delete(eventId: UUID, participantRequirementId: UUID, participantId: UUID) =
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.delete {
            EVENT.eq(eventId)
                .and(PARTICIPANT_REQUIREMENT.eq(participantRequirementId).and(PARTICIPANT.eq(participantId)))
        }

    fun getApprovedParticipantIds(eventId: UUID, participantRequirementId: UUID) = Jooq.query {
        with(PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT) {
            select(PARTICIPANT)
                .from(this)
                .where(EVENT.eq(eventId))
                .and(PARTICIPANT_REQUIREMENT.eq(participantRequirementId))
                .fetchInto(UUID::class.java)
        }
    }

    fun deleteWhereParticipantNotInList(
        eventId: UUID,
        participantRequirementId: UUID,
        approvedParticipants: List<UUID>
    ) = PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.delete {
        EVENT.eq(eventId).and(PARTICIPANT_REQUIREMENT.eq(participantRequirementId))
            .and(PARTICIPANT.notIn(approvedParticipants))
    }

    /**
     * Die Erfüllungen einer Person zu einer Veranstaltung samt ihrer Dimensionen (Tag,
     * Wettkampf). Grundlage für die laufbezogene Auswertung in
     * [de.lambda9.ready2race.backend.app.participantRequirement.boundary.RequirementScopeLogic]:
     * Wer wissen will, ob eine Bedingung *in diesem Lauf* erfüllt ist, braucht die Zeilen
     * selbst und nicht nur die Kennungen der Bedingungen.
     *
     * Die Notiz kommt bewusst mit: Anders als bei den öffentlichen Wegen (siehe
     * `MyEventRepo.findFulfilledRequirementIds`) liest hier nur die Meldestelle mit.
     */
    fun getFulfillments(eventId: UUID, participantId: UUID) =
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.select {
            DSL.and(
                EVENT.eq(eventId),
                PARTICIPANT.eq(participantId),
            )
        }

    /** Batch-Fassung von [getFulfillments] - alle Personen eines Laufs in einer Abfrage. */
    fun getFulfillmentsForParticipants(eventId: UUID, participantIds: Collection<UUID>) =
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.select {
            DSL.and(
                EVENT.eq(eventId),
                PARTICIPANT.`in`(participantIds),
            )
        }

    /**
     * Die Bedingung auf genau eine Dimensionszeile - dieselbe Spaltenmenge, die der eindeutige
     * Index `participant_has_requirement_for_event_uq` trägt.
     *
     * `isNotDistinctFrom` statt `eq`, weil beide Dimensionen null sein dürfen und `x = null` in
     * SQL niemals wahr wird. Das ist die Kotlin-Entsprechung zum `nulls not distinct` des Index:
     * "kein Tag" ist hier ein Wert wie jeder andere und nicht ein unbekannter.
     */
    private fun dimensionCondition(eventDay: UUID?, competition: UUID?) = DSL.and(
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.EVENT_DAY.isNotDistinctFrom(eventDay),
        PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.COMPETITION.isNotDistinctFrom(competition),
    )

    /**
     * Gibt es genau diese Erfüllung schon - Person, Veranstaltung, Bedingung **und** Dimensionen?
     *
     * Anders als [exists] fragt das dimensionsscharf: Wer für den Samstag gewogen ist, hat für
     * den Sonntag noch nichts, und beides sind eigene Zeilen.
     */
    fun existsForKey(
        eventId: UUID,
        participantRequirementId: UUID,
        participantId: UUID,
        eventDay: UUID?,
        competition: UUID?,
    ) = PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.exists {
        DSL.and(
            EVENT.eq(eventId),
            PARTICIPANT_REQUIREMENT.eq(participantRequirementId),
            PARTICIPANT.eq(participantId),
            dimensionCondition(eventDay, competition),
        )
    }

    /**
     * Nimmt genau eine Dimensionszeile zurück. Das Gegenstück zu [delete], das alle Zeilen einer
     * Person zu einer Bedingung trifft: Wer am Steg den Haken für den Sonntag entfernt, darf die
     * Wiegung vom Samstag nicht mitlöschen - sie ist ein eigener, bereits erbrachter Nachweis.
     */
    fun deleteForKey(
        eventId: UUID,
        participantRequirementId: UUID,
        participantId: UUID,
        eventDay: UUID?,
        competition: UUID?,
    ) = PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT.delete {
        DSL.and(
            EVENT.eq(eventId),
            PARTICIPANT_REQUIREMENT.eq(participantRequirementId),
            PARTICIPANT.eq(participantId),
            dimensionCondition(eventDay, competition),
        )
    }

    /**
     * Zieht die Notiz genau einer Dimensionszeile nach - dimensionsscharfes Gegenstück zu
     * [updateNote]. Zur `update`-Anweisung statt des Record-Musters siehe dort.
     */
    fun updateNoteForKey(
        eventId: UUID,
        participantRequirementId: UUID,
        participantId: UUID,
        eventDay: UUID?,
        competition: UUID?,
        note: String?,
    ) = Jooq.query {
        with(PARTICIPANT_HAS_REQUIREMENT_FOR_EVENT) {
            update(this)
                .set(NOTE, note)
                .where(
                    DSL.and(
                        EVENT.eq(eventId),
                        PARTICIPANT_REQUIREMENT.eq(participantRequirementId),
                        PARTICIPANT.eq(participantId),
                        dimensionCondition(eventDay, competition),
                    )
                )
                .execute()
        }
    }

    fun getApprovedRequirements(eventId: UUID, participantId: UUID) =
        CHECKED_PARTICIPANT_REQUIREMENT.select {
            DSL.and(
                EVENT.eq(eventId),
                PARTICIPANT.eq(participantId)
            )
        }

}