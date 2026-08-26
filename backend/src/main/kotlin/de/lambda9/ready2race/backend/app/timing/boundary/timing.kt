package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CompetitionTimingStationsRequest
import de.lambda9.ready2race.backend.app.timing.entity.ComputeOfficialTimesRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeOverrideRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingAutoApplyRequest
import de.lambda9.ready2race.backend.app.timing.entity.PushOfficialTimesRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationArmedRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingToneSetRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingStationRequest
import de.lambda9.ready2race.backend.calls.requests.*
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import de.lambda9.ready2race.backend.sessions.UserSession
import io.ktor.http.ContentType
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*

/** Header a timing device presents instead of a session (see `TimingDeviceTokenService`). */
const val TIMING_DEVICE_TOKEN_HEADER = "X-Timing-Device-Token"

fun Route.timing() {
    route("/timing") {

        // Die Lese-Endpunkte der Boards (Zustand, Teams, Posten, aktive Sequenz) akzeptieren
        // zusätzlich zur Nutzersitzung ein Geräte-Token: geteilte Posten-Links (Erfassung,
        // Startbildschirm) tragen es in der URL und müssen den Veranstaltungszustand lesen
        // können, ohne dass jemand am Gerät angemeldet ist. Wie beim Zeitmarken-POST greift der
        // Token-Zweig nur ohne Sitzung - ein angemeldeter Nutzer nimmt exakt den bisherigen Weg.
        //
        // Lesend genügt die Bindung an die Veranstaltung (`validateForEvent`). Schreibend gibt es
        // genau drei Token-Wege - Zeitmarken-POST, Zuordnung, Scharfschaltung -, und jeder ist
        // zusätzlich an den EIGENEN Posten des Tokens gebunden und weist ANZEIGE-Tokens ab; alles
        // Übrige verlangt weiterhin eine Sitzung.
        get("/state") {
            call.respondComprehension {
                val eventId = !pathParam("eventId", uuid)
                val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                    !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                } else {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                }
                TimingService.getState(eventId)
            }
        }

        // Die Posten-Startliste: Partien der intern gezeiteten Wettkämpfe in Startreihenfolge.
        // Lesend wie /teams - auch mit Geräte-Token, denn Start- und Zielposten laufen auf
        // geteilten Geräten ohne Sitzung.
        route("/matches") {

            get {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    }
                    // Der Posten schneidet seine eigene Liste zu (siehe getMatches); ohne
                    // Parameter - Leitstand, Startbildschirm - bleibt sie vollstaendig.
                    val stationId = !optionalQueryParam("station", uuid)
                    TimingMatchService.getMatches(eventId, stationId)
                }
            }

            // „Start zurücknehmen und neu starten": nimmt den ganzen Versuch der Partie in einem
            // Griff zurück — Start-, Ziel- und Rundenmarken (siehe TimingService.retractMatchAttempt,
            // warum die Zielzeiten mitgehen müssen). Wie die Einzel-Rücknahme nur mit
            // Nutzersitzung — Geräte-Tokens nehmen keine Ergebnisse zurück.
            post("/{matchId}/retractAttempt") {
                call.respondComprehension {
                    val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val matchId = !pathParam("matchId", uuid)
                    TimingService.retractMatchAttempt(matchId, eventId, user.id!!)
                }
            }

            // Der ausdrückliche Fehlstart („Rückruf"): bricht die laufenden Startsequenzen der
            // Partie ab, nimmt den Versuch zurück und meldet den Rückruf zusätzlich als eigenes
            // Signal an die Anzeigen (TimingService.falseStart). Genau dieselben Rechte wie die
            // Versuchs-Rücknahme, weil er genau das mit tut - nur mit Nutzersitzung, nie per
            // Geräte-Token. Abgelehnt, wenn der Zeitnahmetyp der Partie den Rückruf abschaltet.
            post("/{matchId}/falseStart") {
                call.respondComprehension {
                    val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val matchId = !pathParam("matchId", uuid)
                    TimingService.falseStart(matchId, eventId, user.id!!)
                }
            }
        }

        get("/teams") {
            call.respondComprehension {
                val eventId = !pathParam("eventId", uuid)
                val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                    !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                } else {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                }
                TimingService.getTeams(eventId)
            }
        }

        // Zeitnahmetypen sind Konfiguration (wie die Posten): gepflegt mit UPDATE EVENT, gelesen
        // mit denselben Sitzungsrechten wie die übrigen Leitstand-Daten. Kein Geräte-Token-Zweig -
        // die Posten-Boards bekommen den aufgelösten Typ über die Startliste (/matches), nicht
        // über die Rohkonfiguration.
        route("/modes") {

            post {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingModeRequest.example)
                    TimingModeService.addMode(body, user.id!!, eventId)
                }
            }

            get {
                call.respondComprehension {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingModeService.getModes(eventId)
                }
            }

            route("/{modeId}") {

                put {
                    call.respondComprehension {
                        val user = !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val modeId = !pathParam("modeId", uuid)
                        val body = !receiveKIO(TimingModeRequest.example)
                        TimingModeService.updateMode(body, user.id!!, modeId, eventId)
                    }
                }

                delete {
                    call.respondComprehension {
                        !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val modeId = !pathParam("modeId", uuid)
                        TimingModeService.deleteMode(modeId, eventId)
                    }
                }
            }
        }

        // Ton-Sätze: die benannten Klang-Vorlagen der Veranstaltung, aus denen die Zeitnahmetypen
        // wählen. Rechte wie bei den Typen und den Posten - gepflegt mit UPDATE EVENT, gelesen mit
        // denselben Sitzungsrechten wie die übrige Leitstand-Konfiguration. Kein
        // Geräte-Token-Zweig: Die Boards bekommen die Töne aufgelöst über die Startliste und die
        // Einstellungen, nicht über die Rohkonfiguration.
        route("/tone-sets") {

            post {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingToneSetRequest.example)
                    TimingToneSetService.addToneSet(body, user.id!!, eventId)
                }
            }

            get {
                call.respondComprehension {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingToneSetService.getToneSets(eventId)
                }
            }

            route("/{toneSetId}") {

                put {
                    call.respondComprehension {
                        val user = !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val toneSetId = !pathParam("toneSetId", uuid)
                        val body = !receiveKIO(TimingToneSetRequest.example)
                        TimingToneSetService.updateToneSet(body, user.id!!, toneSetId, eventId)
                    }
                }

                delete {
                    call.respondComprehension {
                        !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val toneSetId = !pathParam("toneSetId", uuid)
                        TimingToneSetService.deleteToneSet(toneSetId, eventId)
                    }
                }
            }
        }

        route("/stations") {

            post {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingStationRequest.example)
                    TimingService.addStation(body, user.id!!, eventId)
                }
            }

            get {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    }
                    TimingService.getStations(eventId)
                }
            }

            route("/{stationId}") {

                // "Link anklicken = Token ausgestellt": liefert die fertige Posten-Adresse samt
                // Geräte-Token - beim zweiten Klick DENSELBEN Link (Wiederverwendung statt
                // Inflation), erst nach einem Widerruf im Geräte-Reiter wieder einen frischen.
                // POST trotz Wiederholbarkeit: der erste Aufruf stellt ein Credential aus.
                post("/share-link") {
                    call.respondComprehension {
                        val user = !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val stationId = !pathParam("stationId", uuid)
                        TimingDeviceTokenService.shareLink(eventId, stationId, user.id!!)
                    }
                }

                put {
                    call.respondComprehension {
                        val user = !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val stationId = !pathParam("stationId", uuid)
                        val body = !receiveKIO(TimingStationRequest.example)
                        TimingService.updateStation(body, user.id!!, stationId, eventId)
                    }
                }

                delete {
                    call.respondComprehension {
                        !authenticate(Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val stationId = !pathParam("stationId", uuid)
                        TimingService.deleteStation(stationId, eventId)
                    }
                }

                // Die Scharfschaltung: der Zeitnehmer am geteilten Tablet hat keine Anmeldung,
                // nur den Posten-Link mit seinem Geräte-Token - ohne diesen Zweig wäre die
                // Sicherung genau dort nicht bedienbar, wo sie gebraucht wird. Wie bei den
                // anderen Token-Wegen greift er nur ohne Sitzung; ein angemeldeter Nutzer nimmt
                // exakt den gewohnten Weg.
                //
                // Ein SCHREIBENDER Weg, also die enge Token-Prüfung der Zeitmarken und nicht die
                // der Lesewege: `validate` bindet das Token an genau den Posten aus dem Pfad
                // (hier einfacher als beim Zeitmarken-POST, wo er aus dem Körper kommt), den
                // ANZEIGE-Fall weist der Dienst ab. Sonst entschärfte das Token des Zielpostens
                // den Startposten - und ein Anzeige-Link, der nur lesen darf, wäre der
                // Ausschalter für die Ziellinie.
                //
                // Mit Sitzung reichen die Zeitnahme-Rechte, ReadEventGlobal aber NICHT:
                // Entschärfen sperrt jede zugeordnete Erfassung, das ist kein Lesevorgang.
                // Anders als die Betriebsart (PUT auf den Posten, UPDATE EVENT) ist das Schalten
                // Betrieb, keine Einrichtung - deshalb ein eigener Weg mit eigenen Rechten.
                put("/armed") {
                    call.respondComprehension {
                        val eventId = !pathParam("eventId", uuid)
                        val stationId = !pathParam("stationId", uuid)
                        val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                        val hasSession = call.sessions.get<UserSession>()?.token != null

                        if (deviceToken != null && !hasSession) {
                            val token = !TimingDeviceTokenService.validate(deviceToken, eventId, stationId)
                            val body = !receiveKIO(TimingStationArmedRequest.example)
                            TimingService.setStationArmedByDevice(token, stationId, eventId, body.armed)
                        } else {
                            !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                            val body = !receiveKIO(TimingStationArmedRequest.example)
                            TimingService.setStationArmed(stationId, eventId, body.armed)
                        }
                    }
                }
            }
        }

        route("/timeMarks") {

            // The only path that ever hard-deletes a time mark ("Zeiten löschen"): retracted marks
            // of the event, or of one station when the query param is given. ACTIVE marks are never
            // touched by this endpoint - retracting first is the deliberate step that allows it.
            delete("/retracted") {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val stationId = !optionalQueryParam("station", uuid)
                    TimingOfficialTimeService.deleteRetractedMarks(eventId, stationId)
                }
            }

            post {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    val hasSession = call.sessions.get<UserSession>()?.token != null

                    // Timing hardware cannot hold a session, so it presents a station-scoped device
                    // token instead. The branch is only taken when such a token is present AND no
                    // session exists - a logged-in user's request keeps taking exactly the path it
                    // took before, token header or not.
                    if (deviceToken != null && !hasSession) {
                        val body = !receiveKIO(CreateTimeMarkRequest.example)
                        // Binds the capture to the token's own station: a finish-line device can
                        // never write marks for the start line.
                        !TimingDeviceTokenService.validate(deviceToken, eventId, body.station)
                        TimingService.createHardwareTimeMark(body, eventId)
                    } else {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val body = !receiveKIO(CreateTimeMarkRequest.example)
                        TimingService.createTimeMark(body, user.id!!, eventId)
                    }
                }
            }

            route("/{timeMarkId}") {

                put("/retract") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        TimingService.retractTimeMark(timeMarkId, eventId, user.id!!)
                    }
                }

                // Das Gegenstück zur Rücknahme: RETRACTED -> ACTIVE, die frühere Zuordnung lebt
                // wieder auf und die Echtzeit-Übernahme rechnet sofort nach. Wie die Rücknahme
                // selbst nur mit Nutzersitzung - Geräte-Tokens nehmen keine Ergebnisse zurück und
                // stellen folglich auch keine wieder her.
                put("/reactivate") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        TimingService.reactivateTimeMark(timeMarkId, eventId, user.id!!)
                    }
                }

                put("/assignment") {
                    call.respondComprehension {
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                        val hasSession = call.sessions.get<UserSession>()?.token != null

                        // Klick-Zuordnung am geteilten Posten-Gerät: der Zielposten ordnet eine
                        // Marke direkt beim Stempeln einem Boot zu (und hängt sie bei Verklicken
                        // um), ohne Sitzung. Wie beim Zeitmarken-POST greift der Token-Zweig nur
                        // ohne Sitzung; der Service engt weiter ein (nur Marken des eigenen
                        // Postens, keine ANZEIGE-Tokens). Sitzungen behalten exakt den alten Weg.
                        if (deviceToken != null && !hasSession) {
                            val body = !receiveKIO(AssignTimeMarkRequest.example)
                            val token = !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                            TimingService.assignTimeMarkByDevice(body, token, timeMarkId, eventId)
                        } else {
                            val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                            val body = !receiveKIO(AssignTimeMarkRequest.example)
                            TimingService.assignTimeMark(body, user.id!!, timeMarkId, eventId)
                        }
                    }
                }
            }
        }

        route("/sequences") {

            post {
                call.respondComprehension {
                    val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(CreateSequenceRequest.example)
                    TimingSequenceService.createSequence(body, user.id!!, eventId)
                }
            }

            get("/active") {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(
                            Privilege.UpdateAppTimingGlobal,
                            Privilege.UpdateEventGlobal,
                            Privilege.ReadEventGlobal,
                        )
                    }
                    val stationId = !queryParam("stationId", uuid)
                    TimingSequenceService.getActiveSequence(eventId, stationId)
                }
            }

            route("/{sequenceId}") {

                post("/start") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val sequenceId = !pathParam("sequenceId", uuid)
                        TimingSequenceService.startSequence(sequenceId, user.id!!, eventId)
                    }
                }

                post("/abort") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val sequenceId = !pathParam("sequenceId", uuid)
                        TimingSequenceService.abortSequence(sequenceId, user.id!!, eventId)
                    }
                }

                // Anhalten, Zurücksetzen, Fortsetzen: die drei Griffe der Kulanz-Entscheidung am
                // Start (zu spät angekommenes Boot) - dieselben Rechte wie das Abbrechen, denn es
                // ist derselbe Eingriff in dieselbe laufende Sequenz, nur schonender.
                post("/pause") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val sequenceId = !pathParam("sequenceId", uuid)
                        TimingSequenceService.pauseSequence(sequenceId, user.id!!, eventId)
                    }
                }

                post("/resume") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val sequenceId = !pathParam("sequenceId", uuid)
                        TimingSequenceService.resumeSequence(sequenceId, user.id!!, eventId)
                    }
                }

                post("/rewind") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val sequenceId = !pathParam("sequenceId", uuid)
                        TimingSequenceService.rewindSequence(sequenceId, user.id!!, eventId)
                    }
                }

                post("/entries/{entryId}/skip") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val entryId = !pathParam("entryId", uuid)
                        TimingSequenceService.skipEntry(entryId, user.id!!, eventId)
                    }
                }
            }
        }

        // Die Zeitnahme-Einstellungen als EIN Lese-Endpunkt (Schalter „Automatische Übernahme" +
        // Genauigkeit): lesbar auch mit Geräte-Token, weil die Boards die Genauigkeit für die
        // Anzeige der offiziellen Zeiten brauchen - derselbe Auth-Zweig wie GET /officialTimes.
        // Geschrieben wird getrennt: der Schalter hier per PUT /autoApply, die Genauigkeit über
        // die Zeitnahme-Einstellungen der Veranstaltung (updateEventTimingConfig).
        route("/settings") {

            get {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    }
                    TimingOfficialTimeService.getSettings(eventId)
                }
            }
        }

        // Der Schalter „Automatische Übernahme": geschaltet nur mit UPDATE EVENT - der PUT
        // schreibt bei enabled=true den aufgelaufenen Stand an die Läufe nach. Gelesen wird er
        // über GET /settings (gemeinsamer Fetch mit der Genauigkeit).
        route("/autoApply") {

            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingAutoApplyRequest.example)
                    TimingOfficialTimeService.setAutoApply(eventId, body, user.id!!)
                }
            }
        }

        route("/officialTimes") {

            // Lesend auch mit Geräte-Token: der Zielposten zeigt die offiziellen Zeiten live am
            // Boot, und geteilte Posten-Geräte laufen ohne Sitzung. Der Live-Kanal
            // (officialTimeChanged) akzeptiert dieselben Tokens bereits — dieser GET ist nur der
            // initiale Stand dazu.
            get {
                call.respondComprehension {
                    val eventId = !pathParam("eventId", uuid)
                    val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                    if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                        !TimingDeviceTokenService.validateForEvent(deviceToken, eventId)
                    } else {
                        !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    }
                    TimingOfficialTimeService.getForEvent(eventId)
                }
            }

            post("/compute") {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(ComputeOfficialTimesRequest.example)
                    TimingOfficialTimeService.computeOfficialTimes(eventId, user.id!!, body.teams)
                }
            }

            put("/{competitionMatchTeamId}") {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val teamId = !pathParam("competitionMatchTeamId", uuid)
                    val body = !receiveKIO(OfficialTimeOverrideRequest.example)
                    TimingOfficialTimeService.setOverride(eventId, teamId, body, user.id!!)
                }
            }

            post("/push") {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(PushOfficialTimesRequest.example)
                    TimingOfficialTimeService.pushOfficialTimes(eventId, body, user.id!!)
                }
            }
        }

        route("/deviceTokens") {

            get {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingDeviceTokenService.list(eventId)
                }
            }

            post {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingDeviceTokenRequest.example)
                    TimingDeviceTokenService.issue(eventId, body, user.id!!)
                }
            }

            delete("/{tokenId}") {
                call.respondComprehension {
                    !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val tokenId = !pathParam("tokenId", uuid)
                    TimingDeviceTokenService.revoke(eventId, tokenId)
                }
            }
        }
    }
}

