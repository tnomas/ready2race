package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competitionExecution.control.CompetitionMatchTeamRepo
import de.lambda9.ready2race.backend.app.eventInfo.boundary.EventChangeMarker
import de.lambda9.ready2race.backend.app.timing.control.*
import de.lambda9.ready2race.backend.app.timing.entity.*
import de.lambda9.ready2race.backend.calls.responses.AfterCommit
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.ApiResponse.Companion.noData
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingAssignmentRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingDeviceTokenRecord
import de.lambda9.ready2race.backend.database.generated.tables.records.TimingTimeMarkRecord
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH
import de.lambda9.ready2race.backend.database.generated.tables.references.COMPETITION_MATCH_TEAM
import de.lambda9.ready2race.backend.database.generated.tables.references.PARTICIPANT
import de.lambda9.tailwind.core.KIO
import de.lambda9.tailwind.core.extensions.kio.onNullFail
import de.lambda9.tailwind.core.extensions.kio.orDie
import de.lambda9.tailwind.core.extensions.kio.traverse
import java.time.LocalDateTime
import java.util.UUID

object TimingService {

    fun addStation(
        request: TimingStationRequest,
        userId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.Created> = KIO.comprehension {
        val nameTaken = !TimingStationRepo.existsByEventAndName(eventId, request.name).orDie()
        !KIO.failOn(nameTaken) { TimingError.StationNameTaken }
        !checkLinkedStation(request, eventId)

        val record = !request.toRecord(userId, eventId)
        val id = !TimingStationRepo.create(record).orDie()
        broadcastAsync(eventId, TimingWsMessage.StationsChanged)
        KIO.ok(ApiResponse.Created(id))
    }

    fun getStations(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { ApiResponse.ListDto(it) }
    }

    fun updateStation(
        request: TimingStationRequest,
        userId: UUID,
        stationId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val nameTaken = !TimingStationRepo.existsByEventAndName(eventId, request.name, excludingId = stationId).orDie()
        !KIO.failOn(nameTaken) { TimingError.StationNameTaken }
        !checkLinkedStation(request, eventId, stationId = stationId)

        // Ein Posten, den Anzeigen spiegeln, darf nicht klammheimlich aufhören, ein START-Posten
        // zu sein - die Anzeigen zeigten sonst die Sequenzen eines Posten-Typs, den es nicht gibt.
        if (request.type != TimingStationType.START && station.type == TimingStationType.START.name) {
            val mirrored = !TimingStationRepo.existsLinkedTo(stationId).orDie()
            !KIO.failOn(mirrored) { TimingError.LinkedStationInvalid }
        }

        !TimingStationRepo.update(stationId) {
            name = request.name
            type = request.type.name
            sorting = request.sorting
            linkedStation = request.linkedStation
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { TimingError.StationNotFound }
        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    fun deleteStation(
        stationId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        val hasMarks = !TimingTimeMarkRepo.existsByStation(stationId).orDie()
        !KIO.failOn(hasMarks) { TimingError.StationHasTimeMarks }
        !TimingStationRepo.delete(stationId).orDie()
        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    fun createTimeMark(
        request: CreateTimeMarkRequest,
        userId: UUID,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> =
        createMark(request, eventId, source = "APP_USER", createdBy = userId)

    /**
     * Capture path for timing hardware authenticated by a device token instead of a session.
     *
     * The mark is recorded as [source] `HARDWARE` with no `created_by`: there is no app user behind
     * it, and the station the token is bound to has already been verified by
     * [TimingDeviceTokenService.validate] before this is called.
     */
    fun createHardwareTimeMark(
        request: CreateTimeMarkRequest,
        eventId: UUID,
    ): App<ServiceError, ApiResponse.Created> =
        createMark(request, eventId, source = "HARDWARE", createdBy = null)

    /**
     * Nur für ANZEIGE relevant: die Verknüpfung darf ausschließlich an einer ANZEIGE hängen und
     * muss auf einen START-Posten derselben Veranstaltung zeigen (nicht auf sich selbst). Die
     * Datenbank prüft davon nur den Typ-Teil des eigenen Postens (Check-Constraint); Event- und
     * Zieltyp-Bindung prüft wie üblich der Service.
     */
    private fun checkLinkedStation(
        request: TimingStationRequest,
        eventId: UUID,
        stationId: UUID? = null,
    ): App<TimingError, Unit> = KIO.comprehension {
        val linkedId = request.linkedStation ?: return@comprehension KIO.ok(Unit)
        !KIO.failOn(request.type != TimingStationType.ANZEIGE) { TimingError.LinkedStationInvalid }
        !KIO.failOn(linkedId == stationId) { TimingError.LinkedStationInvalid }
        val linked = !TimingStationRepo.get(linkedId).orDie().onNullFail { TimingError.LinkedStationInvalid }
        !KIO.failOn(linked.event != eventId) { TimingError.LinkedStationInvalid }
        !KIO.failOn(linked.type != TimingStationType.START.name) { TimingError.LinkedStationInvalid }
        KIO.ok(Unit)
    }

    private fun createMark(
        request: CreateTimeMarkRequest,
        eventId: UUID,
        source: String,
        createdBy: UUID?,
    ): App<ServiceError, ApiResponse.Created> = KIO.comprehension {
        val exists = !TimingTimeMarkRepo.exists(request.id).orDie()
        if (exists) {
            KIO.ok(ApiResponse.Created(request.id))
        } else {
            val station = !TimingStationRepo.get(request.station).orDie()
                .onNullFail { TimingError.StationNotFound }
            !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }
            // Eine Anzeige misst nichts: Marken auf einem ANZEIGE-Posten sind immer ein Fehler,
            // egal ob per Sitzung oder Geräte-Token erfasst.
            !KIO.failOn(station.type == TimingStationType.ANZEIGE.name) { TimingError.StationNotCapturing }

            val record = TimingTimeMarkRecord(
                id = request.id,
                event = eventId,
                station = request.station,
                timestampMillis = request.timestampMillis,
                source = source,
                status = "ACTIVE",
                createdAt = LocalDateTime.now(),
                createdBy = createdBy,
            )
            val inserted = !TimingTimeMarkRepo.createIfAbsent(record).orDie()
            if (inserted > 0) {
                broadcastAsync(eventId, TimingWsMessage.TimeMarkCreated(timeMarkDto(record, null)))
            }
            KIO.ok(ApiResponse.Created(request.id))
        }
    }

    fun retractTimeMark(
        timeMarkId: UUID,
        eventId: UUID,
        userId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }
        val assignedTeam = (!TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie())?.competitionMatchTeam
        !TimingTimeMarkRepo.update(timeMarkId) {
            status = "RETRACTED"
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie()
            .onNullFail { TimingError.TimeMarkNotFound }
        // Die Rücknahme ändert, was die offizielle Zeit des Teams ergibt - Neuberechnung und
        // Rückschreibung laufen sofort mit (Echtzeit-Übernahme), im selben Request. Hat sie das
        // Ergebnis wirklich vom Lauf geräumt, erfahren die öffentlichen Anzeigen davon über den
        // einen Bump - eine Rücknahme ohne Rückschreibung (z.B. fremdes Ergebnis) bleibt still.
        val written = !TimingOfficialTimeService.recomputeApplyAndBroadcast(eventId, listOfNotNull(assignedTeam), userId)
        if (written) {
            EventChangeMarker.bump(eventId)
        }
        broadcastAsync(eventId, TimingWsMessage.TimeMarkRetracted(timeMarkId))
        noData
    }

    /**
     * Das Gegenstück zur Rücknahme: eine RETRACTED-Marke wird wieder ACTIVE. Die frühere Zuordnung
     * ist nie gelöst worden und lebt damit einfach wieder auf; die Echtzeit-Übernahme rechnet
     * sofort nach, sodass eine wiederhergestellte Zielzeit auch wieder am Lauf steht.
     *
     * Idempotent: eine bereits aktive Marke ist kein Fehler - der Klick hat sein Ziel erreicht.
     * Audit-Spur wie bei der Rücknahme selbst (updated_at/updated_by, V202608171800); nur mit
     * Nutzersitzung erreichbar, nicht per Geräte-Token.
     */
    fun reactivateTimeMark(
        timeMarkId: UUID,
        eventId: UUID,
        userId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }
        if (mark.status == "ACTIVE") return@comprehension noData

        val assignedTeam = (!TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie())?.competitionMatchTeam
        !TimingTimeMarkRepo.update(timeMarkId) {
            status = "ACTIVE"
            updatedAt = LocalDateTime.now()
            updatedBy = userId
        }.orDie()
            .onNullFail { TimingError.TimeMarkNotFound }
        val written = !TimingOfficialTimeService.recomputeApplyAndBroadcast(eventId, listOfNotNull(assignedTeam), userId)

        // Die Reaktivierung ist das Gegenstück zur Versuchs-Rücknahme - lebt mit ihr auch eine
        // zugeordnete Startmarke wieder auf, bekommt die Partie ihren Ist-Start zurück (nur wenn
        // started_at leer ist; ein inzwischen von Hand gestempelter Start bleibt stehen).
        val stamped = if (assignedTeam != null) {
            !TimingMatchStampService.stampStartFromMarks(eventId, listOf(assignedTeam), userId)
        } else {
            false
        }

        // Wiederhergestelltes Ergebnis und wiederauflebender Ist-Start derselben Mutation sind
        // für die öffentlichen Anzeigen EINE Änderung - ein gemeinsamer Bump statt zweier.
        if (written || stamped) {
            EventChangeMarker.bump(eventId)
        }

        broadcastAsync(eventId, TimingWsMessage.TimeMarkReactivated(timeMarkId))
        noData
    }

    /**
     * Bündel-Rücknahme des ganzen Versuchs („Start zurücknehmen und neu starten"): ALLE ACTIVE
     * Marken, die Teams der Partie zugeordnet sind — Start-, Ziel- und Rundenmarken —, werden in
     * einem Griff auf RETRACTED gestellt. Nicht nur die Startmarken: Alte Zielzeiten eines
     * verworfenen Versuchs würden sich sonst durch die Echtzeit-Übernahme sofort mit den neuen
     * Startmarken zu falschen offiziellen Zeiten verrechnen. Die Zuordnungen bleiben stehen (wie
     * bei der Einzel-Rücknahme, über die Reaktivierung wiederherstellbar), die Echtzeit-Übernahme
     * räumt die offiziellen Zeiten der betroffenen Teams sofort mit ab und die Partie fällt in
     * der Startliste zurück auf „offen" — der Posten kann sie erneut starten.
     *
     * Abgrenzung: „Start nachträglich korrigieren" ist NICHT dieser Weg, sondern die
     * Einzelmarken-Korrektur in der Zeitenliste (eine Startmarke zurücknehmen und neu stempeln,
     * die Zielmarken bleiben aktiv) — [retractTimeMark] bleibt dafür exakt wie es ist.
     *
     * Bewusst idempotent und ohne Existenzprüfung der Partie: keine passende Marke heißt schlicht
     * „nichts zurückzunehmen" (auch der Doppelklick auf den Menüpunkt ist damit harmlos).
     *
     * Mit dem Versuch geht auch der Laufzustand zurück: Ein von der Zeitnahme gestempelter
     * Ist-Start (`started_at`) fällt — die Partie zeigt wieder „In Vorbereitung", `activated_at`
     * bleibt stehen (sie ist weiter an den Start gerufen). Ein per Schiedsrichter-Stempel
     * gesetztes `started_at` bleibt dagegen unberührt; woran der eigene Stempel erkannt wird,
     * steht in [TimingMatchStampLogic.startRetracted]. Nur mit Nutzersitzung erreichbar, nicht
     * per Geräte-Token (Rücknahmen sind Ergebnis-Korrekturen).
     */
    fun retractMatchAttempt(
        setupMatchId: UUID,
        eventId: UUID,
        userId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val rows = !TimingTimeMarkRepo.getActiveMarksForMatch(eventId, setupMatchId).orDie()

        var written = false
        if (rows.isNotEmpty()) {
            val now = LocalDateTime.now()
            !rows.traverse { row ->
                TimingTimeMarkRepo.update(row.timeMarkId) {
                    status = "RETRACTED"
                    updatedAt = now
                    updatedBy = userId
                }.orDie()
            }
            // Wie bei der Einzel-Rücknahme: Neuberechnung und Rückschreibung laufen sofort mit, im
            // selben Request — die offiziellen Zeiten des Versuchs verschwinden damit aus den Läufen.
            written = !TimingOfficialTimeService.recomputeApplyAndBroadcast(
                eventId,
                rows.map { it.competitionMatchTeam }.distinct(),
                userId,
            )
            rows.forEach { broadcastAsync(eventId, TimingWsMessage.TimeMarkRetracted(it.timeMarkId)) }
        }

        // Auch ohne aktive Marken prüfen (alle Marken können schon einzeln zurückgenommen sein):
        // Der eigene Ist-Start-Stempel gehört bei der Versuchs-Rücknahme in jedem Fall zurück.
        val retractedStart = !TimingMatchStampService.retractStartOfAttempt(eventId, setupMatchId, userId)

        // Abgeräumte Ergebnisse und der zurückgenommene Laufzustand derselben Rücknahme sind für
        // die öffentlichen Anzeigen EINE Änderung - ein gemeinsamer Bump; ganz ohne Schreibvorgang
        // (Doppelklick auf den Menüpunkt) bleibt es still.
        if (written || retractedStart) {
            EventChangeMarker.bump(eventId)
            // Fehlstart-Signal an die Boards: EINE Nachricht je Rücknahme (nicht je Marke), nur
            // wenn wirklich etwas zurückging - der harmlose Doppelklick bleibt auch hier still.
            broadcastAsync(
                eventId,
                TimingWsMessage.AttemptRetracted(
                    competitionSetupMatch = setupMatchId,
                    competitionMatchTeams = rows.map { it.competitionMatchTeam }.distinct(),
                ),
            )
        }

        noData
    }

    /**
     * Der ausdrückliche FEHLSTART einer Partie - der Rückruf am Startposten.
     *
     * Mechanisch ist das nichts Neues, und das ist Absicht: Erst werden die aktiven Startsequenzen
     * abgebrochen, in denen Boote dieser Partie stehen ([TimingSequenceService.abortSequence] -
     * sonst feuerte die Kette weiter Startmarken, während die alten gerade zurückgehen), dann geht
     * der ganze Versuch zurück ([retractMatchAttempt]). Beide Wege gab es schon, beide bleiben die
     * eine Stelle, an der ihre Regeln stehen - hier wird nur die Reihenfolge festgelegt.
     *
     * Neu ist die ABSICHT, und die trägt [TimingWsMessage.FalseStart]: „dieser Lauf wurde
     * zurückgerufen", damit die Athletenanzeigen rot blinken können. Die
     * [TimingWsMessage.AttemptRetracted] der Rücknahme läuft unverändert mit - sie kommt auch beim
     * stillen Aufräumen und taugt deshalb nicht als Signal für eine Anzeige am Wasser.
     *
     * Abgelehnt wird der Rückruf, wenn der wirksame Zeitnahmetyp der Partie ihn abschaltet (oder
     * die Partie gar keinen Typ hat): im Rudersport wird ein Fehlstart im Timetrial mit Strafzeit
     * geahndet statt mit Rückruf, ein zurückgeholtes Einzelstart-Feld wäre dort falsch. Die
     * Prüfung sitzt bewusst HIER und nicht nur in der Oberfläche - ein Board mit veralteter
     * Startliste (Typ gerade umgestellt) darf keinen Rückruf durchbringen.
     *
     * Was hier ABSICHTLICH nicht passiert: eine automatische 10-Sekunden-Strafzeit. Die 10 s waren
     * die Begründung dafür, dass Timetrials den Rückruf abschalten, nicht ein Auftrag, sie zu
     * vergeben - eine Strafe entscheidet der Schiedsrichter, und der Weg dafür steht schon
     * (`penaltyMillis` an der offiziellen Zeit).
     *
     * Rechte wie bei der Versuchs-Rücknahme: nur mit Nutzersitzung, nie per Geräte-Token - ein
     * Fehlstart nimmt Ergebnisse zurück.
     */
    fun falseStart(
        setupMatchId: UUID,
        eventId: UUID,
        userId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        // Über die Startliste statt über eine eigene Abfrage: sie ist der Zuschnitt, den die
        // Posten sehen (nur INTERN gezeitete, materialisierte, wirklich zu fahrende Läufe). Eine
        // Partie, die dort nicht vorkommt, hat am Startposten keinen Rückruf zu erwarten.
        val matches = !TimingMatchRepo.getMatchesByEvent(eventId).orDie()
        val match = !KIO.ok(matches.firstOrNull { it.setupMatchId == setupMatchId })
            .onNullFail { TimingError.FalseStartDisabled }

        val assignments = !TimingModeAssignmentRepo.getByEvent(eventId).orDie()
        val modeId = TimingModeResolveLogic.resolve(
            assignments.map {
                TimingModeResolveLogic.ModeAssignment(it.competition, it.competitionSetupRound, it.timingMode)
            },
            match.competitionId,
            match.roundId,
        )
        val mode = modeId?.let { !TimingModeRepo.get(it).orDie() }
        // Über die DTO-Umwandlung, damit die Rückfallregel für die nullable getippte Spalte an
        // genau einer Stelle steht (siehe Conversions) - kein zweites `?: true` hier.
        !KIO.failOn(mode == null || !mode.toDto().falseStartEnabled) { TimingError.FalseStartDisabled }

        // Zuerst die Kette anhalten, dann zurücknehmen: umgekehrt könnte ein fälliger Eintrag
        // zwischen Rücknahme und Abbruch noch eine frische Startmarke setzen, die niemand mehr
        // abräumt.
        val sequenceIds = !TimingSequenceEntryRepo.getActiveSequenceIdsForMatch(eventId, setupMatchId).orDie()
        !sequenceIds.traverse { TimingSequenceService.abortSequence(it, userId, eventId) }

        !retractMatchAttempt(setupMatchId, eventId, userId)

        // Immer gemeldet, auch wenn nichts zurückzunehmen war (Rückruf noch vor der ersten Marke):
        // Genau dann ist der Rückruf am wichtigsten - die Boote stehen noch, und die Anzeige ist
        // das Einzige, was sie erreicht. Die Sparsamkeit der Rücknahme ("nur wenn wirklich etwas
        // zurückging") passt zum Aufräumen, nicht zum Rückruf.
        broadcastAsync(eventId, TimingWsMessage.FalseStart(setupMatchId))
        noData
    }

    fun assignTimeMark(
        request: AssignTimeMarkRequest,
        userId: UUID,
        timeMarkId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> =
        assign(request, timeMarkId, eventId, userId = userId, deviceId = null)

    /**
     * Klick-Zuordnung vom geteilten Posten-Gerät: Zuordnen und Umhängen ohne Sitzung, mit dem
     * Geräte-Token als Ausweis. Der Spielraum ist bewusst enger als mit Sitzung: nur Marken des
     * EIGENEN Postens (ein Zielposten hängt nie Startmarken um), und Tokens von ANZEIGE-Posten
     * dürfen gar nicht schreiben. Beides antwortet als [TimingError.DeviceTokenInvalid], ohne zu
     * verraten, woran es lag - wie jede andere Token-Ablehnung. Die Rücknahme von Marken und
     * Ergebnissen bleibt Sitzungssache.
     */
    fun assignTimeMarkByDevice(
        request: AssignTimeMarkRequest,
        deviceToken: TimingDeviceTokenRecord,
        timeMarkId: UUID,
        eventId: UUID,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.station != deviceToken.station) { TimingError.DeviceTokenInvalid }

        // station ist seit Migration V202608250900 nullbar, weil dieselbe Tabelle auch
        // Board-Tokens trägt (Anzeigen-Links). Ein solches Token hat hier nichts verloren -
        // Zeitmarken hängt nur ein Posten-Token um -, und es fliegt mit derselben opaken
        // Antwort raus wie jeder andere falsche Zuschnitt.
        val stationId = !KIO.ok(deviceToken.station).onNullFail { TimingError.DeviceTokenInvalid }
        val station = !TimingStationRepo.get(stationId).orDie()
            .onNullFail { TimingError.DeviceTokenInvalid }
        !KIO.failOn(station.type == TimingStationType.ANZEIGE.name) { TimingError.DeviceTokenInvalid }

        !assign(request, timeMarkId, eventId, userId = null, deviceId = deviceToken.id)
        noData
    }

    private fun assign(
        request: AssignTimeMarkRequest,
        timeMarkId: UUID,
        eventId: UUID,
        userId: UUID?,
        deviceId: UUID?,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val mark = !TimingTimeMarkRepo.get(timeMarkId).orDie().onNullFail { TimingError.TimeMarkNotFound }
        !KIO.failOn(mark.event != eventId) { TimingError.EventMismatch }

        // Read before the change so the team the mark is moving away from can be flagged too.
        val existing = !TimingAssignmentRepo.getByTimeMark(timeMarkId).orDie()
        val previousTeam = existing?.competitionMatchTeam

        val team = request.competitionMatchTeam
        if (team == null) {
            !TimingAssignmentRepo.deleteByTimeMark(timeMarkId).orDie()
        } else {
            val teamEvent = !CompetitionMatchTeamRepo.getEventId(team).orDie()
                .onNullFail { TimingError.TeamNotFound }
            !KIO.failOn(teamEvent != eventId) { TimingError.EventMismatch }

            if (existing == null) {
                !TimingAssignmentRepo.create(
                    TimingAssignmentRecord(
                        id = UUID.randomUUID(),
                        timeMark = timeMarkId,
                        competitionMatchTeam = team,
                        createdAt = LocalDateTime.now(),
                        createdBy = userId,
                        createdByDevice = deviceId,
                        updatedAt = LocalDateTime.now(),
                        updatedBy = userId,
                        updatedByDevice = deviceId,
                    )
                ).orDie()
            } else {
                !TimingAssignmentRepo.update(existing.id) {
                    competitionMatchTeam = team
                    updatedAt = LocalDateTime.now()
                    // Genau EIN Akteur je Änderung: die jeweils andere Spalte wird geleert, damit
                    // die Revisionsspur den letzten Handelnden eindeutig benennt (Nutzer ODER
                    // Gerät), statt Reste des vorletzten stehen zu lassen.
                    updatedBy = userId
                    updatedByDevice = deviceId
                }.orDie()
            }
        }
        // Both ends of a move are affected: the team that loses the mark and the one that gains it.
        // A freshly created mark needs no hook of its own - it carries no assignment yet, so the
        // assignment that follows is what can change a team's official time. Neuberechnung und
        // Rückschreibung laufen sofort mit (Echtzeit-Übernahme), im selben Request.
        val written = !TimingOfficialTimeService.recomputeApplyAndBroadcast(eventId, listOfNotNull(previousTeam, team), userId)

        // Verschafft die Zuordnung der Partie ihre erste aktive Startmarke, ist das ihr Ist-Start
        // (started_at = früheste Markenzeit, TimingMatchStampService) - der Zielposten-Weg "Zeit
        // nehmen und zuordnen in einer Geste" läuft über genau diesen Pfad. Die Gegenrichtung
        // gibt es bewusst nicht: Das Umhängen der letzten Startmarke lässt started_at stehen
        // (Einzelkorrektur, kein Neustart der Partie).
        val stamped = if (team != null) {
            !TimingMatchStampService.stampStartFromMarks(eventId, listOf(team), userId)
        } else {
            false
        }

        // Der Bump entwertet die Caches der öffentlichen Anzeigen nur, wenn diese Zuordnung
        // wirklich etwas verändert hat - Ergebnis am Lauf und/oder Ist-Start-Stempel zählen als
        // EINE Änderung (ein gemeinsamer Bump); ein bloßes Umhängen ohne Folgen bleibt still.
        if (written || stamped) {
            EventChangeMarker.bump(eventId)
        }

        broadcastAsync(eventId, TimingWsMessage.AssignmentChanged(timeMarkId, request.competitionMatchTeam))
        noData
    }

    fun getState(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val stations = !TimingStationRepo.getByEvent(eventId).orDie()
        val marks = !TimingTimeMarkRepo.getByEvent(eventId).orDie()
        val assignments = !TimingAssignmentRepo.getByTimeMarks(marks.map { it.id }).orDie()
        val assignmentByMark = assignments.associateBy({ it.timeMark }, { it.competitionMatchTeam })

        stations.sortedBy { it.sorting }.traverse { it.toDto() }.map { stationDtos ->
            ApiResponse.Dto(
                TimingStateDto(
                    stations = stationDtos,
                    timeMarks = marks.sortedBy { it.timestampMillis }
                        .map { timeMarkDto(it, assignmentByMark[it.id]) },
                )
            )
        }
    }

    fun getTeams(
        eventId: UUID,
    ): App<ServiceError, ApiResponse> = KIO.comprehension {
        val records = !TimingTeamRepo.getByEvent(eventId).orDie()

        val teams = records.groupBy { it[COMPETITION_MATCH_TEAM.ID] }
            .mapNotNull { (teamId, groupedRecords) ->
                if (teamId == null) return@mapNotNull null
                val first = groupedRecords.first()
                TimingTeamDto(
                    competitionMatchTeam = teamId,
                    startNumber = first[COMPETITION_MATCH_TEAM.START_NUMBER],
                    teamName = first.get("team_name", String::class.java),
                    clubName = first.get("club_name", String::class.java),
                    participantNames = groupedRecords.mapNotNull { record ->
                        val firstname = record[PARTICIPANT.FIRSTNAME]
                        val lastname = record[PARTICIPANT.LASTNAME]
                        if (firstname == null && lastname == null) {
                            null
                        } else {
                            listOfNotNull(firstname, lastname).joinToString(" ")
                        }
                    },
                    competitionName = first.get("competition_name", String::class.java),
                    matchName = first.get("match_name", String::class.java),
                    matchPhase = TimingMatchPhase.of(
                        activatedAt = first[COMPETITION_MATCH.ACTIVATED_AT],
                        finishedAt = first[COMPETITION_MATCH.FINISHED_AT],
                    ),
                )
            }

        KIO.ok(ApiResponse.ListDto(teams))
    }

    // Broadcasts must never be visible before the surrounding transaction committed - a client that
    // refetches `/timing/state` on another connection would otherwise see pre-commit data, and a
    // rollback would emit a phantom event. AfterCommit buffers the enqueue until respondKIO has
    // committed and responded (and runs it immediately for non-HTTP callers).
    private fun broadcastAsync(eventId: UUID, message: TimingWsMessage) {
        AfterCommit.register {
            TimingBroadcaster.broadcast(eventId, message)
        }
    }
}
