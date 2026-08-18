package de.lambda9.ready2race.backend.app.timing.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.timing.entity.AssignTimeMarkRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateSequenceRequest
import de.lambda9.ready2race.backend.app.timing.entity.CreateTimeMarkRequest
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

        get("/state") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                TimingService.getState(eventId)
            }
        }

        get("/teams") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                TimingService.getTeams(eventId)
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
                    !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.ReadEventGlobal)
                    val eventId = !pathParam("eventId", uuid)
                    TimingService.getStations(eventId)
                }
            }

            route("/{stationId}") {

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

                put("/assignment") {
                    call.respondComprehension {
                        val user = !authenticateAny(Privilege.UpdateAppTimingGlobal, Privilege.UpdateEventGlobal)
                        val eventId = !pathParam("eventId", uuid)
                        val timeMarkId = !pathParam("timeMarkId", uuid)
                        val body = !receiveKIO(AssignTimeMarkRequest.example)
                        TimingService.assignTimeMark(body, user.id!!, timeMarkId, eventId)
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
                    !authenticateAny(
                        Privilege.UpdateAppTimingGlobal,
                        Privilege.UpdateEventGlobal,
                        Privilege.ReadEventGlobal,
                    )
                    val eventId = !pathParam("eventId", uuid)
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