/**
 * Die Posten auf der Strecke EINES Wettkampfs — unterhalb der Wettkampf-Route zu mounten, denn
 * der Meter gehört dem Wettkampf: Derselbe Posten steht für die Langstrecke bei 3000 m und für
 * den Sprint bei 250 m. Der Posten selbst bleibt Sache der Veranstaltung (/timing/stations).
 */
fun Route.competitionTimingStations() {
    route("/timing-stations") {

        get {
            call.respondComprehension {
                !authenticate(Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val competitionId = !pathParam("competitionId", uuid)

                TimingService.getCompetitionStations(competitionId, eventId)
            }
        }

        // Ein PUT über die GANZE Liste: Was fehlt, wird gelöscht. Die Oberfläche hakt Posten an
        // und speichert einmal - nicht je Zeile.
        put {
            call.respondComprehension {
                val user = !authenticate(Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val competitionId = !pathParam("competitionId", uuid)

                val body = !receiveKIO(CompetitionTimingStationsRequest.example)
                TimingService.setCompetitionStations(body, user.id!!, competitionId, eventId)
            }
        }
    }
}

fun Route.timingGlobal() {
    route("/timing") {
        post("/serverTime") {
            call.respondText(
                """{"serverTimeMillis":${System.currentTimeMillis()}}""",
                ContentType.Application.Json,
            )
        }
    }
}
