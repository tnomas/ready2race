package de.lambda9.ready2race.backend.app.stream.boundary

import de.lambda9.ready2race.backend.app.auth.entity.Privilege
import de.lambda9.ready2race.backend.app.stream.entity.StreamGraphicType
import de.lambda9.ready2race.backend.app.stream.entity.StreamOverrideRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneGraphicsRequest
import de.lambda9.ready2race.backend.app.stream.entity.StreamSceneRequest
import de.lambda9.ready2race.backend.app.timing.boundary.TIMING_DEVICE_TOKEN_HEADER
import de.lambda9.ready2race.backend.app.timing.boundary.TimingDeviceTokenService
import de.lambda9.ready2race.backend.calls.requests.authenticateAny
import de.lambda9.ready2race.backend.calls.requests.pathParam
import de.lambda9.ready2race.backend.calls.requests.queryParam
import de.lambda9.ready2race.backend.calls.requests.receiveKIO
import de.lambda9.ready2race.backend.calls.responses.ApiResponse
import de.lambda9.ready2race.backend.calls.responses.respondComprehension
import de.lambda9.ready2race.backend.parsing.Parser.Companion.enum
import de.lambda9.ready2race.backend.parsing.Parser.Companion.uuid
import de.lambda9.ready2race.backend.sessions.UserSession
import de.lambda9.tailwind.core.KIO
import io.ktor.server.request.*
import io.ktor.server.routing.*
import io.ktor.server.sessions.*

/**
 * Livestream-Regie (Task 6 der Domäne `app/stream`): Szenen-Verwaltung, Grafik-Konfiguration,
 * Regie-Eingriffe, Probemodus und Szenen-Token — reine Verdrahtung von Auth und Pfad-/Rumpf-
 * Parsing auf [StreamSceneService] (Muster `liveDashboard.kt`). Jede szenen-adressierte Route
 * lässt [StreamSceneService.requireOwnedScene] (bzw. dessen Aufruf innerhalb der jeweiligen
 * Service-Funktion) prüfen, dass die `sceneId` wirklich zur `eventId` aus dem Pfad gehört.
 *
 * Lese-Rechte akzeptieren READ STREAM oder READ EVENT, Schreib-Rechte UPDATE STREAM oder
 * UPDATE EVENT — dieselbe Gleichrangigkeit wie beim Board-Rechtepaar (siehe eventInfo.kt): eine
 * Sprecher- oder Streamer-Rolle kann die Regie bedienen, ohne das breite UPDATE EVENT zu
 * brauchen, bestehende Event-Rollen verlieren aber nichts.
 */
fun Route.stream() {
    route("/event/{eventId}/stream") {
        get {
            call.respondComprehension {
                !authenticateAny(Privilege.ReadStreamGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                StreamSceneService.getScenes(eventId)
            }
        }

        post {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val request = !receiveKIO(StreamSceneRequest.example)

                StreamSceneService.createScene(eventId, request)
            }
        }

        // Deklariert VOR "/{sceneId}"-Routen: "matches" ist ein fester Pfadteil, kein Ktor
        // will ihn also nie als sceneId lesen, egal wie sich die Reihenfolge hier verschiebt
        // (statische Segmente gewinnen in Ktors Routing-Baum grundsätzlich gegen Parameter) -
        // die Position hier ist nur Lesbarkeit, keine Notwendigkeit.
        get("/matches") {
            call.respondComprehension {
                !authenticateAny(Privilege.ReadStreamGlobal, Privilege.ReadEventGlobal)
                val eventId = !pathParam("eventId", uuid)

                StreamSceneService.getPickerMatches(eventId)
            }
        }

        put("/{sceneId}") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val request = !receiveKIO(StreamSceneRequest.example)

                StreamSceneService.updateScene(eventId, sceneId, request)
            }
        }

        delete("/{sceneId}") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)

                StreamSceneService.deleteScene(eventId, sceneId)
            }
        }

        put("/{sceneId}/graphics") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val request = !receiveKIO(StreamSceneGraphicsRequest.example)

                StreamSceneService.updateGraphics(eventId, sceneId, request.graphics)
            }
        }

        // "Link anklicken = Token ausgestellt": Muster createBoardShareLink - Wiederverwendung
        // statt Inflation, erst nach einem Widerruf stellt der nächste Klick ein frisches aus.
        post("/{sceneId}/shareLink") {
            call.respondComprehension {
                val user = !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)

                StreamSceneService.createShareLink(eventId, sceneId, user.id!!)
            }
        }

        put("/{sceneId}/override/{graphicType}") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val graphicType = !pathParam("graphicType", enum<StreamGraphicType>())
                val request = !receiveKIO(StreamOverrideRequest.example)

                StreamSceneService.setOverride(eventId, sceneId, graphicType, request)
            }
        }

        delete("/{sceneId}/override/{graphicType}") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val graphicType = !pathParam("graphicType", enum<StreamGraphicType>())

                StreamSceneService.clearOverride(eventId, sceneId, graphicType)
            }
        }

        put("/{sceneId}/trialMode") {
            call.respondComprehension {
                !authenticateAny(Privilege.UpdateStreamGlobal, Privilege.UpdateEventGlobal)
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val trialMode = !queryParam("trialMode") { it.toBoolean() }

                StreamSceneService.setTrialMode(eventId, sceneId, trialMode)
            }
        }

        // Zwei Wege hinein, Muster getBoardView (eventInfo.kt): eine Sitzung mit READ STREAM oder
        // READ EVENT, oder ein für GENAU DIESE Szene ausgestelltes Geräte-Token im Header. Der
        // Token-Zweig greift nur ohne Sitzung - ein angemeldeter Nutzer nimmt immer den
        // Rechte-Weg. `validateForStreamScene` prüft die Zugehörigkeit zur Veranstaltung schon
        // selbst; der Sitzungszweig holt sie sich zusätzlich über `requireOwnedScene`.
        //
        // Der Einstieg trägt dieselbe Nutzlast wie der Szenen-Kanal
        // (`/api/ws/event/{eventId}/stream/{sceneId}`) - damit Bühne und Panel nicht auf den
        // ersten Push warten müssen.
        get("/{sceneId}/view") {
            call.respondComprehension {
                val eventId = !pathParam("eventId", uuid)
                val sceneId = !pathParam("sceneId", uuid)
                val deviceToken = call.request.header(TIMING_DEVICE_TOKEN_HEADER)
                if (deviceToken != null && call.sessions.get<UserSession>()?.token == null) {
                    !TimingDeviceTokenService.validateForStreamScene(deviceToken, eventId, sceneId)
                } else {
                    !authenticateAny(Privilege.ReadStreamGlobal, Privilege.ReadEventGlobal)
                    !StreamSceneService.requireOwnedScene(eventId, sceneId)
                }

                KIO.ok(ApiResponse.Dto(!StreamSceneLogic.buildView(eventId, sceneId)))
            }
        }
    }
}
