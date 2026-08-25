package de.lambda9.ready2race.backend.app.raceclocker.control

import de.lambda9.ready2race.backend.app.competitionExecution.entity.WaveName
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerPollEvent
import de.lambda9.ready2race.backend.app.raceclocker.entity.RaceClockerPollMatch
import de.lambda9.ready2race.backend.app.timingConfig.entity.TimingSystem
import de.lambda9.ready2race.backend.database.generated.tables.references.*
import de.lambda9.tailwind.jooq.Jooq
import org.jooq.impl.DSL
import java.time.LocalDateTime
import java.util.UUID

/**
 * Die Abfragen des automatischen RaceClocker-Abrufs.
 *
 * Der Herzschlag des Jobs läuft im Sekundentakt, deshalb ist [getPollingEvents] absichtlich winzig:
 * Sie liefert nur die Veranstaltungen mit eingeschalteter Automatik (im Normalfall keine oder eine)
 * und entscheidet damit, ob der teurere [getCandidates] überhaupt gebraucht wird.
 */
object RaceClockerPollRepo {

    fun getPollingEvents() = Jooq.query {
        select(
            EVENT.ID,
            EVENT.RACECLOCKER_INTERVAL_ACTIVE_SECONDS,
            EVENT.RACECLOCKER_INTERVAL_UPCOMING_SECONDS,
            EVENT.RACECLOCKER_WATCH_BEFORE_MINUTES,
            EVENT.RACECLOCKER_WATCH_AFTER_MINUTES,
        )
            .from(EVENT)
            .where(EVENT.RACECLOCKER_AUTO_PULL.isTrue)
            // Challenge-Veranstaltungen haben keine Läufe im Sinne der Durchführung; der manuelle
            // Pull weist sie mit IsChallengeEvent ab, der Job lädt sie gar nicht erst.
            .and(EVENT.CHALLENGE_EVENT.isFalse)
            .fetch {
                RaceClockerPollEvent(
                    // Im Schema not null; die Projektion verliert nur die Garantie.
                    eventId = it[EVENT.ID]!!,
                    intervalActiveSeconds = it[EVENT.RACECLOCKER_INTERVAL_ACTIVE_SECONDS]!!,
                    intervalUpcomingSeconds = it[EVENT.RACECLOCKER_INTERVAL_UPCOMING_SECONDS]!!,
                    watchBeforeMinutes = it[EVENT.RACECLOCKER_WATCH_BEFORE_MINUTES]!!,
                    watchAfterMinutes = it[EVENT.RACECLOCKER_WATCH_AFTER_MINUTES]!!,
                )
            }
    }

