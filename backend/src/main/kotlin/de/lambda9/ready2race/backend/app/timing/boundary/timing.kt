package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.ComputeOfficialTimesRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.OfficialTimeOverrideRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingAutoApplyRequest
import de.lambda9.ready2race.backend.app.timing.entity.PushOfficialTimesRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingDeviceTokenRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeAssignmentRequest
import de.lambda9.ready2race.backend.app.timing.entity.TimingModeRequest
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
        // Schreibende Endpunkte (außer dem Zeitmarken-POST mit seiner Posten-Bindung) verlangen
        // weiterhin eine Sitzung.
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
                    TimingMatchService.getMatches(eventId)
                }
            }

            // „Start zurücknehmen und neu starten": nimmt alle aktiven Startmarken der Partie in
            // einem Griff zurück. Wie die Einzel-Rücknahme nur mit Nutzersitzung — Geräte-Tokens
            // nehmen keine Ergebnisse zurück.
            post("/{matchId}/retractStartMarks") {
                call.respondComprehension {
                    val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val matchId = !pathParam("matchId", uuid)
                    TimingService.retractMatchStartMarks(matchId, eventId, user.id!!)
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

        route("/modeAssignments") {

            get {
                call.respondComprehension {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingModeService.getModeAssignments(eventId)
                }
            }

            // Upsert über den natürlichen Schlüssel (Wettkampf, Runde) - timingMode null räumt den
            // Eintrag ab. Ein PUT statt POST/DELETE-Paar, siehe TimingModeAssignmentRequest.
            put {
                call.respondComprehension {
                    val user = !authenticate(Privilege.UpdateEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    val body = !receiveKIO(TimingModeAssignmentRequest.example)
                    TimingModeService.upsertModeAssignment(body, user.id!!, eventId)
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

        // Der Schalter „Automatische Übernahme": gelesen mit denselben Sitzungsrechten wie die
        // übrigen Leitstand-Daten, geschaltet nur mit UPDATE EVENT - der PUT schreibt bei
        // enabled=true den aufgelaufenen Stand an die Läufe nach.
        route("/autoApply") {

            get {
                call.respondComprehension {
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingOfficialTimeService.getAutoApply(eventId)
                }
            }

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
