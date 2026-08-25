package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.App
import de.lambda9.ready2race.backend.app.ServiceError
import de.lambda9.ready2race.backend.app.competition.control.CompetitionRepo
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
            // Nur, wenn der Aufrufer die Betriebsart überhaupt nennt: ein Formular, das das Feld
            // nicht kennt (heute jedes), würde einen ARMED-Posten sonst beim bloßen Umbenennen
            // still auf ONETOUCH zurückfallen lassen - ein Rückfall, der eine Sicherung ENTFERNT.
            // Der Zustand `armed` steht aus demselben Grund gar nicht erst im Request.
            request.captureMode?.let {
                captureMode = it.name
                // Der WECHSEL nach ARMED lässt die Scharfschaltung fallen. Ohne das genügte ein
                // Ausflug nach ONETOUCH und zurück, damit ein Posten sich still selbst scharf
                // schaltet: `armed` läge im Onetouch-Betrieb brach, bliebe aber `true` stehen und
                // wäre bei der Rückkehr sofort wieder wirksam - scharf geschaltet von niemandem,
                // der vor Ort war. Das ist genau das, was die Scharfschaltung verhindern soll.
                //
                // Bewusst nur beim Wechsel, nicht bei jedem Setzen auf ARMED: Ein Speichern, das
                // die Betriebsart bei ARMED belässt (Umbenennen, Sortieren, Verknüpfen), entschärfte
                // sonst mitten im Lauf einen Posten, den der Zeitnehmer gerade selbst scharf
                // geschaltet hat - die Leitung nähme ihm aus der Ferne die Erfassung weg.
                if (it == TimingCaptureMode.ARMED && station.captureMode != TimingCaptureMode.ARMED.name) {
                    armed = false
                }
            }
            updatedBy = userId
            updatedAt = LocalDateTime.now()
        }.orDie()
            .onNullFail { TimingError.StationNotFound }

        // Der Name des Postens IST die Beschriftung seiner Zwischenzeiten - eine Umbenennung muss
        // in die bereits geschriebenen Zeilen wandern, sonst trägt derselbe Punkt der Strecke zwei
        // Namen, je nachdem wo man hinsieht. Und weil die öffentlichen Anzeigen genau diesen Namen
        // zeigen, gehört der Bump dazu; hat sich nichts geändert (Posten ohne Zeiten, reine
        // Sortier-Änderung), bleibt es still.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)
        if (splitsChanged) {
            EventChangeMarker.bump(eventId)
        }

        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    /**
     * Schaltet einen Posten scharf oder entschärft ihn wieder - die Geste des Zeitnehmers am Tag,
     * nicht die der Regattaleitung. Deshalb liegt sie neben der Betriebsart und nicht in ihr: ein
     * Speichern der Einrichtung darf einen scharfen Posten nicht mit zurücksetzen, und ein
     * Entschärfen nicht die Konfiguration überschreiben.
     *
     * Rührt `updated_at`/`updated_by` bewusst NICHT an: das sind die Revisionsspalten der
     * EINRICHTUNG. Ein Zustand, den der Zeitnehmer am Tag zwanzigmal kippt, hat dort nichts zu
     * suchen - er überschriebe sonst nach dem ersten Schalten, wer den Posten eingerichtet hat.
     */
    fun setStationArmed(
        stationId: UUID,
        eventId: UUID,
        armed: Boolean,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.StationNotFound }
        !KIO.failOn(station.event != eventId) { TimingError.EventMismatch }

        !TimingStationRepo.update(stationId) {
            this.armed = armed
        }.orDie()
            .onNullFail { TimingError.StationNotFound }

        // Der Leitstand und die übrigen Bildschirme sollen sehen, dass der Posten jetzt scharf ist
        // - dieselbe Nachricht wie bei jeder anderen Änderung an den Posten.
        broadcastAsync(station.event, TimingWsMessage.StationsChanged)
        noData
    }

    /**
     * Scharfschaltung vom geteilten Posten-Gerät: der Zeitnehmer am Tablet ist nirgends angemeldet
     * und weist sich mit dem Geräte-Token aus. Der Spielraum ist bewusst enger als mit Sitzung -
     * dasselbe Muster wie bei [assignTimeMarkByDevice]: nur der EIGENE Posten (das Token des
     * Zielpostens legt nie den Startposten stumm), und Tokens von ANZEIGE-Posten schalten gar
     * nichts - sie hängen an Athleten- und Schiedsrichter-Bildschirmen und dürfen ausschließlich
     * lesen. Beides antwortet als [TimingError.DeviceTokenInvalid], ohne zu verraten, woran es lag.
     *
     * Warum das hier zählt: Entschärfen sperrt jede zugeordnete Erfassung. Ein Token, das einen
     * fremden Posten entschärfen könnte, wäre ein Ausschalter für die Ziellinie.
     */
    fun setStationArmedByDevice(
        deviceToken: TimingDeviceTokenRecord,
        stationId: UUID,
        eventId: UUID,
        armed: Boolean,
    ): App<TimingError, ApiResponse.NoData> = KIO.comprehension {
        !KIO.failOn(deviceToken.station != stationId) { TimingError.DeviceTokenInvalid }

        val station = !TimingStationRepo.get(stationId).orDie().onNullFail { TimingError.DeviceTokenInvalid }
        !KIO.failOn(station.type == TimingStationType.ANZEIGE.name) { TimingError.DeviceTokenInvalid }

        !setStationArmed(stationId, eventId, armed)
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

    /**
     * Die Posten, die dieser Wettkampf passiert, mit ihrer Distanz auf DIESER Strecke - nach
     * Distanz sortiert, weil der Meter sie auf der Strecke ordnet und nicht die
     * Leitstand-Sortierung.
     */
    fun getCompetitionStations(
        competitionId: UUID,
        eventId: UUID,
    ): App<CompetitionTimingStationError, ApiResponse.ListDto<CompetitionTimingStationDto>> = KIO.comprehension {
        !ensureCompetitionOfEvent(competitionId, eventId)

        val rows = !CompetitionTimingStationRepo.getByCompetition(competitionId).orDie()
        KIO.ok(
            ApiResponse.ListDto(
                rows.map {
                    CompetitionTimingStationDto(
                        timingStation = it.timingStation,
                        name = it.name,
                        type = TimingStationType.valueOf(it.type),
                        distanceMeters = it.distanceMeters,
                    )
                }
            )
        )
    }

    /**
     * Ersetzt die GANZE Liste dieses Wettkampfs: Was nicht mehr dabei ist, wird gelöscht, der Rest
     * angelegt bzw. auf seinen neuen Meter gesetzt. Die Oberfläche denkt in Listen (Kontrollkästchen
     * und Meter-Felder, ein Speichern-Knopf), also ist ein PUT über die Liste die passende Form.
     *
     * Zwei Prüfungen, die die Datenbank so nicht leisten kann: Der Wettkampf muss zu dieser
     * Veranstaltung gehören, und jeder Posten ebenfalls - der Fremdschlüssel kennt die
     * Veranstaltung nicht und ließe den Posten einer fremden Regatta zu; und ein ANZEIGE-Posten
     * gehört gar nicht auf die Strecke, weil er nie selbst erfasst. Derselbe Posten zweimal
     * wird abgewiesen, weil das Schreiben ihn sonst still auf den zuletzt genannten Meter setzte
     * (ein `on conflict do update` je Posten) — eine Liste mit einer Bedeutung, die niemand so
     * gemeint hat.
     */
    fun setCompetitionStations(
        request: CompetitionTimingStationsRequest,
        userId: UUID,
        competitionId: UUID,
        eventId: UUID,
    ): App<CompetitionTimingStationError, ApiResponse.NoData> = KIO.comprehension {
        !ensureCompetitionOfEvent(competitionId, eventId)

        val stationIds = request.stations.map { it.timingStation }
        !KIO.failOn(stationIds.size != stationIds.distinct().size) {
            CompetitionTimingStationError.DuplicateStation
        }

        if (stationIds.isNotEmpty()) {
            val ofEvent = !TimingStationRepo.countOfEvent(eventId, stationIds).orDie()
            !KIO.failOn(ofEvent != stationIds.size) { CompetitionTimingStationError.StationNotFound }

            // Eine Anzeige misst nichts - dieselbe Grenze wie bei der Zeitmarken-Erfassung
            // (StationNotCapturing) und den Geräte-Tokens. Jede Zeile hier IST ein
            // Zwischenzeit-Punkt; eine Anzeige darunter wäre eine Zwischenzeit, an der nie eine
            // Marke ankommt.
            val displays = !TimingStationRepo
                .countOfEventByType(eventId, stationIds, TimingStationType.ANZEIGE).orDie()
            !KIO.failOn(displays > 0) { CompetitionTimingStationError.StationNotCapturing }
        }

        !CompetitionTimingStationRepo.replaceForCompetition(competitionId, request.stations, userId).orDie()

        // Die Strecke hat sich geändert, also auch die Zwischenzeiten, die auf ihr liegen - und
        // zwar SOFORT und nicht erst mit der nächsten Marke. Eine getauschte Reihenfolge zweier
        // Posten ließe sonst Name und Zeit an der falschen Position stehen (angezeigt wird dann
        // keine falsche Distanz, sondern eine vertauschte Strecke), ein nachgetragener Posten
        // bekäme seine längst zugeordneten Marken nie - und beides gar nicht mehr, wenn die
        // Korrektur nach der letzten Marke der Veranstaltung kommt. Genau dann korrigiert man
        // eine Distanz aber typischerweise: abends beim Aufräumen der Ergebnisse.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)
        if (splitsChanged) {
            EventChangeMarker.bump(eventId)
        }

        noData
    }

    /**
     * Der Wettkampf einer fremden Veranstaltung ist hier nicht "verboten", sondern schlicht nicht
     * vorhanden: Die Veranstaltung aus dem Pfad ist der einzige Rahmen, in dem dieser Weg etwas
     * findet.
     */
    private fun ensureCompetitionOfEvent(
        competitionId: UUID,
        eventId: UUID,
    ): App<CompetitionTimingStationError, Unit> = KIO.comprehension {
        val competition = !CompetitionRepo.getRecordById(competitionId).orDie()
            .onNullFail { CompetitionTimingStationError.CompetitionNotFound }
        !KIO.failOn(competition.event != eventId) { CompetitionTimingStationError.CompetitionNotFound }
        KIO.ok(Unit)
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
        // War es eine Streckenmarke, ändert die Rücknahme keine offizielle Zeit, wohl aber die
        // Zwischenzeiten des Bootes - dieselbe Echtzeit-Übernahme, nur für die Marken dazwischen.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)
        if (written || splitsChanged) {
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
        // Mit einer wiederhergestellten Streckenmarke lebt auch ihre Zwischenzeit wieder auf.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)

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
        if (written || stamped || splitsChanged) {
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

        // Mit dem Versuch gehen auch die Zwischenzeiten seiner Boote: Die Bündel-Rücknahme nimmt
        // ausdrücklich auch die Rundenmarken zurück, ihre übernommenen Zeilen dürfen einen
        // verworfenen Versuch nicht überleben.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)

        // Auch ohne aktive Marken prüfen (alle Marken können schon einzeln zurückgenommen sein):
        // Der eigene Ist-Start-Stempel gehört bei der Versuchs-Rücknahme in jedem Fall zurück.
        val retractedStart = !TimingMatchStampService.retractStartOfAttempt(eventId, setupMatchId, userId)

        // Abgeräumte Ergebnisse und der zurückgenommene Laufzustand derselben Rücknahme sind für
        // die öffentlichen Anzeigen EINE Änderung - ein gemeinsamer Bump; ganz ohne Schreibvorgang
        // (Doppelklick auf den Menüpunkt) bleibt es still.
        if (written || retractedStart || splitsChanged) {
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

        val station = !TimingStationRepo.get(deviceToken.station).orDie()
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
        // Genau hier entsteht die Zwischenzeit: Eine Streckenmarke wird zur Zeit eines Bootes,
        // sobald sie zugeordnet ist - und verliert sie wieder, wenn die Zuordnung gelöst wird.
        val splitsChanged = !TimingSplitService.recomputeEvent(eventId, userId)

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
        if (written || stamped || splitsChanged) {
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