    /**
     * Die Läufe einer Veranstaltung, die der Job anfassen darf - ohne ihr Rennen: Das löst erst der
     * Takt auf ([RaceClockerPollLogic.candidatesFor]), und ein Lauf ohne auflösbares Rennen fällt
     * dort still heraus.
     *
     * Ausgeschlossen sind hier nur die harten Fälle: beendet, kein RaceClocker an der
     * Veranstaltung, Slot abgesagt. Das Zeitfenster fehlt bewusst - es hängt an `now` und gehört in die prüfbare
     * Logik, nicht in SQL.
     *
     * PAUSIERTE Läufe kommen seit dem 15.08.2026 MIT zurück (als [RaceClockerPollMatch.autoPausedAt]
     * markiert) statt herauszufallen: Die Pause gilt je Lauf und darf nur das SCHREIBEN dieses
     * einen Laufs stoppen. Fiel der Lauf schon hier heraus, zählte seine Aktivierung nicht mehr
     * für den Takt - eine Handeingabe in den einzigen aktivierten Lauf schaltete die ganze
     * Veranstaltung auf den langsamen Takt, und die übrigen Läufe der Runde wirkten eingefroren.
     * Wer nicht beschrieben werden darf, entscheidet der Job ([RaceClockerPollService.pollEvent]),
     * nicht diese Abfrage.
     */
    fun getCandidates(eventId: UUID) = Jooq.query {
        select(
            COMPETITION_MATCH.COMPETITION_SETUP_MATCH,
            COMPETITION_MATCH.START_TIME,
            COMPETITION_MATCH.ACTIVATED_AT,
            // Der Ist-Start entscheidet, ob der Abruf ihn im Feed noch nachtragen muss.
            COMPETITION_MATCH.STARTED_AT,
            // Die Pause je Lauf: markiert statt gefiltert, siehe KDoc.
            COMPETITION_MATCH.RACECLOCKER_AUTO_PAUSED_AT,
            // Freilose tragen ihren materialisierten Namen (V202608121300) - dieselbe Koaleszenz
            // wie startlist_view, sonst fände der Wellennamen-Abgleich die exportierte Welle nicht.
            DSL.coalesce(COMPETITION_MATCH.BYE_NAME, COMPETITION_SETUP_MATCH.NAME).`as`("match_name"),
            COMPETITION.ID.`as`("competition_id"),
            // Die Runde trägt den Pfad, den die Auflösung des Rennens braucht (Ebene 3 von vier).
            COMPETITION_SETUP_ROUND.ID,
            // Kennung und Kürzel tragen den Wettkampf in den Wellennamen (crf-2026).
            COMPETITION_PROPERTIES.IDENTIFIER,
            COMPETITION_PROPERTIES.SHORT_NAME,
        )
            .from(COMPETITION_MATCH)
            .join(COMPETITION_SETUP_MATCH)
            .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
            .join(COMPETITION_SETUP_ROUND)
            .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
            .join(COMPETITION_PROPERTIES)
            .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
            .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
            .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
            // Das Rennen wird nicht mehr im SQL gejoint: Seit dem Zeitnahmeprofil-Baum hängt es an
            // einer von vier Ebenen (Veranstaltung, Wettkampf, Runde, Partie). Eine
            // Ebenen-Auflösung gehört nicht in eine where-Klausel - sie steht in
            // TimingProfileResolveLogic und wird im Takt angewandt, genau wie TimingMatchService es
            // für den Zeitnahmetyp tut. Die Wirkung des früheren INNEREN Joins bleibt erhalten:
            // Läufe ohne aufgelöstes Rennen fallen dort still heraus.
            .where(COMPETITION.EVENT.eq(eventId))
            .and(COMPETITION_MATCH.FINISHED_AT.isNull)
            // Das Zeitnahme-System steht nur noch an der Veranstaltung: Zwei Zeitnahme-Softwares in
            // einer Regatta gibt es nicht.
            .and(EVENT.TIMING_SYSTEM.eq(TimingSystem.RACECLOCKER.name))
            // Ein abgesagter Slot bleibt abgesagt, auch wenn in RaceClocker jemand die Welle
            // startet. Die volle Zustandsableitung (EventScheduleLogic.deriveSlotState) ist hier
            // nicht nötig: Ihre beiden anderen Eingaben sind an dieser Stelle konstant - der Lauf
            // existiert, also ist die Runde erzeugt -, und damit bleibt genau `skipped_at` übrig.
            .andNotExists(
                DSL.selectOne()
                    .from(EVENT_SCHEDULE_SLOT)
                    .where(EVENT_SCHEDULE_SLOT.COMPETITION_SETUP_MATCH.eq(COMPETITION_MATCH.COMPETITION_SETUP_MATCH))
                    .and(EVENT_SCHEDULE_SLOT.SKIPPED_AT.isNotNull)
            )
            .fetch { record ->
                RaceClockerPollMatch(
                    matchId = record[COMPETITION_MATCH.COMPETITION_SETUP_MATCH]!!,
                    competitionId = record["competition_id", UUID::class.java],
                    roundId = record[COMPETITION_SETUP_ROUND.ID]!!,
                    startTime = record[COMPETITION_MATCH.START_TIME],
                    activatedAt = record[COMPETITION_MATCH.ACTIVATED_AT],
                    startedAt = record[COMPETITION_MATCH.STARTED_AT],
                    autoPausedAt = record[COMPETITION_MATCH.RACECLOCKER_AUTO_PAUSED_AT],
                    waveName = WaveName.format(
                        matchName = record["match_name", String::class.java],
                        startTime = record[COMPETITION_MATCH.START_TIME],
                        competitionIdentifier = record[COMPETITION_PROPERTIES.IDENTIFIER],
                        competitionShortName = record[COMPETITION_PROPERTIES.SHORT_NAME],
                    ),
                )
            }
    }

