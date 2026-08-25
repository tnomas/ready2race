package de.lambda9.ready2race.backend.app.timing.control

import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationEntry
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_TIMING_STATION
import de.lambda9.ready2race.backend.database.generated.tables.references.TIMING_STATION
import de.lambda9.tailwind.jooq.Jooq
import java.time.LocalDateTime
import java.util.UUID

object CompetitionTimingStationRepo {

    /** Eine Zeile mit dem, was der Posten der Veranstaltung dazu beisteuert. */
    data class StationRow(
        val timingStation: UUID,
        val name: String,
        val type: String,
        val distanceMeters: Int,
    )

    /**
     * Die Posten dieses Wettkampfs, nach DISTANZ sortiert — nicht nach `timing_station.sorting`:
     * Die Sortierung ordnet die Posten im Leitstand, die Distanz ordnet sie auf der Strecke. Zwei
     * Posten auf demselben Meter sind erlaubt (die Oberfläche warnt davor); dann entscheidet
     * `timing_station.sorting` — der Schlüssel, den der Leitstand ohnehin pflegt, statt einer
     * beliebigen alphabetischen Reihenfolge.
     */
    fun getByCompetition(competitionId: UUID) = Jooq.query {
        select(
            COMPETITION_TIMING_STATION.TIMING_STATION,
            TIMING_STATION.NAME,
            TIMING_STATION.TYPE,
            COMPETITION_TIMING_STATION.DISTANCE_METERS,
        )
            .from(COMPETITION_TIMING_STATION)
            .join(TIMING_STATION)
            .on(TIMING_STATION.ID.eq(COMPETITION_TIMING_STATION.TIMING_STATION))
            .where(COMPETITION_TIMING_STATION.COMPETITION.eq(competitionId))
            .orderBy(COMPETITION_TIMING_STATION.DISTANCE_METERS, TIMING_STATION.SORTING)
            .fetch {
                StationRow(
                    // Im Schema not null; die Projektion verliert nur die Garantie.
                    timingStation = it[COMPETITION_TIMING_STATION.TIMING_STATION]!!,
                    name = it[TIMING_STATION.NAME]!!,
                    type = it[TIMING_STATION.TYPE]!!,
                    distanceMeters = it[COMPETITION_TIMING_STATION.DISTANCE_METERS]!!,
                )
            }
    }

    /**
     * Dieselben Zeilen für ALLE Wettkämpfe einer Veranstaltung, gebündelt nach Wettkampf — der
     * Zuschnitt, den die Zwischenzeiten brauchen: Sie werden für die ganze Veranstaltung in einem
     * Zug gerechnet, und eine Abfrage je Wettkampf wäre bei einer Regatta mit dutzenden
     * Wettkämpfen ein Schwarm von Abfragen an jeder einzelnen Marke.
     *
     * Reihenfolge und Tiebreak wie in [getByCompetition]; die Gruppierung erhält sie je Wettkampf.
     */
    fun getByEvent(eventId: UUID) = Jooq.query {
        select(
            COMPETITION_TIMING_STATION.COMPETITION,
            COMPETITION_TIMING_STATION.TIMING_STATION,
            TIMING_STATION.NAME,
            TIMING_STATION.TYPE,
            COMPETITION_TIMING_STATION.DISTANCE_METERS,
        )
            .from(COMPETITION_TIMING_STATION)
            .join(TIMING_STATION)
            .on(TIMING_STATION.ID.eq(COMPETITION_TIMING_STATION.TIMING_STATION))
            .join(COMPETITION).on(COMPETITION.ID.eq(COMPETITION_TIMING_STATION.COMPETITION))
            .where(COMPETITION.EVENT.eq(eventId))
            .orderBy(COMPETITION_TIMING_STATION.DISTANCE_METERS, TIMING_STATION.SORTING)
            .fetch {
                it[COMPETITION_TIMING_STATION.COMPETITION]!! to StationRow(
                    timingStation = it[COMPETITION_TIMING_STATION.TIMING_STATION]!!,
                    name = it[TIMING_STATION.NAME]!!,
                    type = it[TIMING_STATION.TYPE]!!,
                    distanceMeters = it[COMPETITION_TIMING_STATION.DISTANCE_METERS]!!,
                )
            }
            .groupBy({ it.first }, { it.second })
    }

    /**
     * Setzt die Liste dieses Wettkampfs auf genau [stations]: Was nicht mehr dabei ist, fällt weg;
     * was dabei bleibt, zieht seinen Meter nach und behält dabei seinen Anlege-Stempel — deshalb
     * ein `on conflict do update` und kein Abräumen der ganzen Liste. Beides in einem Aufruf, weil
     * es fachlich EIN Vorgang ist (das PUT ersetzt die Liste).
     *
     * Eine leere Liste räumt den Wettkampf ab; der Sonderfall steht hier, weil ein `not in ()` je
     * nach Dialekt nicht das Naheliegende tut.
     */
    fun replaceForCompetition(
        competitionId: UUID,
        stations: List<CompetitionTimingStationEntry>,
        userId: UUID,
    ) = Jooq.query {
        val now = LocalDateTime.now()

        val delete = deleteFrom(COMPETITION_TIMING_STATION)
            .where(COMPETITION_TIMING_STATION.COMPETITION.eq(competitionId))
        if (stations.isEmpty()) {
            delete.execute()
        } else {
            delete.and(COMPETITION_TIMING_STATION.TIMING_STATION.notIn(stations.map { it.timingStation }))
                .execute()
        }

        stations.forEach { station ->
            insertInto(COMPETITION_TIMING_STATION)
                .set(COMPETITION_TIMING_STATION.ID, UUID.randomUUID())
                .set(COMPETITION_TIMING_STATION.COMPETITION, competitionId)
                .set(COMPETITION_TIMING_STATION.TIMING_STATION, station.timingStation)
                .set(COMPETITION_TIMING_STATION.DISTANCE_METERS, station.distanceMeters)
                .set(COMPETITION_TIMING_STATION.CREATED_AT, now)
                .set(COMPETITION_TIMING_STATION.CREATED_BY, userId)
                .set(COMPETITION_TIMING_STATION.UPDATED_AT, now)
                .set(COMPETITION_TIMING_STATION.UPDATED_BY, userId)
                .onConflict(COMPETITION_TIMING_STATION.COMPETITION, COMPETITION_TIMING_STATION.TIMING_STATION)
                .doUpdate()
                .set(COMPETITION_TIMING_STATION.DISTANCE_METERS, station.distanceMeters)
                .set(COMPETITION_TIMING_STATION.UPDATED_AT, now)
                .set(COMPETITION_TIMING_STATION.UPDATED_BY, userId)
                .execute()
        }
    }
}
