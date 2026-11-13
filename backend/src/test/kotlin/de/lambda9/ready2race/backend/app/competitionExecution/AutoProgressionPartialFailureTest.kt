package de.lambda9.ready2race.backend.app.competitionExecution

import de.lambda9.ready2race.backend.app.competitionExecution.boundary.AutoRoundProgressionService
import de.lambda9.ready2race.backend.app.competitionSetup.entity.CompetitionSetupPlacesOption
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.database.generated.tables.records.CompetitionSetupRoundRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_PARTICIPANT
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_SETUP_ROUND
import de.lambda9.ready2race.backend.database.insert
import de.lambda9.ready2race.testing.testComprehension
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Die Automatik fängt Fehler von createNewRound ab. Erzeugt createNewRound in einem Durchlauf
 * mehrere Runden (Freilos-Runden ohne Pflicht) und scheitert erst an der zweiten, sind die Läufe
 * der ersten schon geschrieben - ohne Savepoint blieben sie, aber Slot-Stempel, Bump und
 * Zeitnahme-Push am Ende von createNewRound fehlten.
 *
 * Aufbau: Vorlauf (zwei Läufe, vier Boote) -> Zwischenrunde ohne Pflicht mit einem Lauf, in den
 * nur der Erste kommt (Freilos, automatischer Platz) -> Finale ohne Setup-Läufe
 * (NoSetupMatchesInRound).
 */
class AutoProgressionPartialFailureTest {

    @Test
    fun aRoundWrittenBeforeALaterFailureIsAnnounced() = testComprehension {
        val seed = seedTwoRoundCompetition(eventAutoCreate = true)
        val now = LocalDateTime.now()

        val second = !Jooq.query {
            selectFrom(COMPETITION_SETUP_ROUND).where(COMPETITION_SETUP_ROUND.ID.eq(seed.secondRoundId)).fetchSingle()
        }
        val thirdId = UUID.randomUUID()
        !COMPETITION_SETUP_ROUND.insert(
            CompetitionSetupRoundRecord(
                id = thirdId,
                competitionSetup = second.competitionSetup,
                name = "Finale",
                required = true,
                useDefaultSeeding = true,
                placesOption = CompetitionSetupPlacesOption.EQUAL.name,
                nextRound = null,
            )
        )
        !Jooq.query {
            update(COMPETITION_SETUP_ROUND)
                .set(COMPETITION_SETUP_ROUND.REQUIRED, false)
                .set(COMPETITION_SETUP_ROUND.NEXT_ROUND, thirdId)
                .where(COMPETITION_SETUP_ROUND.ID.eq(seed.secondRoundId)).execute()
            deleteFrom(COMPETITION_SETUP_PARTICIPANT)
                .where(COMPETITION_SETUP_PARTICIPANT.COMPETITION_SETUP_MATCH.eq(seed.secondRoundSetupMatchId))
                .and(COMPETITION_SETUP_PARTICIPANT.SEED.eq(2)).execute()
        }

        finishFirstRound(seed, now)
        val before = EventChangeMarker.current(seed.eventId)

        !AutoRoundProgressionService.progressIfRoundComplete(seed.eventId, seed.competitionId, seed.userId)

        val secondRoundMatches = !Jooq.query {
            fetchCount(COMPETITION_MATCH, COMPETITION_MATCH.COMPETITION_SETUP_MATCH.eq(seed.secondRoundSetupMatchId))
        }
        assertEquals(1, secondRoundMatches, "die Zwischenrunde ist erzeugt")
        assertTrue(
            EventChangeMarker.current(seed.eventId) > before,
            "eine erzeugte Runde muss die Anzeigen erreichen (Bump am Ende von createNewRound)",
        )
    }
}