    /**
     * Ob dieser Lauf gerade für die Automatik pausiert ist.
     *
     * Der Takt sortiert Pausierte schon am Anfang aus (Markierung aus [getCandidates], Partition in
     * `pollEvent`). Zwischen dieser Lesung und dem Schreiben liegt aber der HTTP-Abruf mit zehn
     * Sekunden Zeitlimit - lang genug, dass ein Schiedsrichter dazwischen von Hand einträgt und
     * damit pausiert. Der Job fragt deshalb ein zweites Mal, in derselben Transaktion wie das
     * Schreiben, und lässt den Lauf dann in Ruhe.
     */
    fun isAutoPaused(matchId: UUID) = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION_MATCH)
                .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
                .and(COMPETITION_MATCH.RACECLOCKER_AUTO_PAUSED_AT.isNotNull)
        )
    }

    /**
     * Ob es für diesen Lauf überhaupt eine Automatik gibt, die man pausieren könnte: eingeschaltete
     * Automatik an der Veranstaltung und RaceClocker als ihr Zeitnahmesystem.
     *
     * Ohne diese Frage sammelt jede Handeingabe auf jeder Veranstaltung ein
     * `raceclocker_auto_paused_at` ein - auch dort, wo gar kein Zeitnahmesystem gesetzt ist. Die
     * Oberfläche schriebe dann dauerhaft „Automatischer Abruf pausiert" an einen Lauf und meinte
     * damit etwas, das es nicht gibt. Die Bedingungen sind bewusst dieselben wie in
     * [getPollingEvents] und [getCandidates]: Was der Job nie anfasst, wird auch nicht pausiert.
     */
    fun isAutoPullConfigured(matchId: UUID) = Jooq.query {
        fetchExists(
            selectOne()
                .from(COMPETITION_MATCH)
                .join(COMPETITION_SETUP_MATCH)
                .on(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(COMPETITION_SETUP_MATCH.ID))
                .join(COMPETITION_SETUP_ROUND)
                .on(COMPETITION_SETUP_MATCH.COMPETITION_SETUP_ROUND.eq(COMPETITION_SETUP_ROUND.ID))
                .join(COMPETITION_PROPERTIES)
                .on(COMPETITION_SETUP_ROUND.COMPETITION_SETUP.eq(COMPETITION_PROPERTIES.ID))
                .join(COMPETITION).on(COMPETITION_PROPERTIES.COMPETITION.eq(COMPETITION.ID))
                .join(EVENT).on(COMPETITION.EVENT.eq(EVENT.ID))
                .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
                .and(EVENT.RACECLOCKER_AUTO_PULL.isTrue)
                .and(EVENT.CHALLENGE_EVENT.isFalse)
                .and(EVENT.TIMING_SYSTEM.eq(TimingSystem.RACECLOCKER.name))
        )
    }

    /**
     * Der Ausgang eines Abrufversuchs. Rührt `updated_at`/`updated_by` bewusst NICHT an: Der
     * Zeitstempel sagt "der Job war hier", nicht "am Lauf hat sich etwas geändert" - sonst sähe im
     * Änderungsprotokoll alle fünf Sekunden jeder aktive Lauf bearbeitet aus.
     */
    fun recordPoll(matchId: UUID, at: LocalDateTime, errorCode: String?) = Jooq.query {
        update(COMPETITION_MATCH)
            .set(COMPETITION_MATCH.RACECLOCKER_POLLED_AT, at)
            .set(COMPETITION_MATCH.RACECLOCKER_POLL_ERROR, errorCode)
            .where(COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(matchId))
            .execute()
    }
}
